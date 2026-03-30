import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBlockedAction,
  applyAutoAppliedSelfModifyLabel,
  applyIntervention,
  applyActualUsageMetadata,
  applyPendingStageDecision,
  applyPaused,
  applyCostEstimateMetadata,
  applyLastCompletedStage,
  applyLastRunId,
  applyLastRunUrl,
  applyPauseReason,
  applyPendingReviewSha,
  buildProjectedLabels,
  canonicalizeUpdatedMetadata,
  resolveNextStatus,
  applyArtifactRef
} from "../scripts/apply-pr-state.mjs";
import { FACTORY_LABELS, FACTORY_PR_STATUSES } from "../scripts/lib/factory-config.mjs";
import {
  defaultFailureIntervention,
  defaultPrMetadata
} from "../scripts/lib/pr-metadata.mjs";

test("resolveNextStatus prefers a valid FACTORY_STATUS override", () => {
  assert.equal(
    resolveNextStatus(FACTORY_PR_STATUSES.planning, FACTORY_PR_STATUSES.reviewing),
    FACTORY_PR_STATUSES.reviewing
  );
});

test("resolveNextStatus falls back to existing valid metadata status", () => {
  assert.equal(
    resolveNextStatus(FACTORY_PR_STATUSES.implementing, ""),
    FACTORY_PR_STATUSES.implementing
  );
});

test("resolveNextStatus rejects invalid FACTORY_STATUS overrides", () => {
  assert.throws(
    () => resolveNextStatus(FACTORY_PR_STATUSES.planning, "review-ready"),
    /Invalid FACTORY_STATUS/
  );
});

test("resolveNextStatus rejects invalid existing metadata statuses", () => {
  assert.throws(
    () => resolveNextStatus("review-ready", ""),
    /Invalid existing PR metadata status/
  );
});

test("applyPendingReviewSha leaves metadata unchanged when env undefined", () => {
  const metadata = defaultPrMetadata({
    pendingReviewSha: "abc123"
  });

  const nextMetadata = applyPendingReviewSha(metadata, undefined);

  assert.equal(nextMetadata.pendingReviewSha, "abc123");
});

test("applyPendingReviewSha preserves value when __UNCHANGED__", () => {
  const metadata = defaultPrMetadata({
    pendingReviewSha: "abc123"
  });

  const nextMetadata = applyPendingReviewSha(metadata, "__UNCHANGED__");

  assert.equal(nextMetadata.pendingReviewSha, "abc123");
});

test("applyPendingReviewSha clears value when empty", () => {
  const metadata = defaultPrMetadata({
    pendingReviewSha: "abc123"
  });

  const nextMetadata = applyPendingReviewSha(metadata, "");

  assert.equal(nextMetadata.pendingReviewSha, null);
});

test("applyPendingReviewSha clears value when __CLEAR__", () => {
  const metadata = defaultPrMetadata({
    pendingReviewSha: "abc123"
  });

  const nextMetadata = applyPendingReviewSha(metadata, "__CLEAR__");

  assert.equal(nextMetadata.pendingReviewSha, null);
});

test("applyPendingReviewSha sets pending SHA when provided", () => {
  const metadata = defaultPrMetadata({
    pendingReviewSha: null
  });

  const nextMetadata = applyPendingReviewSha(metadata, "deadbeef");

  assert.equal(nextMetadata.pendingReviewSha, "deadbeef");
});

test("applyLastCompletedStage updates metadata when provided", () => {
  const metadata = defaultPrMetadata({
    lastCompletedStage: null
  });

  const nextMetadata = applyLastCompletedStage(metadata, "implement");

  assert.equal(nextMetadata.lastCompletedStage, "implement");
});

test("applyLastCompletedStage clears value when empty", () => {
  const metadata = defaultPrMetadata({
    lastCompletedStage: "plan"
  });

  const nextMetadata = applyLastCompletedStage(metadata, "");

  assert.equal(nextMetadata.lastCompletedStage, null);
});

test("applyLastRunId respects __UNCHANGED__", () => {
  const metadata = defaultPrMetadata({
    lastRunId: "123"
  });

  const nextMetadata = applyLastRunId(metadata, "__UNCHANGED__");

  assert.equal(nextMetadata.lastRunId, "123");
});

test("applyLastRunUrl updates metadata with trimmed value", () => {
  const metadata = defaultPrMetadata({
    lastRunUrl: null
  });

  const nextMetadata = applyLastRunUrl(metadata, " https://example.com/run/1 ");

  assert.equal(nextMetadata.lastRunUrl, "https://example.com/run/1");
});

test("applyPauseReason clears when requested", () => {
  const metadata = defaultPrMetadata({
    pauseReason: "manual"
  });

  const nextMetadata = applyPauseReason(metadata, " ");

  assert.equal(nextMetadata.pauseReason, null);
});

test("applyArtifactRef respects __UNCHANGED__", () => {
  const metadata = defaultPrMetadata({
    artifactRef: "factory/12-sample"
  });

  const nextMetadata = applyArtifactRef(metadata, "__UNCHANGED__");

  assert.equal(nextMetadata.artifactRef, "factory/12-sample");
});

test("applyArtifactRef clears value when requested", () => {
  const metadata = defaultPrMetadata({
    artifactRef: "factory/12-sample"
  });

  const nextMetadata = applyArtifactRef(metadata, "__CLEAR__");

  assert.equal(nextMetadata.artifactRef, null);
});

test("applyArtifactRef trims and sets provided ref", () => {
  const metadata = defaultPrMetadata({
    artifactRef: null
  });

  const nextMetadata = applyArtifactRef(metadata, " main ");

  assert.equal(nextMetadata.artifactRef, "main");
});

test("applyCostEstimateMetadata updates advisory cost fields", () => {
  const metadata = defaultPrMetadata();
  const nextMetadata = applyCostEstimateMetadata(metadata, {
    FACTORY_COST_ESTIMATE_USD: "0.42",
    FACTORY_COST_ESTIMATE_BAND: "medium",
    FACTORY_COST_ESTIMATE_EMOJI: "🟡",
    FACTORY_COST_WARN_USD: "0.25",
    FACTORY_COST_HIGH_USD: "1",
    FACTORY_COST_PRICING_SOURCE: "model",
    FACTORY_LAST_ESTIMATED_STAGE: "plan",
    FACTORY_LAST_ESTIMATED_MODEL: "gpt-5-codex",
    FACTORY_LAST_STAGE_COST_ESTIMATE_USD: "0.42"
  });

  assert.equal(nextMetadata.costEstimateUsd, 0.42);
  assert.equal(nextMetadata.costEstimateBand, "medium");
  assert.equal(nextMetadata.costEstimateEmoji, "🟡");
  assert.equal(nextMetadata.costWarnUsd, 0.25);
  assert.equal(nextMetadata.costHighUsd, 1);
  assert.equal(nextMetadata.costPricingSource, "model");
  assert.equal(nextMetadata.lastEstimatedStage, "plan");
  assert.equal(nextMetadata.lastEstimatedModel, "gpt-5-codex");
  assert.equal(nextMetadata.lastStageCostEstimateUsd, 0.42);
});

test("applyActualUsageMetadata updates actual telemetry fields", () => {
  const metadata = defaultPrMetadata();
  const nextMetadata = applyActualUsageMetadata(metadata, {
    FACTORY_ACTUAL_API_SURFACE: "codex-cli",
    FACTORY_ACTUAL_STAGE_COST_USD: "2.6601",
    FACTORY_ACTUAL_INPUT_TOKENS: "1840867",
    FACTORY_ACTUAL_CACHED_INPUT_TOKENS: "1578496",
    FACTORY_ACTUAL_OUTPUT_TOKENS: "16172",
    FACTORY_ACTUAL_REASONING_TOKENS: ""
  });

  assert.equal(nextMetadata.actualApiSurface, "codex-cli");
  assert.equal(nextMetadata.actualStageCostUsd, 2.6601);
  assert.equal(nextMetadata.actualInputTokens, 1840867);
  assert.equal(nextMetadata.actualCachedInputTokens, 1578496);
  assert.equal(nextMetadata.actualOutputTokens, 16172);
  assert.equal(nextMetadata.actualReasoningTokens, null);
});

test("applyActualUsageMetadata clears stale actual telemetry fields", () => {
  const metadata = defaultPrMetadata({
    actualApiSurface: "codex-cli",
    actualStageCostUsd: 2.6601,
    actualInputTokens: 1840867,
    actualCachedInputTokens: 1578496,
    actualOutputTokens: 16172,
    actualReasoningTokens: 240
  });
  const nextMetadata = applyActualUsageMetadata(metadata, {
    FACTORY_ACTUAL_API_SURFACE: "__CLEAR__",
    FACTORY_ACTUAL_STAGE_COST_USD: "__CLEAR__",
    FACTORY_ACTUAL_INPUT_TOKENS: "__CLEAR__",
    FACTORY_ACTUAL_CACHED_INPUT_TOKENS: "__CLEAR__",
    FACTORY_ACTUAL_OUTPUT_TOKENS: "__CLEAR__",
    FACTORY_ACTUAL_REASONING_TOKENS: "__CLEAR__"
  });

  assert.equal(nextMetadata.actualApiSurface, null);
  assert.equal(nextMetadata.actualStageCostUsd, null);
  assert.equal(nextMetadata.actualInputTokens, null);
  assert.equal(nextMetadata.actualCachedInputTokens, null);
  assert.equal(nextMetadata.actualOutputTokens, null);
  assert.equal(nextMetadata.actualReasoningTokens, null);
});

test("canonicalizeUpdatedMetadata rewrites drifted artifacts paths and preserves other fields", () => {
  const metadata = defaultPrMetadata({
    issueNumber: 12,
    artifactsPath: ".factory/runs/999",
    status: FACTORY_PR_STATUSES.reviewing,
    intervention: defaultFailureIntervention({
      payload: {
        failureType: "stage_setup",
        stageSetupAttempts: 2
      }
    })
  });

  const nextMetadata = canonicalizeUpdatedMetadata(metadata);

  assert.equal(nextMetadata.artifactsPath, ".factory/runs/12");
  assert.equal(nextMetadata.status, FACTORY_PR_STATUSES.reviewing);
  assert.equal(nextMetadata.intervention.payload.stageSetupAttempts, 2);
});

test("applyPaused updates metadata from the explicit env override", () => {
  const metadata = defaultPrMetadata();

  assert.equal(applyPaused(metadata, "true").paused, true);
  assert.equal(applyPaused(metadata, "false").paused, false);
  assert.equal(applyPaused({ ...metadata, paused: true }, "__UNCHANGED__").paused, true);
});

test("applyAutoAppliedSelfModifyLabel updates metadata from the explicit env override", () => {
  const metadata = defaultPrMetadata();

  assert.equal(applyAutoAppliedSelfModifyLabel(metadata, "true").autoAppliedSelfModifyLabel, true);
  assert.equal(applyAutoAppliedSelfModifyLabel(metadata, "false").autoAppliedSelfModifyLabel, false);
  assert.equal(
    applyAutoAppliedSelfModifyLabel(
      { ...metadata, autoAppliedSelfModifyLabel: true },
      "__UNCHANGED__"
    ).autoAppliedSelfModifyLabel,
    true
  );
});

test("applyPendingStageDecision updates metadata from the explicit env override", () => {
  const metadata = defaultPrMetadata();
  const decision = {
    sourceInterventionId: "int_q_123",
    kind: "ambiguity",
    selectedOptionId: "api_first",
    selectedOptionLabel: "API-first path",
    instruction: "Implement the API-first path only."
  };

  assert.deepEqual(
    applyPendingStageDecision(metadata, JSON.stringify(decision)).pendingStageDecision,
    decision
  );
  assert.equal(applyPendingStageDecision(metadata, "__CLEAR__").pendingStageDecision, null);
  assert.equal(
    applyPendingStageDecision(
      { ...metadata, pendingStageDecision: decision },
      "__UNCHANGED__"
    ).pendingStageDecision.sourceInterventionId,
    "int_q_123"
  );
  assert.equal(applyPendingStageDecision(metadata, "").pendingStageDecision, null);
});

test("applyPendingStageDecision leaves metadata unchanged when env undefined", () => {
  const metadata = defaultPrMetadata({
    pendingStageDecision: {
      sourceInterventionId: "int_q_123",
      kind: "ambiguity",
      selectedOptionId: "api_first",
      selectedOptionLabel: "API-first path",
      instruction: "Implement the API-first path only."
    }
  });

  assert.equal(
    applyPendingStageDecision(metadata, undefined).pendingStageDecision.sourceInterventionId,
    "int_q_123"
  );
});

test("applyPendingStageDecision rejects invalid JSON", () => {
  const metadata = defaultPrMetadata();

  assert.throws(
    () => applyPendingStageDecision(metadata, "{not-json"),
    /FACTORY_PENDING_STAGE_DECISION must be valid JSON/
  );
});

test("applyBlockedAction updates metadata from the explicit env override", () => {
  const metadata = defaultPrMetadata({ blockedAction: "repair" });

  assert.equal(applyBlockedAction(metadata, "review").blockedAction, "review");
  assert.equal(applyBlockedAction(metadata, "").blockedAction, null);
  assert.equal(applyBlockedAction(metadata, "__UNCHANGED__").blockedAction, "repair");
});

test("applyIntervention leaves metadata unchanged when env undefined", () => {
  const metadata = defaultPrMetadata({
    intervention: defaultFailureIntervention({
      payload: { failureType: "configuration" }
    })
  });

  const nextMetadata = applyIntervention(metadata, undefined);

  assert.equal(nextMetadata.intervention.payload.failureType, "configuration");
});

test("applyIntervention preserves intervention when __UNCHANGED__", () => {
  const metadata = defaultPrMetadata({
    intervention: defaultFailureIntervention({
      payload: { failureType: "configuration" }
    })
  });

  const nextMetadata = applyIntervention(metadata, "__UNCHANGED__");

  assert.equal(nextMetadata.intervention.payload.failureType, "configuration");
});

test("applyIntervention clears intervention when requested", () => {
  const metadata = defaultPrMetadata({
    intervention: defaultFailureIntervention({
      payload: { failureType: "configuration" }
    })
  });

  assert.equal(applyIntervention(metadata, "").intervention, null);
  assert.equal(applyIntervention(metadata, "__CLEAR__").intervention, null);
});

test("applyIntervention applies parsed failure intervention", () => {
  const metadata = defaultPrMetadata();
  const intervention = {
    type: "failure",
    status: "open",
    summary: "Factory encountered a configuration error and is now blocked.",
    payload: {
      failureType: "configuration",
      retryAttempts: 1
    }
  };

  const nextMetadata = applyIntervention(metadata, JSON.stringify(intervention));

  assert.equal(nextMetadata.intervention.type, "failure");
  assert.equal(nextMetadata.intervention.summary, intervention.summary);
  assert.equal(nextMetadata.intervention.payload.failureType, "configuration");
  assert.equal(nextMetadata.intervention.payload.retryAttempts, 1);
});

test("applyIntervention rejects invalid JSON", () => {
  const metadata = defaultPrMetadata();

  assert.throws(
    () => applyIntervention(metadata, "{not-json"),
    /FACTORY_INTERVENTION must be valid JSON/
  );
});

test("buildProjectedLabels maps metadata state into projected status labels", () => {
  const labels = buildProjectedLabels(
    defaultPrMetadata({
      status: FACTORY_PR_STATUSES.blocked,
      paused: true,
      costEstimateBand: "medium"
    })
  );

  assert.deepEqual(labels, [
    FACTORY_LABELS.managed,
    FACTORY_LABELS.blocked,
    FACTORY_LABELS.paused,
    FACTORY_LABELS.costMedium
  ]);
});
