import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCostLabelUpdate,
  buildCostMetadataFromSummary,
  classifyCostBand,
  estimateInputTokensFromChars,
  estimateStageCost,
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

test("estimateStageCost rolls stage estimates into cumulative totals", () => {
  const existingSummary = {
    stages: {
      plan: {
        estimatedUsd: 0.2
      }
    },
    telemetry: [
      {
        stage: "plan",
        runId: "123",
        runAttempt: 1
      }
    ]
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
  assert.equal(summary.stages.plan.estimatedUsd, 0.2);
  assert.ok(summary.current.stageEstimateUsd > 0);
  assert.ok(summary.current.totalEstimatedUsd > summary.current.stageEstimateUsd);
  assert.equal(summary.telemetry.length, 1);
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

  assert.equal(summary.current.pricingSource, "fallback");
  assert.equal(summary.stages.review.pricingSource, "fallback");
});

test("buildCostMetadataFromSummary extracts PR metadata fields", () => {
  const metadata = buildCostMetadataFromSummary({
    thresholds: { warnUsd: 0.25, highUsd: 1 },
    current: {
      totalEstimatedUsd: 0.3,
      band: "medium",
      emoji: "🟡",
      pricingSource: "model",
      stage: "plan",
      model: "gpt-5-codex",
      stageEstimateUsd: 0.3
    }
  });

  assert.equal(metadata.costEstimateBand, "medium");
  assert.equal(metadata.lastEstimatedModel, "gpt-5-codex");
});

test("buildCostLabelUpdate returns one add label and removes the other bands", () => {
  const labels = buildCostLabelUpdate({
    current: {
      band: "high"
    }
  });

  assert.equal(labels.addLabel, "factory:cost-high");
  assert.deepEqual(labels.removeLabels.sort(), [
    "factory:cost-low",
    "factory:cost-medium"
  ]);
});

test("estimateStageCost records calibration metadata when a multiplier is available", () => {
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
        "implement:gpt-5-codex": {
          multiplier: 1.25,
          sampleSize: 4,
          source: "telemetry",
          generatedAt: "2026-03-01T00:00:00Z"
        }
      }
    }
  });

  assert.equal(summary.current.calibrationMultiplier, 1.25);
  assert.equal(summary.current.calibrationSource, "telemetry");
  assert.equal(summary.current.calibrationSampleSize, 4);
  assert.ok(summary.current.stageEstimateUsdBeforeCalibration > 0);
  assert.ok(summary.current.stageEstimateUsd > summary.current.stageEstimateUsdBeforeCalibration);
  assert.equal(summary.stages.implement.calibrationKey, "implement:gpt-5-codex");
});
