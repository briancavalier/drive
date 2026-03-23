import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCostLabelUpdate,
  buildCostMetadataFromSummary,
  classifyCostBand,
  estimateInputTokensFromChars,
  estimateStageCost,
  loadCostSummary,
  resolveCostThresholds,
  summarizeIssueUsageEvents
} from "../scripts/lib/cost-estimation.mjs";

test("resolveCostThresholds falls back to defaults", () => {
  assert.deepEqual(resolveCostThresholds({}), {
    warnUsd: 0.25,
    highUsd: 1
  });
});

test("estimateInputTokensFromChars rounds up using heuristic", () => {
  assert.equal(estimateInputTokensFromChars(1), 1);
  assert.equal(estimateInputTokensFromChars(8), 2);
  assert.equal(estimateInputTokensFromChars(9), 3);
});

test("classifyCostBand uses warn and high thresholds", () => {
  const thresholds = { warnUsd: 0.25, highUsd: 1 };

  assert.equal(classifyCostBand(0.2, thresholds), "low");
  assert.equal(classifyCostBand(0.25, thresholds), "medium");
  assert.equal(classifyCostBand(1, thresholds), "high");
});

test("estimateStageCost records provider-native usage and derived USD totals", () => {
  const existingSummary = {
    stages: {
      plan: {
        mode: "plan",
        provider: "openai",
        apiSurface: "codex-action",
        model: "gpt-5-codex",
        promptChars: 4000,
        estimatedUsageBeforeCalibration: {
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 150,
          reasoningTokens: null
        },
        estimatedUsage: {
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 150,
          reasoningTokens: null
        },
        usageCalibration: {
          bucket: "plan:gpt-5-codex:openai",
          sampleSize: 1,
          generatedAt: "2026-03-01T00:00:00Z",
          source: "telemetry",
          multipliers: {
            inputTokens: 1,
            cachedInputTokens: 1,
            outputTokens: 1
          }
        },
        derivedCost: {
          stageUsdBeforeCalibration: 0.0028,
          stageUsd: 0.0028,
          pricingSource: "model"
        }
      }
    }
  };

  const summary = estimateStageCost({
    mode: "implement",
    model: "gpt-5-codex",
    promptChars: 4000,
    thresholds: { warnUsd: 0.25, highUsd: 1 },
    existingSummary,
    issueNumber: 12,
    branch: "factory/12-example",
    calibration: null
  });

  assert.equal(summary.current.stage, "implement");
  assert.equal(summary.provider, "openai");
  assert.equal(summary.apiSurface, "codex-action");
  assert.equal(summary.stages.implement.estimatedUsage.inputTokens, 1000);
  assert.equal(summary.stages.implement.estimatedUsage.outputTokens, 1250);
  assert.ok(summary.current.derivedCost.stageUsd > 0);
  assert.ok(
    summary.current.derivedCost.totalEstimatedUsd >
      summary.current.derivedCost.stageUsd
  );
});

test("estimateStageCost marks unknown model pricing as fallback", () => {
  const summary = estimateStageCost({
    mode: "review",
    model: "unknown-model",
    promptChars: 800,
    thresholds: { warnUsd: 0.25, highUsd: 1 },
    issueNumber: 5,
    branch: "factory/5-example",
    calibration: null
  });

  assert.equal(summary.current.derivedCost.pricingSource, "fallback");
  assert.equal(summary.stages.review.derivedCost.pricingSource, "fallback");
});

test("summarizeIssueUsageEvents preserves actual usage and actual USD", () => {
  const summary = summarizeIssueUsageEvents(
    [
      {
        category: "stage",
        stage: "plan",
        provider: "openai",
        apiSurface: "codex-cli",
        model: "gpt-5-codex",
        promptChars: 4000,
        estimatedUsageBeforeCalibration: {
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 150,
          reasoningTokens: null
        },
        estimatedUsage: {
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 150,
          reasoningTokens: null
        },
        actualUsage: {
          inputTokens: 1876900,
          cachedInputTokens: 1517696,
          outputTokens: 16517,
          reasoningTokens: null
        },
        usageCalibration: {
          bucket: "openai:stage:plan:gpt-5-codex",
          sampleSize: 0,
          generatedAt: "",
          source: "default",
          multipliers: {
            inputTokens: 1,
            cachedInputTokens: 1,
            outputTokens: 1
          }
        },
        derivedCost: {
          estimatedUsdBeforeCalibration: 0.0028,
          estimatedUsd: 0.0028,
          actualUsd: 2.1687,
          pricingSource: "model"
        },
        recordedAt: "2026-03-23T22:57:32.583Z",
        sourceEventPath:
          ".factory/usage-events/2026-03-23/23464079563-1-stage-plan.json"
      }
    ],
    {
      issueNumber: 109,
      prNumber: 117,
      branch: "factory/109-add-repair-exhaustion-decision-interventions"
    }
  );

  assert.equal(summary.apiSurface, "codex-cli");
  assert.deepEqual(summary.current.actualUsage, {
    inputTokens: 1876900,
    cachedInputTokens: 1517696,
    outputTokens: 16517,
    reasoningTokens: null
  });
  assert.equal(summary.current.derivedCost.actualUsd, 2.1687);
  assert.deepEqual(summary.stages.plan.actualUsage, {
    inputTokens: 1876900,
    cachedInputTokens: 1517696,
    outputTokens: 16517,
    reasoningTokens: null
  });
  assert.equal(summary.stages.plan.derivedCost.actualUsd, 2.1687);
});

test("buildCostMetadataFromSummary extracts PR metadata fields", () => {
  const metadata = buildCostMetadataFromSummary({
    thresholds: { warnUsd: 0.25, highUsd: 1 },
    current: {
      stage: "plan",
      model: "gpt-5-codex",
      derivedCost: {
        totalEstimatedUsd: 0.3,
        band: "medium",
        emoji: "🟡",
        pricingSource: "model",
        stageUsd: 0.3
      }
    }
  });

  assert.equal(metadata.costEstimateBand, "medium");
  assert.equal(metadata.lastEstimatedModel, "gpt-5-codex");
});

test("buildCostLabelUpdate returns one add label and removes the other bands", () => {
  const labels = buildCostLabelUpdate({
    current: {
      derivedCost: {
        band: "high"
      }
    }
  });

  assert.equal(labels.addLabel, "factory:cost-high");
  assert.deepEqual(labels.removeLabels.sort(), [
    "factory:cost-low",
    "factory:cost-medium"
  ]);
});

test("estimateStageCost applies per-bucket usage calibration", () => {
  const summary = estimateStageCost({
    mode: "implement",
    model: "gpt-5-codex",
    promptChars: 2000,
    thresholds: { warnUsd: 0.25, highUsd: 1 },
    issueNumber: 9,
    branch: "factory/9-calibration",
    calibration: {
      generatedAt: "2026-03-01T00:00:00Z",
      buckets: {
        "openai:stage:implement:gpt-5-codex": {
          multipliers: {
            inputTokens: 1.1,
            cachedInputTokens: 1,
            outputTokens: 1.25
          },
          sampleSize: 4,
          source: "telemetry",
          generatedAt: "2026-03-01T00:00:00Z"
        }
      }
    }
  });

  assert.equal(summary.current.usageCalibration.sampleSize, 4);
  assert.equal(summary.current.usageCalibration.multipliers.inputTokens, 1.1);
  assert.equal(summary.current.usageCalibration.multipliers.outputTokens, 1.25);
  assert.ok(
    summary.current.derivedCost.stageUsd >
      summary.current.derivedCost.stageUsdBeforeCalibration
  );
});

test("loadCostSummary migrates legacy USD-first stage summaries", () => {
  const summary = loadCostSummary("");
  assert.equal(summary, null);
});
