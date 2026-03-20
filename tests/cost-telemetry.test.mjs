import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildUsageEvent,
  buildUsageEventPath,
  loadUsageEvents,
  usageEventKey,
  writeUsageEvent
} from "../scripts/lib/cost-telemetry.mjs";

test("buildUsageEvent constructs a normalized stage event", () => {
  const event = buildUsageEvent({
    category: "stage",
    stage: "implement",
    issueNumber: 77,
    prNumber: 88,
    branch: "factory/77-telemetry",
    model: "gpt-5-codex",
    runId: "123456",
    runAttempt: 2,
    promptChars: 3200,
    estimatedUsageBeforeCalibration: {
      inputTokens: 800,
      cachedInputTokens: 0,
      outputTokens: 1000
    },
    estimatedUsage: {
      inputTokens: 840,
      cachedInputTokens: 0,
      outputTokens: 1200
    },
    usageCalibration: {
      bucket: "implement:gpt-5-codex:openai",
      sampleSize: 3,
      source: "telemetry",
      generatedAt: "2026-03-01T00:00:00Z",
      multipliers: {
        inputTokens: 1.05,
        cachedInputTokens: 1,
        outputTokens: 1.2
      }
    },
    derivedCost: {
      estimatedUsdBeforeCalibration: 0.02,
      estimatedUsd: 0.03,
      pricingVersion: "openai-2026-03-19",
      pricingSource: "model"
    },
    recordedAt: "2026-03-18T12:30:00Z"
  });

  assert.equal(event.category, "stage");
  assert.equal(event.stage, "implement");
  assert.equal(event.model, "gpt-5-codex");
  assert.equal(event.runId, "123456");
  assert.equal(event.runAttempt, 2);
  assert.equal(event.estimatedUsage.inputTokens, 840);
  assert.equal(event.usageCalibration.multipliers.outputTokens, 1.2);
  assert.equal(event.derivedCost.estimatedUsd, 0.03);
});

test("buildUsageEventPath partitions by date and discriminator", () => {
  const event = buildUsageEvent({
    category: "failure_diagnosis",
    failureKind: "stage_failure",
    issueNumber: 10,
    branch: "factory/10-example",
    model: "gpt-5-mini",
    runId: "987654321",
    runAttempt: 1,
    estimatedUsageBeforeCalibration: {
      inputTokens: 100,
      outputTokens: 20
    },
    estimatedUsage: {
      inputTokens: 100,
      outputTokens: 20
    },
    recordedAt: "2026-03-19T01:02:03Z"
  });

  assert.equal(
    buildUsageEventPath(event),
    path.join(
      ".factory",
      "usage-events",
      "2026-03-19",
      "987654321-1-failure-diagnosis-stage-failure.json"
    )
  );
  assert.equal(
    usageEventKey(event),
    "987654321::1::failure_diagnosis::stage-failure"
  );
});

test("writeUsageEvent persists immutable usage event files that can be reloaded", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-events-"));
  const rootDir = path.join(tempDir, ".factory", "usage-events");
  const event = buildUsageEvent({
    category: "stage",
    stage: "review",
    issueNumber: 55,
    prNumber: 56,
    branch: "factory/55-review",
    model: "gpt-5-mini",
    runId: "run-1",
    runAttempt: 2,
    estimatedUsageBeforeCalibration: {
      inputTokens: 100,
      outputTokens: 30
    },
    estimatedUsage: {
      inputTokens: 100,
      outputTokens: 35
    }
  });

  const eventPath = writeUsageEvent(event, rootDir);
  const events = loadUsageEvents(rootDir);

  assert.equal(fs.existsSync(eventPath), true);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceEventPath, eventPath);
  assert.equal(events[0].stage, "review");
});
