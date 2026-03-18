import fs from "node:fs";
import path from "node:path";
import {
  FACTORY_COST_BANDS,
  FACTORY_STAGE_MODES,
  DEFAULT_FACTORY_COST_HIGH_USD,
  DEFAULT_FACTORY_COST_WARN_USD,
  labelForCostBand
} from "./factory-config.mjs";

export const COST_SUMMARY_FILE_NAME = "cost-summary.json";
export const CHARS_PER_ESTIMATED_TOKEN = 4;
export const COST_BAND_EMOJI = Object.freeze({
  [FACTORY_COST_BANDS.low]: "🟢",
  [FACTORY_COST_BANDS.medium]: "🟡",
  [FACTORY_COST_BANDS.high]: "🔴"
});
export const STAGE_COST_MULTIPLIERS = Object.freeze({
  [FACTORY_STAGE_MODES.plan]: 1.5,
  [FACTORY_STAGE_MODES.implement]: 4.0,
  [FACTORY_STAGE_MODES.repair]: 3.0,
  [FACTORY_STAGE_MODES.review]: 2.0
});
export const MODEL_PRICING = Object.freeze({
  "gpt-5-codex": {
    inputPer1M: 1.25
  },
  "gpt-5-mini": {
    // Matches the prior lightweight tier until official pricing guidance is available.
    inputPer1M: 0.25
  }
});
export const FALLBACK_MODEL_PRICING = Object.freeze({
  inputPer1M: 1.25
});
export const COST_CALIBRATION_FILE_NAME = "cost-calibration.json";
const DEFAULT_CALIBRATION_PATH = path.join(".factory", COST_CALIBRATION_FILE_NAME);

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

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

export function loadCostSummary(summaryPath) {
  if (!summaryPath) {
    return null;
  }

  return maybeReadJson(summaryPath);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function loadCostCalibration(calibrationPath = DEFAULT_CALIBRATION_PATH) {
  const calibration = maybeReadJson(calibrationPath);

  if (!calibration || typeof calibration !== "object") {
    return null;
  }

  if (calibration.buckets && typeof calibration.buckets === "object") {
    return calibration;
  }

  return null;
}

function resolveCalibrationForStage(calibrationData, { stage, model }) {
  if (!calibrationData?.buckets || !stage || !model) {
    return {
      multiplier: 1,
      sampleSize: 0,
      source: "default",
      key: `${stage}:${model}`,
      generatedAt: ""
    };
  }

  const key = `${stage}:${model}`;
  const bucket = calibrationData.buckets[key];

  if (!bucket) {
    return {
      multiplier: 1,
      sampleSize: 0,
      source: "default",
      key,
      generatedAt: ""
    };
  }

  const parsedMultiplier = Number(bucket.multiplier);
  const multiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 1;
  const sampleSize = Number.isFinite(Number(bucket.sampleSize)) ? Number(bucket.sampleSize) : 0;

  return {
    multiplier,
    sampleSize,
    source: bucket.source || "telemetry",
    key,
    generatedAt: bucket.generatedAt || calibrationData.generatedAt || ""
  };
}

export function resolveCostThresholds(env = process.env) {
  const warnUsd = positiveNumber(
    env.FACTORY_COST_WARN_USD,
    DEFAULT_FACTORY_COST_WARN_USD
  );
  const highUsd = positiveNumber(
    env.FACTORY_COST_HIGH_USD,
    DEFAULT_FACTORY_COST_HIGH_USD
  );

  if (highUsd <= warnUsd) {
    return {
      warnUsd,
      highUsd: DEFAULT_FACTORY_COST_HIGH_USD > warnUsd
        ? DEFAULT_FACTORY_COST_HIGH_USD
        : warnUsd + DEFAULT_FACTORY_COST_WARN_USD
    };
  }

  return { warnUsd, highUsd };
}

export function estimateInputTokensFromChars(promptChars) {
  const normalizedChars = Math.max(0, Number(promptChars) || 0);
  return Math.ceil(normalizedChars / CHARS_PER_ESTIMATED_TOKEN);
}

export function classifyCostBand(totalUsd, thresholds) {
  const total = Number(totalUsd) || 0;

  if (total >= thresholds.highUsd) {
    return FACTORY_COST_BANDS.high;
  }

  if (total >= thresholds.warnUsd) {
    return FACTORY_COST_BANDS.medium;
  }

  return FACTORY_COST_BANDS.low;
}

export function formatEstimatedUsd(value) {
  const amount = Number(value) || 0;

  if (amount >= 1) {
    return amount.toFixed(2);
  }

  if (amount >= 0.1) {
    return amount.toFixed(3);
  }

  return amount.toFixed(4);
}

export function readPromptMeta(promptMetaPath) {
  const promptMeta = maybeReadJson(promptMetaPath);

  if (promptMeta?.finalChars != null) {
    return promptMeta;
  }

  throw new Error(`Missing or invalid prompt metadata at ${promptMetaPath}`);
}

export function loadExistingCostSummary(artifactsPath) {
  if (!artifactsPath) {
    return null;
  }

  return loadCostSummary(path.join(artifactsPath, COST_SUMMARY_FILE_NAME));
}

export function estimateStageCost({
  mode,
  model,
  promptChars,
  thresholds,
  existingSummary = null,
  issueNumber,
  branch,
  prNumber = null,
  calibration = undefined
}) {
  const pricing = MODEL_PRICING[model] || FALLBACK_MODEL_PRICING;
  const pricingSource = MODEL_PRICING[model] ? "model" : "fallback";
  const estimatedInputTokens = estimateInputTokensFromChars(promptChars);
  const multiplier = STAGE_COST_MULTIPLIERS[mode];

  if (!multiplier) {
    throw new Error(`Unsupported cost estimation mode: ${mode}`);
  }

  const estimatedInputUsd = (estimatedInputTokens / 1_000_000) * pricing.inputPer1M;
  const estimatedUsdBeforeCalibration = roundCurrency(estimatedInputUsd * multiplier);
  const calibrationData = calibration === undefined ? loadCostCalibration() : calibration;
  const calibrationInfo = resolveCalibrationForStage(calibrationData, { stage: mode, model });
  const estimatedUsd = roundCurrency(estimatedUsdBeforeCalibration * calibrationInfo.multiplier);
  const previousStages = existingSummary?.stages || {};
  const stages = {
    ...previousStages,
    [mode]: {
      mode,
      model,
      promptChars,
      estimatedInputTokens,
      multiplier,
      estimatedUsdBeforeCalibration,
      estimatedUsd,
      pricingSource,
      calibrationMultiplier: calibrationInfo.multiplier,
      calibrationSource: calibrationInfo.source,
      calibrationSampleSize: calibrationInfo.sampleSize,
      calibrationKey: calibrationInfo.key,
      calibrationGeneratedAt: calibrationInfo.generatedAt
    }
  };
  const totalEstimatedUsd = roundCurrency(
    Object.values(stages).reduce(
      (sum, stage) => sum + (Number(stage?.estimatedUsd) || 0),
      0
    )
  );
  const band = classifyCostBand(totalEstimatedUsd, thresholds);
  const emoji = COST_BAND_EMOJI[band];
  const telemetry = Array.isArray(existingSummary?.telemetry)
    ? [...existingSummary.telemetry]
    : [];
  const resolvedPrNumber =
    prNumber != null ? toPositiveInteger(prNumber) : toPositiveInteger(existingSummary?.prNumber);

  return {
    issueNumber,
    prNumber: resolvedPrNumber,
    branch,
    estimated: true,
    thresholds,
    heuristic: {
      charsPerToken: CHARS_PER_ESTIMATED_TOKEN,
      stageMultipliers: STAGE_COST_MULTIPLIERS
    },
    current: {
      stage: mode,
      model,
      stageEstimateUsd: estimatedUsd,
      stageEstimateUsdBeforeCalibration: estimatedUsdBeforeCalibration,
      totalEstimatedUsd,
      band,
      emoji,
      pricingSource,
      calibrationMultiplier: calibrationInfo.multiplier,
      calibrationSource: calibrationInfo.source,
      calibrationSampleSize: calibrationInfo.sampleSize,
      calibrationKey: calibrationInfo.key,
      calibrationGeneratedAt: calibrationInfo.generatedAt
    },
    stages,
    telemetry
  };
}

export function writeCostSummaryAtPath(summaryPath, summary) {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  return summaryPath;
}

export function writeCostSummary(artifactsPath, summary) {
  return writeCostSummaryAtPath(
    path.join(artifactsPath, COST_SUMMARY_FILE_NAME),
    summary
  );
}

export function buildCostMetadataFromSummary(summary) {
  const current = summary?.current || {};
  const thresholds = summary?.thresholds || {};

  return {
    costEstimateUsd: Number(current.totalEstimatedUsd) || 0,
    costEstimateBand: current.band || "",
    costEstimateEmoji: current.emoji || "",
    costWarnUsd: Number(thresholds.warnUsd) || DEFAULT_FACTORY_COST_WARN_USD,
    costHighUsd: Number(thresholds.highUsd) || DEFAULT_FACTORY_COST_HIGH_USD,
    costPricingSource: current.pricingSource || "",
    lastEstimatedStage: current.stage || "",
    lastEstimatedModel: current.model || "",
    lastStageCostEstimateUsd: Number(current.stageEstimateUsd) || 0
  };
}

export function buildCostLabelUpdate(summary) {
  const band = summary?.current?.band || "";
  const addLabel = labelForCostBand(band);
  const removeLabels = Object.values(FACTORY_COST_BANDS)
    .map((value) => labelForCostBand(value))
    .filter((label) => label && label !== addLabel);

  return {
    addLabel,
    removeLabels
  };
}
