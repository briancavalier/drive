import { DEFAULT_MAX_REPAIR_ATTEMPTS, FACTORY_PR_STATUSES, issueArtifactsPath } from "./factory-config.mjs";

export function defaultFailureInterventionPayload(overrides = {}) {
  return {
    failureType: null,
    failureSignature: null,
    retryAttempts: 0,
    repeatedFailureCount: 0,
    stageNoopAttempts: 0,
    stageSetupAttempts: 0,
    transientRetryAttempts: 0,
    reviewArtifactFailure: null,
    ...overrides
  };
}

export function defaultFailureIntervention(overrides = {}) {
  const payload = defaultFailureInterventionPayload(overrides.payload);

  return {
    id: null,
    type: "failure",
    status: "open",
    stage: null,
    blocking: true,
    summary: "",
    detail: "",
    createdAt: null,
    runId: null,
    runUrl: null,
    payload,
    resolution: null,
    ...overrides,
    payload
  };
}

export function canonicalizeIntervention(intervention) {
  if (!intervention) {
    return null;
  }

  if (`${intervention.type || ""}`.trim() === "failure") {
    return defaultFailureIntervention(intervention);
  }

  return intervention;
}

export function defaultPrMetadata(overrides = {}) {
  return {
    issueNumber: null,
    artifactsPath: null,
    status: FACTORY_PR_STATUSES.planning,
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastFailureSignature: null,
    repeatedFailureCount: 0,
    lastReadySha: null,
    lastProcessedWorkflowRunId: null,
    lastFailureType: null,
    blockedAction: null,
    lastReviewArtifactFailure: null,
    transientRetryAttempts: 0,
    lastRefreshedSha: null,
    pendingReviewSha: null,
    paused: false,
    lastCompletedStage: null,
    lastRunId: null,
    lastRunUrl: null,
    pauseReason: null,
    costEstimateUsd: 0,
    costEstimateBand: "",
    costEstimateEmoji: "",
    costWarnUsd: 0,
    costHighUsd: 0,
    costPricingSource: "",
    lastEstimatedStage: null,
    lastEstimatedModel: null,
    lastStageCostEstimateUsd: 0,
    stageNoopAttempts: 0,
    stageSetupAttempts: 0,
    intervention: null,
    ...overrides,
    intervention: canonicalizeIntervention(overrides.intervention ?? null)
  };
}

function normalizeIssueNumber(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function canonicalizePrMetadataShape(metadata = {}, issueNumber = metadata?.issueNumber) {
  const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
  const canonicalArtifactsPath = normalizedIssueNumber
    ? issueArtifactsPath(normalizedIssueNumber)
    : metadata.artifactsPath ?? null;

  return defaultPrMetadata({
    ...metadata,
    issueNumber: normalizedIssueNumber ?? metadata.issueNumber ?? null,
    artifactsPath: canonicalArtifactsPath,
    intervention: canonicalizeIntervention(metadata.intervention)
  });
}
