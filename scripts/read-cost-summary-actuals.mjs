import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";

function maybeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function main(env = process.env) {
  const artifactsPath = `${env.FACTORY_ARTIFACTS_PATH || ""}`.trim();

  if (!artifactsPath) {
    throw new Error("FACTORY_ARTIFACTS_PATH is required.");
  }

  const summaryPath = path.join(artifactsPath, "cost-summary.json");
  const summary = maybeReadJson(summaryPath);
  const current = summary?.current || {};
  const actualUsage = current.actualUsage || {};
  const derivedCost = current.derivedCost || {};

  setOutputs({
    actual_api_surface: `${current.apiSurface || summary?.apiSurface || ""}`.trim(),
    actual_stage_cost_usd:
      derivedCost.actualUsd == null ? "" : String(Number(derivedCost.actualUsd) || 0),
    actual_input_tokens:
      actualUsage.inputTokens == null ? "" : String(Number(actualUsage.inputTokens) || 0),
    actual_cached_input_tokens:
      actualUsage.cachedInputTokens == null
        ? ""
        : String(Number(actualUsage.cachedInputTokens) || 0),
    actual_output_tokens:
      actualUsage.outputTokens == null ? "" : String(Number(actualUsage.outputTokens) || 0),
    actual_reasoning_tokens:
      actualUsage.reasoningTokens == null
        ? ""
        : String(Number(actualUsage.reasoningTokens) || 0)
  });

  process.stdout.write(`${summaryPath}\n`);
  return summaryPath;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
