import path from "node:path";
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
  writeCostSummary
} from "./lib/cost-estimation.mjs";

export function main(env = process.env) {
  const mode = env.FACTORY_MODE || "";
  const model = env.FACTORY_STAGE_MODEL || "";
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH || "";
  const issueNumber = Number(env.FACTORY_ISSUE_NUMBER || 0);
  const branch = env.FACTORY_BRANCH || "";

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
    branch
  });
  writeCostSummary(artifactsPath, summary);

  const metadata = buildCostMetadataFromSummary(summary);
  const labels = buildCostLabelUpdate(summary);

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
    cost_label_to_add: labels.addLabel,
    cost_labels_to_remove: labels.removeLabels.join(",")
  });

  console.log(
    `Estimated ${mode} cost: ${summary.current.emoji} $${formatEstimatedUsd(summary.current.stageEstimateUsd)} ` +
      `(total $${formatEstimatedUsd(summary.current.totalEstimatedUsd)}) using ${model}`
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
