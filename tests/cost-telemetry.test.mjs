import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTelemetryEntry,
  buildTelemetryEntry,
  ensureTelemetryArray,
  TELEMETRY_OUTCOMES
} from "../scripts/lib/cost-telemetry.mjs";

function buildSummary() {
  return {
    issueNumber: 77,
    prNumber: null,
    branch: "factory/77-telemetry",
    current: {
      stage: "implement",
      model: "gpt-5-codex",
      stageEstimateUsd: 0.12,
      stageEstimateUsdBeforeCalibration: 0.1,
      totalEstimatedUsd: 0.12,
      pricingSource: "model",
      calibrationMultiplier: 1.2,
      calibrationSource: "telemetry",
      calibrationSampleSize: 3,
      calibrationKey: "implement:gpt-5-codex",
      calibrationGeneratedAt: "2026-03-01T00:00:00Z"
    },
    stages: {
      implement: {
        mode: "implement",
        model: "gpt-5-codex",
        promptChars: 3200,
        estimatedInputTokens: 800,
        multiplier: 4,
        estimatedUsdBeforeCalibration: 0.1,
        estimatedUsd: 0.12,
        pricingSource: "model",
        calibrationMultiplier: 1.2,
        calibrationSource: "telemetry",
        calibrationSampleSize: 3,
        calibrationKey: "implement:gpt-5-codex",
        calibrationGeneratedAt: "2026-03-01T00:00:00Z"
      }
    },
    telemetry: []
  };
}

test("buildTelemetryEntry constructs a normalized telemetry payload", () => {
  const summary = buildSummary();
  const entry = buildTelemetryEntry({
    summary,
    context: {
      prNumber: 88,
      runId: "123456",
      runAttempt: 2
    },
    outcome: TELEMETRY_OUTCOMES.succeeded,
    recordedAt: "2026-03-18T12:30:00Z"
  });

  assert.equal(entry.issueNumber, 77);
  assert.equal(entry.prNumber, 88);
  assert.equal(entry.stage, "implement");
  assert.equal(entry.model, "gpt-5-codex");
  assert.equal(entry.runId, "123456");
  assert.equal(entry.runAttempt, 2);
  assert.equal(entry.calibrationMultiplier, 1.2);
  assert.equal(entry.calibrationSource, "telemetry");
  assert.equal(entry.estimatedUsdBeforeCalibration, 0.1);
  assert.equal(entry.recordedAt, "2026-03-18T12:30:00Z");
});

test("appendTelemetryEntry prevents duplicate run identifiers for a stage", () => {
  const summary = buildSummary();
  ensureTelemetryArray(summary);
  const entry = buildTelemetryEntry({
    summary,
    context: {
      runId: "dup-test",
      runAttempt: 1
    },
    recordedAt: "2026-03-18T12:00:00Z"
  });

  const firstAppend = appendTelemetryEntry(summary, entry);
  const secondAppend = appendTelemetryEntry(summary, entry);

  assert.equal(firstAppend.appended, true);
  assert.equal(secondAppend.appended, false);
  assert.equal(summary.telemetry.length, 1);
});
