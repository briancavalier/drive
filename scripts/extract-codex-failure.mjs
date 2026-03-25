import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PROVIDER_FAILURE_PATTERNS =
  /stream disconnected before completion|rate limit reached|tokens per min|too many requests|quota exceeded|usage limit/i;

const GENERIC_CLI_EXIT_PATTERN = /codex exited with code/i;

export function extractCodexFailureMessage(log = "") {
  const lines = `${log || ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (PROVIDER_FAILURE_PATTERNS.test(line)) {
      return line;
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (/ERROR:/i.test(line) && !GENERIC_CLI_EXIT_PATTERN.test(line)) {
      return line.replace(/^.*ERROR:\s*/i, "").trim();
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (GENERIC_CLI_EXIT_PATTERN.test(line)) {
      return line;
    }
  }

  return lines.slice(-20).join("\n").trim();
}

export function extractCodexFailureFromLogPath(logPath) {
  const log = logPath && fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";

  return extractCodexFailureMessage(log) || "Codex execution failed before branch output could be prepared.";
}

function main(argv = process.argv) {
  const logPath = `${argv[2] || ""}`.trim();
  process.stdout.write(extractCodexFailureFromLogPath(logPath));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
