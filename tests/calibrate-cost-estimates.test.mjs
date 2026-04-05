import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as calibrateUsageEstimates } from "../scripts/calibrate-usage-estimates.mjs";

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test("calibrate-usage-estimates aggregates usage events into calibration buckets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-calibration-"));
  const originalCwd = process.cwd();
  const originalGithubOutput = process.env.GITHUB_OUTPUT;

  writeJson(
    path.join(
      tempDir,
      ".factory",
      "usage-events",
      "2026-03-19",
      "run-1-1-stage-implement.json"
    ),
    {
      provider: "openai",
      category: "stage",
      stage: "implement",
      model: "gpt-5-codex",
      estimatedUsageBeforeCalibration: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 200
      },
      actualUsage: {
        inputTokens: 120,
        cachedInputTokens: 0,
        outputTokens: 260
      },
      runId: "run-1",
      runAttempt: 1,
      recordedAt: "2026-03-19T12:00:00Z"
    }
  );
  writeJson(
    path.join(
      tempDir,
      ".factory",
      "usage-events",
      "2026-03-19",
      "run-2-1-stage-implement.json"
    ),
    {
      provider: "openai",
      category: "stage",
      stage: "implement",
      model: "gpt-5-codex",
      estimatedUsageBeforeCalibration: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100
      },
      actualUsage: {
        inputTokens: 110,
        cachedInputTokens: 0,
        outputTokens: 130
      },
      runId: "run-2",
      runAttempt: 1,
      recordedAt: "2026-03-19T13:00:00Z"
    }
  );

  try {
    process.chdir(tempDir);
    const outputFile = path.join(tempDir, "calibration-outputs.txt");
    fs.writeFileSync(outputFile, "");
    process.env.GITHUB_OUTPUT = outputFile;
    calibrateUsageEstimates();
    const calibrationPath = path.join(tempDir, ".factory", "usage-calibration.json");
    assert.equal(fs.existsSync(calibrationPath), true);

    const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
    const bucket = calibration.buckets["openai:stage:implement:gpt-5-codex"];

    assert.ok(calibration.generatedAt);
    assert.ok(bucket);
    assert.equal(bucket.sampleSize, 2);
    assert.equal(bucket.totals.estimated.inputTokens, 200);
    assert.equal(bucket.totals.actual.inputTokens, 230);
    assert.equal(bucket.multipliers.inputTokens, 1.15);
    assert.equal(bucket.multipliers.outputTokens, 1.3);
    assert.equal(bucket.source, "telemetry");
  } finally {
    process.env.GITHUB_OUTPUT = originalGithubOutput;
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("calibrate-usage-estimates is idempotent for unchanged usage events", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-calibration-"));
  const originalCwd = process.cwd();
  const originalGithubOutput = process.env.GITHUB_OUTPUT;

  writeJson(
    path.join(
      tempDir,
      ".factory",
      "usage-events",
      "2026-03-19",
      "run-1-1-stage-plan.json"
    ),
    {
      provider: "openai",
      category: "stage",
      stage: "plan",
      model: "gpt-5-codex",
      estimatedUsageBeforeCalibration: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 15
      },
      actualUsage: {
        inputTokens: 120,
        cachedInputTokens: 0,
        outputTokens: 18
      },
      runId: "run-1",
      runAttempt: 1,
      recordedAt: "2026-03-19T12:00:00Z"
    }
  );

  try {
    process.chdir(tempDir);
    const calibrationPath = path.join(tempDir, ".factory", "usage-calibration.json");
    const outputFile = path.join(tempDir, "calibration-outputs.txt");
    fs.writeFileSync(outputFile, "");
    process.env.GITHUB_OUTPUT = outputFile;

    calibrateUsageEstimates();
    const first = fs.readFileSync(calibrationPath, "utf8");

    calibrateUsageEstimates();
    const second = fs.readFileSync(calibrationPath, "utf8");

    assert.equal(second, first);
  } finally {
    process.env.GITHUB_OUTPUT = originalGithubOutput;
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
