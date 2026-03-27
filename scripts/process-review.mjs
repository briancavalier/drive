import path from "node:path";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import {
  getPullRequest,
  commentOnIssue,
  submitPullRequestReview
} from "./lib/github.mjs";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import {
  buildReviewConversationBody,
  MAX_REVIEW_BODY_CHARS
} from "./lib/github-messages.mjs";
import {
  classifyFailure,
  FAILURE_TYPES
} from "./lib/failure-classification.mjs";
import { validateTrustedFactoryContext } from "./lib/factory-trust.mjs";
import { loadValidatedReviewArtifacts } from "./lib/review-artifacts.mjs";

function gitRevParse(ref = "HEAD") {
  return execFileSync("git", ["rev-parse", ref], {
    encoding: "utf8"
  }).trim();
}

function requiredEnv(env, name) {
  const value = env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }

  return value;
}

function buildStaleReviewMessage(reason) {
  return `Skipping stale autonomous review delivery: ${reason}`;
}

async function runApplyPrState(execFileAsync, env, envOverrides) {
  const childEnv = {
    ...env,
    ...envOverrides
  };

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: childEnv,
    stdio: "inherit"
  });
}

async function clearPendingReviewSha({
  execFileAsync,
  env,
  ciStatus
}) {
  try {
    await runApplyPrState(execFileAsync, env, {
      FACTORY_PENDING_REVIEW_SHA: "",
      FACTORY_PENDING_STAGE_DECISION: "__CLEAR__",
      FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
      FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false",
      FACTORY_CI_STATUS: `${ciStatus || env.FACTORY_CI_STATUS || ""}`.trim() || "pending",
      FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID: env.FACTORY_CI_RUN_ID || ""
    });
  } catch (error) {
    console.warn(`Failed to clear pending review SHA: ${error.message}`);
  }
}

async function cleanupStaleReviewState({
  execFileAsync,
  env,
  ciStatus,
  liveMetadata,
  ownedHeadSha
}) {
  const livePendingReviewSha = `${liveMetadata?.pendingReviewSha || ""}`.trim();
  const staleWorkerOwnsPendingSha =
    livePendingReviewSha &&
    ownedHeadSha &&
    livePendingReviewSha === ownedHeadSha;

  try {
    await runApplyPrState(execFileAsync, env, {
      FACTORY_PENDING_REVIEW_SHA: staleWorkerOwnsPendingSha ? "" : "__UNCHANGED__",
      FACTORY_PENDING_STAGE_DECISION: "__CLEAR__",
      FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
      FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false",
      FACTORY_CI_STATUS: `${ciStatus || env.FACTORY_CI_STATUS || ""}`.trim() || "pending",
      FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID: "__UNCHANGED__"
    });
  } catch (error) {
    console.warn(`Failed to clean up stale review state: ${error.message}`);
  }
}

async function handlePass({
  review,
  artifactsPath,
  reviewMarkdown,
  prNumber,
  branch,
  repositoryUrl,
  env,
  execFileAsync,
  githubClient
}) {
  let currentHead = "";
  const workflowRunId = `${env.GITHUB_RUN_ID || env.FACTORY_CI_RUN_ID || ""}`.trim();
  const workflowRunUrl =
    workflowRunId && env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${workflowRunId}`
      : "";

  try {
    currentHead = gitRevParse("HEAD");
  } catch (error) {
    currentHead = `${env.FACTORY_LAST_READY_SHA || ""}`.trim();
  }

    await runApplyPrState(execFileAsync, env, {
      FACTORY_STATUS: FACTORY_PR_STATUSES.readyForReview,
      FACTORY_CI_STATUS: "success",
      FACTORY_READY_FOR_REVIEW: "true",
      FACTORY_PENDING_STAGE_DECISION: "__CLEAR__",
      FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
      FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false",
      FACTORY_REMOVE_LABELS: "factory:blocked",
      FACTORY_LAST_READY_SHA: currentHead,
      FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID: env.FACTORY_CI_RUN_ID || "",
      FACTORY_INTERVENTION: "__CLEAR__",
      FACTORY_LAST_REFRESHED_SHA: env.FACTORY_LAST_REFRESHED_SHA || "",
      FACTORY_COMMENT: "",
      FACTORY_CLEAR_IMPLEMENT_LABEL: "false",
    FACTORY_PENDING_REVIEW_SHA: "",
    FACTORY_LAST_COMPLETED_STAGE: "review",
    FACTORY_LAST_RUN_ID: workflowRunId,
    FACTORY_LAST_RUN_URL: workflowRunUrl
  });

  const comment = buildReviewConversationBody({
    review,
    reviewMarkdown,
    artifactsPath,
    repositoryUrl,
    branch,
    maxBodyChars: MAX_REVIEW_BODY_CHARS
  });
  await githubClient.commentOnIssue(prNumber, comment);
}

async function handleRequestChanges({
  review,
  reviewMarkdown,
  artifactsPath,
  prNumber,
  branch,
  repositoryUrl,
  githubClient
}) {
  const body = buildReviewConversationBody({
    review,
    reviewMarkdown,
    artifactsPath,
    repositoryUrl,
    branch,
    maxBodyChars: MAX_REVIEW_BODY_CHARS
  });

  await githubClient.submitPullRequestReview({
    prNumber,
    event: "REQUEST_CHANGES",
    body
  });
}

function markProcessReviewFailure(error, classification) {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.factoryFailureType = classification.failureType;
  failure.factoryFailurePhase = classification.failurePhase;
  return failure;
}

export function classifyReviewArtifactsFailure(message) {
  const normalized = `${message || ""}`.trim();

  if (/unable to resolve review methodology/i.test(normalized)) {
    return {
      failureType: FAILURE_TYPES.configuration,
      failurePhase: "review_delivery"
    };
  }

  return {
    failureType: FAILURE_TYPES.reviewArtifactContract,
    failurePhase: "review"
  };
}

export function classifyProcessReviewFailure(error) {
  if (error?.factoryFailureType && error?.factoryFailurePhase) {
    return {
      failureType: error.factoryFailureType,
      failurePhase: error.factoryFailurePhase
    };
  }

  return {
    failureType: classifyFailure(error?.message || ""),
    failurePhase: "review_delivery"
  };
}

export async function processReview({
  env = process.env,
  githubClient = {
    getPullRequest,
    commentOnIssue,
    submitPullRequestReview
  },
  execFileImpl = execFile
} = {}) {
  const shouldValidateLiveState = typeof githubClient?.getPullRequest === "function";
  const resolvedGithubClient = {
    getPullRequest,
    commentOnIssue,
    submitPullRequestReview,
    ...githubClient
  };
  const execFileAsync = promisify(execFileImpl);
  const prNumber = Number(requiredEnv(env, "FACTORY_PR_NUMBER"));
  const issueNumber = Number(requiredEnv(env, "FACTORY_ISSUE_NUMBER"));
  const artifactsPath = requiredEnv(env, "FACTORY_ARTIFACTS_PATH");
  const branch = requiredEnv(env, "FACTORY_BRANCH");
  const requestedMethod = env.FACTORY_REVIEW_METHOD || "";
  const expectedCiRunId = `${env.FACTORY_CI_RUN_ID || ""}`.trim();
  const currentHead = gitRevParse("HEAD");
  const repositoryUrl =
    env.FACTORY_REPOSITORY_URL ||
    (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
      : "");

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("FACTORY_PR_NUMBER must be a positive integer");
  }

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("FACTORY_ISSUE_NUMBER must be a positive integer");
  }

  if (shouldValidateLiveState) {
    const livePullRequest = await resolvedGithubClient.getPullRequest(prNumber);
    const trustedContext = validateTrustedFactoryContext({
      payload: {
        repositoryFullName: env.GITHUB_REPOSITORY || ""
      },
      pullRequest: livePullRequest,
      candidateBranch: branch,
      candidateIssueNumber: issueNumber,
      candidateArtifactsPath: artifactsPath
    });

    if (!trustedContext.trusted) {
      const message = buildStaleReviewMessage(trustedContext.reason);
      await cleanupStaleReviewState({
        execFileAsync,
        env,
        liveMetadata: trustedContext.metadata,
        ownedHeadSha: currentHead
      });
      console.log(message);
      return;
    }

    const metadata = trustedContext.metadata || {};
    if (metadata.status !== FACTORY_PR_STATUSES.reviewing) {
      const message = buildStaleReviewMessage(
        `PR status is ${metadata.status || "unknown"} instead of ${FACTORY_PR_STATUSES.reviewing}`
      );
      await cleanupStaleReviewState({
        execFileAsync,
        env,
        liveMetadata: metadata,
        ownedHeadSha: currentHead
      });
      console.log(message);
      return;
    }

    if (
      expectedCiRunId &&
      `${metadata.lastProcessedWorkflowRunId || ""}`.trim() &&
      `${metadata.lastProcessedWorkflowRunId}` !== expectedCiRunId
    ) {
      const message = buildStaleReviewMessage(
        `last processed workflow run ${metadata.lastProcessedWorkflowRunId} no longer matches ${expectedCiRunId}`
      );
      await cleanupStaleReviewState({
        execFileAsync,
        env,
        liveMetadata: metadata,
        ownedHeadSha: currentHead
      });
      console.log(message);
      return;
    }

    if (`${livePullRequest.head?.sha || ""}`.trim() !== currentHead) {
      const message = buildStaleReviewMessage(
        `PR head ${livePullRequest.head?.sha || "unknown"} no longer matches local review head ${currentHead}`
      );
      await cleanupStaleReviewState({
        execFileAsync,
        env,
        liveMetadata: metadata,
        ownedHeadSha: currentHead
      });
      console.log(message);
      return;
    }
  }

  let review;
  let reviewMarkdown;
  try {
    try {
      ({ review, reviewMarkdown } = loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: requestedMethod
      }));
    } catch (error) {
      throw markProcessReviewFailure(
        error,
        classifyReviewArtifactsFailure(error?.message || "")
      );
    }

    console.log(
      `Processing autonomous review for PR #${prNumber} on branch ${branch} (methodology: ${review.methodology}, decision: ${review.decision})`
    );

    if (review.decision === "pass") {
      await handlePass({
        review,
        artifactsPath,
        reviewMarkdown,
        prNumber,
        branch,
        repositoryUrl,
        env,
        execFileAsync,
        githubClient: resolvedGithubClient
      });
      console.log("Autonomous review passed. PR marked ready for human review.");
      return;
    }

    await handleRequestChanges({
      review,
      reviewMarkdown,
      artifactsPath,
      prNumber,
      branch,
      repositoryUrl,
      githubClient: resolvedGithubClient
    });
    await clearPendingReviewSha({
      execFileAsync,
      env
    });
    console.log(
      "Autonomous review requested changes. Submitted REQUEST_CHANGES review to trigger repair."
    );
  } catch (error) {
    await clearPendingReviewSha({
      execFileAsync,
      env
    });
    throw error;
  }
}

export async function main(options = {}) {
  try {
    await processReview(options);
    setOutputs({
      failure_message: "",
      failure_type: "",
      failure_phase: ""
    });
  } catch (error) {
    const { failureType, failurePhase } = classifyProcessReviewFailure(error);
    setOutputs({
      failure_message: `${error.message || ""}`.trim(),
      failure_type: failureType,
      failure_phase: failurePhase
    });
    console.error(error.message);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
