import {
  FACTORY_ACTIVE_CI_STATUSES,
  FACTORY_IMPLEMENT_TRIGGER_STATUSES,
  FACTORY_LABELS,
  FACTORY_REVIEW_REPAIRABLE_STATUSES,
  isFactoryBranch
} from "./factory-config.mjs";
import { extractPrMetadata } from "./pr-metadata.mjs";
import { nextRepairState } from "./repair-state.mjs";

function hasLabel(labels, labelName) {
  return labels.some((label) => label.name === labelName);
}

function isManaged(labels, branchName, metadata) {
  return (
    isFactoryBranch(branchName) &&
    Boolean(metadata?.issueNumber) &&
    hasLabel(labels, FACTORY_LABELS.managed) &&
    !hasLabel(labels, FACTORY_LABELS.paused) &&
    !hasLabel(labels, FACTORY_LABELS.blocked)
  );
}

export function routePullRequestLabeled(payload) {
  const pullRequest = payload.pull_request;
  const metadata = extractPrMetadata(pullRequest.body);

  if (
    payload.action !== "labeled" ||
    payload.label?.name !== FACTORY_LABELS.implement ||
    !FACTORY_IMPLEMENT_TRIGGER_STATUSES.includes(metadata?.status) ||
    !hasLabel(pullRequest.labels, FACTORY_LABELS.implement) ||
    !isManaged(pullRequest.labels, pullRequest.head.ref, metadata)
  ) {
    return { action: "noop" };
  }

  return {
    action: "implement",
    prNumber: pullRequest.number,
    issueNumber: metadata.issueNumber,
    branch: pullRequest.head.ref,
    artifactsPath: metadata.artifactsPath
  };
}

export function routePullRequestReview(payload) {
  const pullRequest = payload.pull_request;
  const metadata = extractPrMetadata(pullRequest.body);

  if (
    payload.action !== "submitted" ||
    payload.review?.state?.toLowerCase() !== "changes_requested" ||
    !FACTORY_REVIEW_REPAIRABLE_STATUSES.includes(metadata?.status) ||
    !isManaged(pullRequest.labels, pullRequest.head.ref, metadata)
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
    issueNumber: metadata.issueNumber,
    branch: pullRequest.head.ref,
    artifactsPath: metadata.artifactsPath,
    reviewId: payload.review.id,
    reviewBody: payload.review.body || "",
    repairState
  };
}

export function routeWorkflowRun({ workflowRun, pullRequest }) {
  if (!pullRequest) {
    return { action: "noop" };
  }

  const metadata = extractPrMetadata(pullRequest.body);

  if (!isManaged(pullRequest.labels, workflowRun.head_branch, metadata)) {
    return { action: "noop" };
  }

  if (workflowRun.event && workflowRun.event !== "pull_request") {
    return { action: "noop" };
  }

  if (
    metadata?.lastProcessedWorkflowRunId &&
    `${metadata.lastProcessedWorkflowRunId}` === `${workflowRun.id}`
  ) {
    return { action: "noop" };
  }

  if (!FACTORY_ACTIVE_CI_STATUSES.includes(metadata?.status)) {
    return { action: "noop" };
  }

  if (workflowRun.conclusion === "success" && metadata?.lastReadySha === workflowRun.head_sha) {
    return { action: "noop" };
  }

  if (workflowRun.conclusion === "success") {
    return {
      action: "review",
      prNumber: pullRequest.number,
      issueNumber: metadata.issueNumber,
      branch: workflowRun.head_branch,
      artifactsPath: metadata.artifactsPath,
      ciRunId: workflowRun.id
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
    issueNumber: metadata.issueNumber,
    branch: workflowRun.head_branch,
    artifactsPath: metadata.artifactsPath,
    ciRunId: workflowRun.id,
    repairState
  };
}
