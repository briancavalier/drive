import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCostLabelUpdate,
  buildCostMetadataFromSummary,
  classifyCostBand,
  estimateInputTokensFromChars,
  estimateStageCost,
  loadCostSummary,
  resolveCostThresholds
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
        "implement:gpt-5-codex:openai": {
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
