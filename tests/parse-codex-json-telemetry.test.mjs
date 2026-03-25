import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { main as parseCodexJsonTelemetry } from "../scripts/parse-codex-json-telemetry.mjs";

const previousGithubOutput = process.env.GITHUB_OUTPUT;
const tempGithubOutput = path.join(
  os.tmpdir(),
  `parse-codex-json-telemetry-${process.pid}.output`
);

process.env.GITHUB_OUTPUT = tempGithubOutput;

test.beforeEach(() => {
  fs.writeFileSync(tempGithubOutput, "");
});

test.after(() => {
  if (previousGithubOutput === undefined) {
    delete process.env.GITHUB_OUTPUT;
  } else {
    process.env.GITHUB_OUTPUT = previousGithubOutput;
  }

  try {
    fs.unlinkSync(tempGithubOutput);
  } catch {
    // ignore cleanup errors
  }
});

test("parse-codex-json-telemetry extracts actual usage from turn.completed events", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-json-telemetry-"));
  const inputPath = path.join(tempDir, "events.jsonl");
  const outputPath = path.join(tempDir, "usage.json");

  fs.writeFileSync(
    inputPath,
    [
      JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
      JSON.stringify({ type: "turn.started", turn_id: "turn_123" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 26549,
          cached_input_tokens: 22272,
          output_tokens: 1590,
          reasoning_output_tokens: 1152
        }
      })
    ].join("\n")
  );

  const resultPath = parseCodexJsonTelemetry({
    FACTORY_CODEX_JSONL_PATH: inputPath,
    FACTORY_CODEX_USAGE_OUTPUT_PATH: outputPath
  });

  assert.equal(resultPath, outputPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
    source: "codex-exec-json",
    apiSurface: "codex-cli",
    sourcePath: inputPath,
    eventCount: 3,
    eventType: "turn.completed",
    actualUsage: {
      inputTokens: 26549,
      cachedInputTokens: 22272,
      outputTokens: 1590,
      reasoningTokens: 1152
    }
  });
});

test("parse-codex-json-telemetry fails when no turn.completed usage event is present", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-json-telemetry-"));
  const inputPath = path.join(tempDir, "events.jsonl");

  fs.writeFileSync(
    inputPath,
    [
      JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message" } })
    ].join("\n")
  );

  assert.throws(
    () =>
      parseCodexJsonTelemetry({
        FACTORY_CODEX_JSONL_PATH: inputPath
      }),
    /No turn\.completed usage event found/
  );
});
