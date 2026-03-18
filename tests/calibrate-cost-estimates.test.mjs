import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as calibrateCostEstimates } from "../scripts/calibrate-cost-estimates.mjs";

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test("calibrate-cost-estimates aggregates telemetry into calibration buckets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-calibration-"));
  const originalCwd = process.cwd();

  const runDir = path.join(tempDir, ".factory", "runs", "1");
  writeJson(path.join(runDir, "cost-summary.json"), {
    issueNumber: 1,
    telemetry: [
      {
        stage: "implement",
        model: "gpt-5-codex",
        estimatedUsdBeforeCalibration: 0.5,
        estimatedUsd: 0.55,
        actualUsd: 0.75,
        runId: "est-1",
        runAttempt: 1,
        recordedAt: "2026-03-17T12:00:00Z"
      },
      {
        stage: "implement",
        model: "gpt-5-codex",
        estimatedUsdBeforeCalibration: 0.2,
        estimatedUsd: 0.25,
        actualUsd: 0.25,
        runId: "est-2",
        runAttempt: 1,
        recordedAt: "2026-03-18T12:00:00Z"
      },
      {
        stage: "implement",
        model: "gpt-5-codex",
        estimatedUsdBeforeCalibration: 0.1,
        runId: "skip-1",
        runAttempt: 1
      }
    ]
  });

  try {
    process.chdir(tempDir);
    calibrateCostEstimates();
    const calibrationPath = path.join(tempDir, ".factory", "cost-calibration.json");
    assert.equal(fs.existsSync(calibrationPath), true);

    const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
    const bucket = calibration.buckets["implement:gpt-5-codex"];

    assert.ok(calibration.generatedAt);
    assert.ok(bucket);
    assert.equal(bucket.sampleSize, 2);
    assert.equal(bucket.totalEstimatedUsd, 0.7);
    assert.equal(bucket.totalActualUsd, 1);
    assert.equal(bucket.multiplier, 1.4286);
    assert.equal(bucket.source, "telemetry");
    assert.equal(bucket.stage, "implement");
    assert.equal(bucket.model, "gpt-5-codex");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
