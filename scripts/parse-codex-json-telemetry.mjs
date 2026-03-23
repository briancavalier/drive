import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";

function normalizeUsage(rawUsage = {}) {
  return {
    inputTokens: Number(rawUsage.inputTokens ?? rawUsage.input_tokens) || 0,
    cachedInputTokens:
      Number(rawUsage.cachedInputTokens ?? rawUsage.cached_input_tokens) || 0,
    outputTokens: Number(rawUsage.outputTokens ?? rawUsage.output_tokens) || 0,
    reasoningTokens:
      rawUsage.reasoningTokens != null || rawUsage.reasoning_tokens != null
        ? Number(rawUsage.reasoningTokens ?? rawUsage.reasoning_tokens) || 0
        : rawUsage.reasoning_output_tokens != null
          ? Number(rawUsage.reasoning_output_tokens) || 0
          : null
  };
}

function parseJsonLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSON on line ${index + 1} of ${filePath}: ${error.message}`
        );
      }
    });
}

function resolveTurnCompletedUsage(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.type === "turn.completed" && event.usage) {
      return {
        eventType: event.type,
        usage: normalizeUsage(event.usage)
      };
    }
  }

  return null;
}

export function main(env = process.env) {
  const inputPath = `${env.FACTORY_CODEX_JSONL_PATH || ""}`.trim();
  const outputPath =
    `${env.FACTORY_CODEX_USAGE_OUTPUT_PATH || ""}`.trim() ||
    path.join(path.dirname(inputPath), "codex-usage.json");

  if (!inputPath) {
    throw new Error("FACTORY_CODEX_JSONL_PATH is required.");
  }

  const events = parseJsonLines(inputPath);
  const resolved = resolveTurnCompletedUsage(events);

  if (!resolved) {
    throw new Error(
      `No turn.completed usage event found in Codex JSON telemetry at ${inputPath}.`
    );
  }

  const payload = {
    source: "codex-exec-json",
    apiSurface: "codex-cli",
    sourcePath: inputPath,
    eventCount: events.length,
    eventType: resolved.eventType,
    actualUsage: resolved.usage
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  setOutputs({
    actual_usage_path: outputPath,
    input_tokens: String(payload.actualUsage.inputTokens),
    cached_input_tokens: String(payload.actualUsage.cachedInputTokens),
    output_tokens: String(payload.actualUsage.outputTokens),
    reasoning_tokens:
      payload.actualUsage.reasoningTokens == null
        ? ""
        : String(payload.actualUsage.reasoningTokens)
  });

  process.stdout.write(`${outputPath}\n`);
  return outputPath;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
