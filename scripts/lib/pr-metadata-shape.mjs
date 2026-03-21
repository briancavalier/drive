import { DEFAULT_MAX_REPAIR_ATTEMPTS, FACTORY_PR_STATUSES, issueArtifactsPath } from "./factory-config.mjs";
import {
  canonicalizeIntervention,
  defaultFailureIntervention,
  defaultFailureInterventionPayload
} from "./intervention-state.mjs";

export { canonicalizeIntervention, defaultFailureIntervention, defaultFailureInterventionPayload };

function stripLegacyFailureMetadata(metadata = {}) {
  const {
    lastFailureSignature: _lastFailureSignature,
    repeatedFailureCount: _repeatedFailureCount,
    lastFailureType: _lastFailureType,
    lastReviewArtifactFailure: _lastReviewArtifactFailure,
    transientRetryAttempts: _transientRetryAttempts,
    stageNoopAttempts: _stageNoopAttempts,
    stageSetupAttempts: _stageSetupAttempts,
    ...rest
  } = metadata;

  return rest;
}

export function defaultPrMetadata(overrides = {}) {
  const normalizedOverrides = stripLegacyFailureMetadata(overrides);

  return {
    issueNumber: null,
    artifactsPath: null,
    status: FACTORY_PR_STATUSES.planning,
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastReadySha: null,
    lastProcessedWorkflowRunId: null,
    blockedAction: null,
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
    intervention: null,
    ...normalizedOverrides,
    intervention: canonicalizeIntervention(normalizedOverrides.intervention ?? null)
  };
}

function normalizeIssueNumber(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function canonicalizePrMetadataShape(metadata = {}, issueNumber = metadata?.issueNumber) {
  const normalizedMetadata = stripLegacyFailureMetadata(metadata);
  const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
  const canonicalArtifactsPath = normalizedIssueNumber
    ? issueArtifactsPath(normalizedIssueNumber)
    : normalizedMetadata.artifactsPath ?? null;

  return defaultPrMetadata({
    ...normalizedMetadata,
    issueNumber: normalizedIssueNumber ?? normalizedMetadata.issueNumber ?? null,
    artifactsPath: canonicalArtifactsPath,
    intervention: canonicalizeIntervention(normalizedMetadata.intervention)
  });
}
