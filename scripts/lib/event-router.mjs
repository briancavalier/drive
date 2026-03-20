import {
  FACTORY_ACTIVE_CI_STATUSES,
  FACTORY_COMMANDS,
  FACTORY_LABELS,
  FACTORY_PR_STATUSES,
  FACTORY_RESETTABLE_PR_STATUSES,
  FACTORY_REVIEW_REPAIRABLE_STATUSES,
  FACTORY_RESUMABLE_FAILURE_TYPES,
  isFactoryBranch
} from "./factory-config.mjs";
import {
  getFactoryCommentContext,
  parseFactorySlashCommand
} from "./factory-command.mjs";
import {
  validateFactoryRepoTrust,
  validateTrustedFactoryContext
} from "./factory-trust.mjs";
import { nextRepairState } from "./repair-state.mjs";

export { validateFactoryRepoTrust, validateTrustedFactoryContext } from "./factory-trust.mjs";

const TRUSTED_REVIEW_PERMISSIONS = new Set(["write", "maintain", "admin"]);
const TRUSTED_AUTOMATION_REVIEWERS = new Set(["github-actions[bot]", "app/github-actions"]);

function hasLabel(labels, labelName) {
  return labels.some((label) => label.name === labelName);
}

function logRepoTrustNoop(trigger, reason) {
  console.info(`Ignoring ${trigger}: ${reason}.`);
}

function hasTrustedCollaboratorPermission(permission) {
  return TRUSTED_REVIEW_PERMISSIONS.has(`${permission || ""}`.trim().toLowerCase());
}

function resolvePausedResumeAction(metadata = {}) {
  const status = `${metadata.status || ""}`.trim();

  if (status === FACTORY_PR_STATUSES.planReady || status === FACTORY_PR_STATUSES.implementing) {
    return FACTORY_COMMANDS.implement;
  }

  if (status === FACTORY_PR_STATUSES.repairing) {
    return "repair";
  }

  if (status === FACTORY_PR_STATUSES.reviewing) {
    return "review";
  }

  return "";
}

function isManaged(labels, branchName, metadata, { allowPaused = false, allowBlocked = false } = {}) {
  return (
    isFactoryBranch(branchName) &&
    Boolean(metadata?.issueNumber) &&
    hasLabel(labels, FACTORY_LABELS.managed) &&
    (allowPaused || !metadata?.paused) &&
    (allowBlocked || metadata?.status !== FACTORY_PR_STATUSES.blocked)
  );
}

export function isTrustedReviewTrigger({ reviewerLogin, reviewerPermission } = {}) {
  const normalizedLogin = `${reviewerLogin || ""}`.trim();
  const normalizedPermission = `${reviewerPermission || ""}`.trim().toLowerCase();

  return (
    TRUSTED_AUTOMATION_REVIEWERS.has(normalizedLogin) ||
    TRUSTED_REVIEW_PERMISSIONS.has(normalizedPermission)
  );
}

export async function routeIssueComment(payload, githubClient = {}) {
  if (payload.action !== "created") {
    return { action: "noop" };
  }

  const context = getFactoryCommentContext(payload);
  const parsedCommand = parseFactorySlashCommand(payload.comment?.body, context);

  if (!parsedCommand) {
    return { action: "noop" };
  }

  const commenterLogin = payload.comment?.user?.login || payload.sender?.login || "";
  let commenterPermission = "";

  if (commenterLogin && githubClient.getCollaboratorPermission) {
    try {
      commenterPermission =
        (await githubClient.getCollaboratorPermission(commenterLogin))?.permission || "";
    } catch {
      commenterPermission = "";
    }
  }

  if (!hasTrustedCollaboratorPermission(commenterPermission)) {
    return { action: "noop" };
  }

  if (context === "issue") {
    if (parsedCommand.command !== FACTORY_COMMANDS.start) {
      return { action: "noop" };
    }

    return {
      action: FACTORY_COMMANDS.start,
      issueNumber: payload.issue?.number || ""
    };
  }

  const pullRequestNumber = payload.issue?.number;
  const pullRequest = pullRequestNumber
    ? await githubClient.getPullRequest?.(pullRequestNumber)
    : null;
  const trustedContext = validateTrustedFactoryContext({ payload, pullRequest });

  if (!trustedContext.trusted) {
    logRepoTrustNoop("factory PR command", trustedContext.reason);
    return { action: "noop" };
  }

  const metadata = trustedContext.metadata;
  const managed = isManaged(pullRequest.labels, pullRequest.head.ref, metadata, {
    allowPaused: true,
    allowBlocked: true
  });

  if (!managed) {
    return { action: "noop" };
  }

  if (parsedCommand.command === FACTORY_COMMANDS.implement) {
    if (metadata?.status !== FACTORY_PR_STATUSES.planReady) {
      return { action: "noop" };
    }

    return {
      action: FACTORY_COMMANDS.implement,
      prNumber: pullRequest.number,
      issueNumber: trustedContext.issueNumber,
      branch: trustedContext.branch,
      artifactsPath: trustedContext.artifactsPath,
      stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
      stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
    };
  }

  if (parsedCommand.command === FACTORY_COMMANDS.resume) {
    if (metadata?.paused) {
      const resumedAction = resolvePausedResumeAction(metadata);

      if (!resumedAction) {
        return { action: "noop" };
      }

      return {
        action: resumedAction,
        prNumber: pullRequest.number,
        issueNumber: trustedContext.issueNumber,
        branch: trustedContext.branch,
        artifactsPath: trustedContext.artifactsPath,
        stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
        stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
      };
    }

    if (
      metadata?.status !== FACTORY_PR_STATUSES.blocked ||
      !FACTORY_RESUMABLE_FAILURE_TYPES.includes(metadata?.lastFailureType || "") ||
      ![FACTORY_COMMANDS.implement, "repair", "review"].includes(metadata?.blockedAction || "")
    ) {
      return { action: "noop" };
    }

    return {
      action: metadata.blockedAction,
      prNumber: pullRequest.number,
      issueNumber: trustedContext.issueNumber,
      branch: trustedContext.branch,
      artifactsPath: trustedContext.artifactsPath,
      stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
      stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
    };
  }

  if (parsedCommand.command === FACTORY_COMMANDS.reset) {
    if (!FACTORY_RESETTABLE_PR_STATUSES.includes(metadata?.status)) {
      return { action: "noop" };
    }

    return {
      action: FACTORY_COMMANDS.reset,
      prNumber: pullRequest.number
    };
  }

  if (parsedCommand.command === FACTORY_COMMANDS.pause) {
    if (!FACTORY_RESETTABLE_PR_STATUSES.includes(metadata?.status)) {
      return { action: "noop" };
    }

    return {
      action: FACTORY_COMMANDS.pause,
      prNumber: pullRequest.number
    };
  };

  return { action: "noop" };
}

export function routePullRequestReview(payload) {
  const pullRequest = payload.pull_request;
  const trustedContext = validateTrustedFactoryContext({ payload, pullRequest });

  if (!trustedContext.trusted) {
    logRepoTrustNoop("factory review trigger", trustedContext.reason);
    return { action: "noop" };
  }

  const metadata = trustedContext.metadata;
  const reviewerLogin = payload.review?.user?.login || "";
  const reviewerPermission = payload.reviewerPermission;

  if (
    payload.action !== "submitted" ||
    payload.review?.state?.toLowerCase() !== "changes_requested" ||
    !FACTORY_REVIEW_REPAIRABLE_STATUSES.includes(metadata?.status) ||
    !isManaged(pullRequest.labels, pullRequest.head.ref, metadata) ||
    !isTrustedReviewTrigger({ reviewerLogin, reviewerPermission })
  ) {
    return { action: "noop" };
  }

  const repairState = nextRepairState(
    metadata,
    `review:${payload.review.id}:${payload.review.body || ""}`
  );

  return {
    action: repairState.blocked ? "blocked" : "repair",
    prNumber: pullRequest.number,
    issueNumber: trustedContext.issueNumber,
    branch: trustedContext.branch,
    artifactsPath: trustedContext.artifactsPath,
    reviewId: payload.review.id,
    reviewBody: payload.review.body || "",
    repairState,
    stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
    stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
  };
}

export function routeWorkflowRun({ workflowRun, pullRequest }) {
  if (!pullRequest) {
    return { action: "noop" };
  }

  const trustedContext = validateTrustedFactoryContext({
    payload: {
      repositoryFullName:
        workflowRun?.repository?.full_name || pullRequest?.base?.repo?.full_name || ""
    },
    pullRequest,
    candidateBranch: workflowRun.head_branch,
    candidateHeadSha: workflowRun.head_sha
  });

  if (!trustedContext.trusted) {
    logRepoTrustNoop("factory workflow_run trigger", trustedContext.reason);
    return { action: "noop" };
  }

  if (!isManaged(pullRequest.labels, trustedContext.branch, trustedContext.metadata)) {
    return { action: "noop" };
  }

  if (workflowRun.event && workflowRun.event !== "pull_request") {
    return { action: "noop" };
  }

  const metadata = trustedContext.metadata;

  if (
    metadata?.lastProcessedWorkflowRunId &&
    `${metadata.lastProcessedWorkflowRunId}` === `${workflowRun.id}`
  ) {
    return { action: "noop" };
  }

  if (!FACTORY_ACTIVE_CI_STATUSES.includes(metadata?.status)) {
    return { action: "noop" };
  }

  if (
    workflowRun.conclusion === "success" &&
    metadata?.status === FACTORY_PR_STATUSES.reviewing &&
    `${metadata.pendingReviewSha || ""}`.trim() &&
    metadata.pendingReviewSha === workflowRun.head_sha
  ) {
    return { action: "noop" };
  }

  if (workflowRun.conclusion === "success" && metadata?.lastReadySha === workflowRun.head_sha) {
    return { action: "noop" };
  }

  if (workflowRun.conclusion === "success") {
    return {
      action: "review",
      prNumber: pullRequest.number,
      issueNumber: trustedContext.issueNumber,
      branch: trustedContext.branch,
      artifactsPath: trustedContext.artifactsPath,
      ciRunId: workflowRun.id,
      stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
      stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
    };
  }

  if (!["failure", "timed_out", "action_required"].includes(workflowRun.conclusion)) {
    return { action: "noop" };
  }

  const repairState = nextRepairState(
    metadata,
    `ci:${workflowRun.name}:${workflowRun.conclusion}`
  );

  return {
    action: repairState.blocked ? "blocked" : "repair",
    prNumber: pullRequest.number,
    issueNumber: trustedContext.issueNumber,
    branch: trustedContext.branch,
    artifactsPath: trustedContext.artifactsPath,
    ciRunId: workflowRun.id,
    repairState,
    stageNoopAttempts: metadata?.stageNoopAttempts ?? 0,
    stageSetupAttempts: metadata?.stageSetupAttempts ?? 0
  };
}
