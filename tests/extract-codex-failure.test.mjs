import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCodexFailureFromLogPath,
  extractCodexFailureMessage
} from "../scripts/extract-codex-failure.mjs";

test("extractCodexFailureMessage prefers provider throttle details over generic exit lines", () => {
  const message = extractCodexFailureMessage(`
    reconnecting...
    ERROR: Rate limit reached for gpt-5-codex in organization org_123 on tokens per min: Limit 1000000, Used 964501, Requested 141756
    Error: codex exited with code 1
  `);

  assert.match(message, /Rate limit reached for gpt-5-codex/);
  assert.match(message, /tokens per min/);
  assert.doesNotMatch(message, /codex exited with code 1/i);
});

test("extractCodexFailureMessage falls back to non-provider ERROR lines before generic cli exits", () => {
  const message = extractCodexFailureMessage(`
    some setup
    ERROR: authentication handshake failed
    Error: codex exited with code 1
  `);

  assert.equal(message, "authentication handshake failed");
});

test("extractCodexFailureFromLogPath falls back to the generic failure message when the log is missing", () => {
  const message = extractCodexFailureFromLogPath("/tmp/does-not-exist-codex.log");

  assert.equal(message, "Codex execution failed before branch output could be prepared.");
});
