import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import {
  buildCostLabelUpdate,
  buildCostMetadataFromSummary,
  estimateStageCost,
  formatEstimatedUsd,
  loadExistingCostSummary,
  readPromptMeta,
  resolveCostThresholds,
  writeCostSummaryAtPath
} from "./lib/cost-estimation.mjs";

export function resolveTemporaryCostSummaryPath(env = process.env) {
  const runnerTemp = env.RUNNER_TEMP || os.tmpdir();
  const issueNumber = Number(env.FACTORY_ISSUE_NUMBER || 0);
  const mode = env.FACTORY_MODE || "stage";

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("FACTORY_ISSUE_NUMBER is required to resolve the temporary cost summary path");
  }

  return path.join(runnerTemp, "factory-cost-estimates", String(issueNumber), `${mode}.json`);
}

export function main(env = process.env) {
  const mode = env.FACTORY_MODE || "";
  const model = env.FACTORY_STAGE_MODEL || "";
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH || "";
  const issueNumber = Number(env.FACTORY_ISSUE_NUMBER || 0);
  const branch = env.FACTORY_BRANCH || "";
  const prNumberValue = Number(env.FACTORY_PR_NUMBER || 0);
  const prNumber = Number.isInteger(prNumberValue) && prNumberValue > 0 ? prNumberValue : null;

  if (!mode || !model || !artifactsPath || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(
      "FACTORY_MODE, FACTORY_STAGE_MODEL, FACTORY_ARTIFACTS_PATH, and FACTORY_ISSUE_NUMBER are required"
    );
  }

  const promptMeta = readPromptMeta(path.join(".factory", "tmp", "prompt-meta.json"));
  const thresholds = resolveCostThresholds(env);
  const existingSummary = loadExistingCostSummary(artifactsPath);
  const summary = estimateStageCost({
    mode,
    model,
    promptChars: promptMeta.finalChars,
    thresholds,
    existingSummary,
    issueNumber,
    branch,
    prNumber
  });
  const costSummaryPath = resolveTemporaryCostSummaryPath(env);
  writeCostSummaryAtPath(costSummaryPath, summary);

  const metadata = buildCostMetadataFromSummary(summary);
  const labels = buildCostLabelUpdate(summary);
  const calibration = summary.current?.usageCalibration || {};
  const usage = summary.current?.estimatedUsage || {};
  const usageBeforeCalibration =
    summary.current?.estimatedUsageBeforeCalibration || {};

  setOutputs({
    cost_estimate_usd: String(metadata.costEstimateUsd),
    cost_estimate_band: metadata.costEstimateBand,
    cost_estimate_emoji: metadata.costEstimateEmoji,
    cost_warn_usd: String(metadata.costWarnUsd),
    cost_high_usd: String(metadata.costHighUsd),
    cost_pricing_source: metadata.costPricingSource,
    last_estimated_stage: metadata.lastEstimatedStage,
    last_estimated_model: metadata.lastEstimatedModel,
    last_stage_cost_estimate_usd: String(metadata.lastStageCostEstimateUsd),
    cost_summary_path: costSummaryPath,
    stage_estimate_usd_before_calibration: String(
      Number(summary.current?.derivedCost?.stageUsdBeforeCalibration) || 0
    ),
    cost_calibration_multiplier: String(
      Number(calibration.multipliers?.outputTokens) || 1
    ),
    cost_calibration_source: calibration.source || "default",
    cost_calibration_sample_size: String(
      Number(calibration.sampleSize) || 0
    ),
    cost_calibration_key: calibration.bucket || "",
    prompt_chars: String(Number(summary.current?.promptChars) || 0),
    estimated_input_tokens: String(Number(usage.inputTokens) || 0),
    estimated_cached_input_tokens: String(Number(usage.cachedInputTokens) || 0),
    estimated_output_tokens: String(Number(usage.outputTokens) || 0),
    estimated_reasoning_tokens: String(Number(usage.reasoningTokens) || 0),
    estimated_input_tokens_before_calibration: String(
      Number(usageBeforeCalibration.inputTokens) || 0
    ),
    estimated_cached_input_tokens_before_calibration: String(
      Number(usageBeforeCalibration.cachedInputTokens) || 0
    ),
    estimated_output_tokens_before_calibration: String(
      Number(usageBeforeCalibration.outputTokens) || 0
    ),
    estimated_reasoning_tokens_before_calibration: String(
      Number(usageBeforeCalibration.reasoningTokens) || 0
    ),
    usage_provider: summary.provider || "",
    usage_api_surface: summary.apiSurface || "",
    usage_pricing_version: summary.pricing?.version || "",
    usage_calibration_input_multiplier: String(
      Number(calibration.multipliers?.inputTokens) || 1
    ),
    usage_calibration_cached_input_multiplier: String(
      Number(calibration.multipliers?.cachedInputTokens) || 1
    ),
    usage_calibration_output_multiplier: String(
      Number(calibration.multipliers?.outputTokens) || 1
    ),
    usage_calibration_generated_at: calibration.generatedAt || "",
    cost_label_to_add: labels.addLabel,
    cost_labels_to_remove: labels.removeLabels.join(",")
  });

  const calibrationNote =
    (Number(calibration.multipliers?.outputTokens) || 1) !== 1
      ? ` (calibrated x${(Number(calibration.multipliers?.outputTokens) || 1).toFixed(3)})`
      : "";
  console.log(
    `Estimated ${mode} cost: ${summary.current.derivedCost.emoji} $${formatEstimatedUsd(summary.current.derivedCost.stageUsd)} ` +
      `(total $${formatEstimatedUsd(summary.current.derivedCost.totalEstimatedUsd)}) using ${model}${calibrationNote}`
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
