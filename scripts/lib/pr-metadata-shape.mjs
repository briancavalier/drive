import { DEFAULT_MAX_REPAIR_ATTEMPTS, FACTORY_PR_STATUSES, issueArtifactsPath } from "./factory-config.mjs";
import {
  defaultApprovalIntervention,
  canonicalizeIntervention,
  defaultFailureIntervention,
  defaultFailureInterventionPayload,
  defaultQuestionIntervention,
  defaultQuestionInterventionPayload
} from "./intervention-state.mjs";

export {
  canonicalizeIntervention,
  defaultApprovalIntervention,
  defaultFailureIntervention,
  defaultFailureInterventionPayload,
  defaultQuestionIntervention,
  defaultQuestionInterventionPayload
};

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

function normalizePendingStageDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return null;
  }

  const sourceInterventionId = `${decision.sourceInterventionId || ""}`.trim();
  const kind = `${decision.kind || ""}`.trim();
  const selectedOptionId = `${decision.selectedOptionId || ""}`.trim();
  const selectedOptionLabel = `${decision.selectedOptionLabel || ""}`.trim();
  const instruction = `${decision.instruction || ""}`.trim();
  const answeredBy = `${decision.answeredBy || ""}`.trim();
  const answeredAt = `${decision.answeredAt || ""}`.trim();

  if (
    !sourceInterventionId ||
    !kind ||
    !selectedOptionId ||
    !selectedOptionLabel ||
    !instruction
  ) {
    return null;
  }

  return {
    sourceInterventionId,
    kind,
    selectedOptionId,
    selectedOptionLabel,
    instruction,
    answeredBy: answeredBy || null,
    answeredAt: answeredAt || null
  };
}

function normalizeBudgetOverride(override) {
  if (!override || typeof override !== "object") {
    return null;
  }

  const sourceInterventionId = `${override.sourceInterventionId || ""}`.trim();
  const kind = `${override.kind || ""}`.trim();
  const approvedBy = `${override.approvedBy || ""}`.trim();
  const approvedAt = `${override.approvedAt || ""}`.trim();

  if (!sourceInterventionId || !kind) {
    return null;
  }

  return {
    sourceInterventionId,
    kind,
    approvedBy: approvedBy || null,
    approvedAt: approvedAt || null
  };
}

export function defaultPrMetadata(overrides = {}) {
  const normalizedOverrides = stripLegacyFailureMetadata(overrides);

  return {
    issueNumber: null,
    artifactsPath: null,
    artifactRef: null,
    status: FACTORY_PR_STATUSES.planning,
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastReadySha: null,
    lastProcessedWorkflowRunId: null,
    blockedAction: null,
    lastRefreshedSha: null,
    pendingReviewSha: null,
    paused: false,
    autoAppliedSelfModifyLabel: false,
    pendingStageDecision: null,
    budgetOverride: null,
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
    actualApiSurface: null,
    actualStageCostUsd: null,
    actualInputTokens: null,
    actualCachedInputTokens: null,
    actualOutputTokens: null,
    actualReasoningTokens: null,
    intervention: null,
    ...normalizedOverrides,
    artifactRef: normalizeArtifactRef(normalizedOverrides.artifactRef),
    pendingStageDecision: normalizePendingStageDecision(
      normalizedOverrides.pendingStageDecision
    ),
    budgetOverride: normalizeBudgetOverride(normalizedOverrides.budgetOverride),
    intervention: canonicalizeIntervention(normalizedOverrides.intervention ?? null)
  };
}

function normalizeIssueNumber(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeArtifactRef(value) {
  const normalized = `${value ?? ""}`.trim();

  return normalized ? normalized : null;
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
    artifactRef: normalizeArtifactRef(normalizedMetadata.artifactRef),
    pendingStageDecision: normalizePendingStageDecision(
      normalizedMetadata.pendingStageDecision
    ),
    budgetOverride: normalizeBudgetOverride(normalizedMetadata.budgetOverride),
    intervention: canonicalizeIntervention(normalizedMetadata.intervention)
  });
}
