import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FACTORY_COST_LABEL_BY_BAND,
  FACTORY_LEGACY_COMMAND_LABELS,
  FACTORY_LABELS,
  FACTORY_PROJECTED_PR_LABELS,
  assertFactoryPrStatus
} from "./lib/factory-config.mjs";
import {
  canonicalizePrMetadata,
  extractPrMetadata,
  renderPrBody
} from "./lib/pr-metadata.mjs";
import {
  addLabels,
  commentOnIssue,
  convertPullRequestToDraft,
  getPullRequest,
  markReadyForReview,
  removeLabel,
  updatePullRequest
} from "./lib/github.mjs";

function csv(input) {
  return `${input || ""}`
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBoolean(input) {
  return `${input || ""}`.toLowerCase() === "true";
}

function hasLabel(labels, labelName) {
  return labels.some((label) => label.name === labelName);
}

function applyCostMetadataField(metadata, key, envValue, { numeric = false } = {}) {
  if (envValue === undefined) {
    return metadata;
  }

  const normalized = `${envValue || ""}`.trim();

  if (!normalized || normalized === "__UNCHANGED__") {
    return metadata;
  }

  return {
    ...metadata,
    [key]: numeric ? Number(normalized) : normalized
  };
}

export function resolveNextStatus(metadataStatus, envStatus) {
  const requestedStatus = `${envStatus || ""}`.trim();

  if (requestedStatus) {
    return assertFactoryPrStatus(requestedStatus, "FACTORY_STATUS");
  }

  return assertFactoryPrStatus(metadataStatus, "existing PR metadata status");
}

export function applyTransientRetryAttempts(metadata, envValue) {
  const nextMetadata = {
    ...metadata
  };

  if (envValue !== undefined) {
    const transientRetryAttempts = `${envValue || ""}`.trim();

    if (transientRetryAttempts && transientRetryAttempts !== "__UNCHANGED__") {
      nextMetadata.transientRetryAttempts = Number(transientRetryAttempts);
    }
  }

  return nextMetadata;
}

export function applyPendingReviewSha(metadata, envValue) {
  if (envValue === undefined) {
    return metadata;
  }

  const pendingValue = `${envValue || ""}`.trim();

  if (pendingValue === "__UNCHANGED__") {
    return metadata;
  }

  const nextMetadata = {
    ...metadata
  };

  if (!pendingValue || pendingValue === "__CLEAR__") {
    nextMetadata.pendingReviewSha = null;
  } else {
    nextMetadata.pendingReviewSha = pendingValue;
  }

  return nextMetadata;
}

export function applyCostEstimateMetadata(metadata, env = {}) {
  let nextMetadata = { ...metadata };

  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costEstimateUsd",
    env.FACTORY_COST_ESTIMATE_USD,
    { numeric: true }
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costEstimateBand",
    env.FACTORY_COST_ESTIMATE_BAND
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costEstimateEmoji",
    env.FACTORY_COST_ESTIMATE_EMOJI
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costWarnUsd",
    env.FACTORY_COST_WARN_USD,
    { numeric: true }
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costHighUsd",
    env.FACTORY_COST_HIGH_USD,
    { numeric: true }
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "costPricingSource",
    env.FACTORY_COST_PRICING_SOURCE
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "lastEstimatedStage",
    env.FACTORY_LAST_ESTIMATED_STAGE
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "lastEstimatedModel",
    env.FACTORY_LAST_ESTIMATED_MODEL
  );
  nextMetadata = applyCostMetadataField(
    nextMetadata,
    "lastStageCostEstimateUsd",
    env.FACTORY_LAST_STAGE_COST_ESTIMATE_USD,
    { numeric: true }
  );

  return nextMetadata;
}

export function canonicalizeUpdatedMetadata(metadata) {
  return canonicalizePrMetadata(metadata, metadata?.issueNumber);
}

export function applyPaused(metadata, envValue) {
  if (envValue === undefined || `${envValue}`.trim() === "__UNCHANGED__") {
    return metadata;
  }

  return {
    ...metadata,
    paused: parseBoolean(envValue)
  };
}

export function buildProjectedLabels(metadata) {
  const labels = [FACTORY_LABELS.managed];

  if (metadata?.status === "plan_ready") {
    labels.push(FACTORY_LABELS.planReady);
  }

  if (metadata?.status === "blocked") {
    labels.push(FACTORY_LABELS.blocked);
  }

  if (metadata?.paused) {
    labels.push(FACTORY_LABELS.paused);
  }

  const costLabel = FACTORY_COST_LABEL_BY_BAND[metadata?.costEstimateBand];

  if (costLabel) {
    labels.push(costLabel);
  }

  return labels;
}

function applyStageCounter(metadata, envValue, key) {
  if (envValue === undefined) {
    return metadata;
  }

  const normalized = `${envValue ?? ""}`.trim();

  if (normalized === "__UNCHANGED__") {
    return metadata;
  }

  if (!normalized) {
    return {
      ...metadata,
      [key]: 0
    };
  }

  const parsed = Number(normalized);

  if (Number.isNaN(parsed)) {
    return metadata;
  }

  return {
    ...metadata,
    [key]: parsed
  };
}

export function applyLastReviewArtifactFailure(metadata, envValue) {
  if (envValue === undefined) {
    return metadata;
  }

  const normalized = `${envValue ?? ""}`.trim();

  if (!normalized || normalized === "__CLEAR__") {
    return {
      ...metadata,
      lastReviewArtifactFailure: null
    };
  }

  if (normalized === "__UNCHANGED__") {
    return metadata;
  }

  let parsed;

  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("FACTORY_LAST_REVIEW_ARTIFACT_FAILURE must be valid JSON when provided");
  }

  return {
    ...metadata,
    lastReviewArtifactFailure: parsed
  };
}

export function applyBlockedAction(metadata, envValue) {
  if (envValue === undefined) {
    return metadata;
  }

  const normalized = `${envValue ?? ""}`.trim();

  if (normalized === "__UNCHANGED__") {
    return metadata;
  }

  return {
    ...metadata,
    blockedAction: normalized ? normalized : null
  };
}

export async function main(env = process.env) {
  const prNumber = Number(env.FACTORY_PR_NUMBER);
  const pullRequest = await getPullRequest(prNumber);
  const metadata = extractPrMetadata(pullRequest.body) || {};
  const repositoryUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  let nextMetadata = {
    ...metadata,
    status: resolveNextStatus(metadata.status, env.FACTORY_STATUS)
  };

  if (env.FACTORY_REPAIR_ATTEMPTS !== undefined) {
    nextMetadata.repairAttempts = Number(env.FACTORY_REPAIR_ATTEMPTS);
  }

  if (
    env.FACTORY_LAST_FAILURE_SIGNATURE !== undefined &&
    env.FACTORY_LAST_FAILURE_SIGNATURE !== "__UNCHANGED__"
  ) {
    nextMetadata.lastFailureSignature =
      env.FACTORY_LAST_FAILURE_SIGNATURE || null;
  }

  if (env.FACTORY_REPEATED_FAILURE_COUNT !== undefined) {
    nextMetadata.repeatedFailureCount = Number(
      env.FACTORY_REPEATED_FAILURE_COUNT
    );
  }

  if (env.FACTORY_LAST_READY_SHA !== undefined) {
    if (env.FACTORY_LAST_READY_SHA !== "__UNCHANGED__") {
      nextMetadata.lastReadySha = env.FACTORY_LAST_READY_SHA || null;
    }
  }

  if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== undefined) {
    if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== "__UNCHANGED__") {
      nextMetadata.lastProcessedWorkflowRunId =
        env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID || null;
    }
  }

  if (env.FACTORY_LAST_FAILURE_TYPE !== undefined) {
    if (env.FACTORY_LAST_FAILURE_TYPE !== "__UNCHANGED__") {
      nextMetadata.lastFailureType = env.FACTORY_LAST_FAILURE_TYPE || null;
    }
  }

  nextMetadata = applyBlockedAction(nextMetadata, env.FACTORY_BLOCKED_ACTION);

  nextMetadata = applyLastReviewArtifactFailure(
    nextMetadata,
    env.FACTORY_LAST_REVIEW_ARTIFACT_FAILURE
  );

  nextMetadata = applyTransientRetryAttempts(
    nextMetadata,
    env.FACTORY_TRANSIENT_RETRY_ATTEMPTS
  );

  if (env.FACTORY_LAST_REFRESHED_SHA !== undefined) {
    if (env.FACTORY_LAST_REFRESHED_SHA !== "__UNCHANGED__") {
      nextMetadata.lastRefreshedSha = env.FACTORY_LAST_REFRESHED_SHA || null;
    }
  }

  nextMetadata = applyPendingReviewSha(nextMetadata, env.FACTORY_PENDING_REVIEW_SHA);
  nextMetadata = applyCostEstimateMetadata(nextMetadata, env);
  nextMetadata = applyPaused(nextMetadata, env.FACTORY_PAUSED);
  nextMetadata = applyStageCounter(nextMetadata, env.FACTORY_STAGE_NOOP_ATTEMPTS, "stageNoopAttempts");
  nextMetadata = applyStageCounter(nextMetadata, env.FACTORY_STAGE_SETUP_ATTEMPTS, "stageSetupAttempts");
  nextMetadata = canonicalizeUpdatedMetadata(nextMetadata);

  const body = renderPrBody({
    issueNumber: nextMetadata.issueNumber,
    branch: pullRequest.head.ref,
    repositoryUrl,
    artifactsPath: nextMetadata.artifactsPath,
    metadata: nextMetadata,
    ciStatus: env.FACTORY_CI_STATUS || "pending"
  });

  await updatePullRequest({ prNumber, body });

  const existingProjectedLabels = [
    ...FACTORY_PROJECTED_PR_LABELS,
    ...FACTORY_LEGACY_COMMAND_LABELS
  ].filter((label, index, labels) => labels.indexOf(label) === index);
  const currentProjectedLabels = pullRequest.labels
    .map((label) => label.name)
    .filter((label) => existingProjectedLabels.includes(label));
  const nextProjectedLabels = buildProjectedLabels(nextMetadata);

  for (const label of currentProjectedLabels) {
    if (!nextProjectedLabels.includes(label)) {
      await removeLabel(prNumber, label);
    }
  }

  for (const label of nextProjectedLabels) {
    if (!hasLabel(pullRequest.labels, label)) {
      await addLabels(prNumber, [label]);
    }
  }

  if (parseBoolean(env.FACTORY_READY_FOR_REVIEW) && pullRequest.draft) {
    await markReadyForReview(pullRequest.node_id);
  }

  if (parseBoolean(env.FACTORY_CONVERT_TO_DRAFT) && !pullRequest.draft) {
    await convertPullRequestToDraft(pullRequest.node_id);
  }

  if (env.FACTORY_COMMENT) {
    await commentOnIssue(prNumber, env.FACTORY_COMMENT);
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
