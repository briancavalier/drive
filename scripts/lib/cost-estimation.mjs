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
export const USAGE_CALIBRATION_FILE_NAME = "usage-calibration.json";
export const USAGE_EVENTS_DIR = path.join(".factory", "usage-events");
export const CHARS_PER_ESTIMATED_TOKEN = 4;
export const PRICING_VERSION = "openai-2026-03-19";
export const DEFAULT_PROVIDER = "openai";
export const DEFAULT_API_SURFACE = "codex-action";
export const COST_BAND_EMOJI = Object.freeze({
  [FACTORY_COST_BANDS.low]: "🟢",
  [FACTORY_COST_BANDS.medium]: "🟡",
  [FACTORY_COST_BANDS.high]: "🔴"
});
export const MODEL_PRICING = Object.freeze({
  "gpt-5-codex": {
    inputPer1M: 1.25,
    cachedInputPer1M: 0.125,
    outputPer1M: 10
  },
  "gpt-5-mini": {
    inputPer1M: 0.25,
    cachedInputPer1M: 0.025,
    outputPer1M: 2
  }
});
export const FALLBACK_MODEL_PRICING = Object.freeze({
  inputPer1M: 1.25,
  cachedInputPer1M: 0.125,
  outputPer1M: 10
});

const DEFAULT_CALIBRATION_PATH = path.join(".factory", USAGE_CALIBRATION_FILE_NAME);
const STAGE_OUTPUT_TOKEN_RATIOS = Object.freeze({
  [FACTORY_STAGE_MODES.plan]: 0.15,
  [FACTORY_STAGE_MODES.implement]: 1.25,
  [FACTORY_STAGE_MODES.repair]: 0.8,
  [FACTORY_STAGE_MODES.review]: 0.35
});

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function roundUsage(value) {
  return Math.max(0, Math.round(Number(value || 0)));
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

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUsageBuckets(value = {}) {
  return {
    inputTokens: roundUsage(value.inputTokens),
    cachedInputTokens: roundUsage(value.cachedInputTokens),
    outputTokens: roundUsage(value.outputTokens),
    reasoningTokens:
      value.reasoningTokens == null ? null : roundUsage(value.reasoningTokens)
  };
}

function sumUsageBuckets(entries = []) {
  const total = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: null
  };

  for (const entry of entries) {
    const usage = normalizeUsageBuckets(entry);
    total.inputTokens += usage.inputTokens;
    total.cachedInputTokens += usage.cachedInputTokens;
    total.outputTokens += usage.outputTokens;
  }

  return total;
}

function resolveModelPricing(model) {
  if (MODEL_PRICING[model]) {
    return {
      pricing: MODEL_PRICING[model],
      pricingSource: "model"
    };
  }

  return {
    pricing: FALLBACK_MODEL_PRICING,
    pricingSource: "fallback"
  };
}

function deriveUsdFromUsage(usage, pricing) {
  const normalized = normalizeUsageBuckets(usage);

  return roundCurrency(
    (normalized.inputTokens / 1_000_000) * pricing.inputPer1M +
      (normalized.cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M +
      (normalized.outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

function defaultCalibration(key) {
  return {
    key,
    sampleSize: 0,
    source: "default",
    generatedAt: "",
    multipliers: {
      inputTokens: 1,
      cachedInputTokens: 1,
      outputTokens: 1
    }
  };
}

function applyUsageCalibration(usage, calibration) {
  const normalized = normalizeUsageBuckets(usage);
  const multipliers = calibration?.multipliers || {};

  return {
    inputTokens: roundUsage(
      normalized.inputTokens * (Number(multipliers.inputTokens) || 1)
    ),
    cachedInputTokens: roundUsage(
      normalized.cachedInputTokens * (Number(multipliers.cachedInputTokens) || 1)
    ),
    outputTokens: roundUsage(
      normalized.outputTokens * (Number(multipliers.outputTokens) || 1)
    ),
    reasoningTokens: normalized.reasoningTokens
  };
}

function buildCalibrationInfo(calibrationData, key) {
  if (!calibrationData?.buckets || !key) {
    return defaultCalibration(key);
  }

  const bucket = calibrationData.buckets[key];

  if (!bucket) {
    return defaultCalibration(key);
  }

  return {
    key,
    sampleSize: Number(bucket.sampleSize) || 0,
    source: bucket.source || "telemetry",
    generatedAt: bucket.generatedAt || calibrationData.generatedAt || "",
    multipliers: {
      inputTokens: Number(bucket.multipliers?.inputTokens) || 1,
      cachedInputTokens: Number(bucket.multipliers?.cachedInputTokens) || 1,
      outputTokens: Number(bucket.multipliers?.outputTokens) || 1
    }
  };
}

function estimateStageUsage({ mode, promptChars }) {
  const inputTokens = estimateInputTokensFromChars(promptChars);
  const outputRatio = STAGE_OUTPUT_TOKEN_RATIOS[mode];

  if (!outputRatio) {
    throw new Error(`Unsupported cost estimation mode: ${mode}`);
  }

  return {
    inputTokens,
    cachedInputTokens: 0,
    outputTokens: roundUsage(inputTokens * outputRatio),
    reasoningTokens: null
  };
}

function normalizeLegacyStage(stage = {}, mode = "") {
  if (stage.estimatedUsage) {
    return stage;
  }

  return {
    mode: stage.mode || mode,
    provider: DEFAULT_PROVIDER,
    apiSurface: DEFAULT_API_SURFACE,
    model: stage.model || "",
    promptChars: Number(stage.promptChars) || 0,
    estimatedUsageBeforeCalibration: normalizeUsageBuckets({
      inputTokens: stage.estimatedInputTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null
    }),
    estimatedUsage: normalizeUsageBuckets({
      inputTokens: stage.estimatedInputTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null
    }),
    usageCalibration: {
      bucket: stage.calibrationKey || `${mode}:${stage.model || ""}:${DEFAULT_PROVIDER}`,
      sampleSize: Number(stage.calibrationSampleSize) || 0,
      generatedAt: stage.calibrationGeneratedAt || "",
      source: stage.calibrationSource || "default",
      multipliers: {
        inputTokens: Number(stage.calibrationMultiplier) || 1,
        cachedInputTokens: 1,
        outputTokens: 1
      }
    },
    derivedCost: {
      stageUsdBeforeCalibration: Number(stage.estimatedUsdBeforeCalibration ?? stage.estimatedUsd) || 0,
      stageUsd: Number(stage.estimatedUsd) || 0,
      pricingSource: stage.pricingSource || "fallback"
    }
  };
}

function normalizeLegacySummary(summary) {
  if (!summary || summary.pricing || !summary.stages) {
    return summary;
  }

  const stages = Object.fromEntries(
    Object.entries(summary.stages || {}).map(([mode, stage]) => [
      mode,
      normalizeLegacyStage(stage, mode)
    ])
  );
  const currentMode = summary.current?.stage || summary.current?.mode || "";
  const currentStage = currentMode && stages[currentMode] ? stages[currentMode] : null;
  const totalEstimatedUsd = Object.values(stages).reduce(
    (sum, stage) => sum + (Number(stage?.derivedCost?.stageUsd) || 0),
    0
  );
  const thresholds = summary.thresholds || {
    warnUsd: DEFAULT_FACTORY_COST_WARN_USD,
    highUsd: DEFAULT_FACTORY_COST_HIGH_USD
  };
  const band = classifyCostBand(totalEstimatedUsd, thresholds);

  return {
    issueNumber: summary.issueNumber ?? null,
    prNumber: summary.prNumber ?? null,
    branch: summary.branch || "",
    estimated: true,
    provider: DEFAULT_PROVIDER,
    apiSurface: DEFAULT_API_SURFACE,
    pricing: {
      version: PRICING_VERSION,
      model: currentStage?.model || summary.current?.model || "",
      currency: "USD"
    },
    thresholds,
    heuristic: {
      charsPerToken: CHARS_PER_ESTIMATED_TOKEN,
      stageOutputTokenRatios: STAGE_OUTPUT_TOKEN_RATIOS
    },
    current: currentStage
      ? {
          stage: currentMode,
          provider: currentStage.provider,
          apiSurface: currentStage.apiSurface,
          model: currentStage.model,
          promptChars: currentStage.promptChars,
          estimatedUsageBeforeCalibration: currentStage.estimatedUsageBeforeCalibration,
          estimatedUsage: currentStage.estimatedUsage,
          usageCalibration: currentStage.usageCalibration,
          derivedCost: {
            stageUsdBeforeCalibration:
              currentStage.derivedCost.stageUsdBeforeCalibration,
            stageUsd: currentStage.derivedCost.stageUsd,
            totalEstimatedUsd: roundCurrency(totalEstimatedUsd),
            band,
            emoji: COST_BAND_EMOJI[band],
            pricingSource: currentStage.derivedCost.pricingSource
          }
        }
      : {},
    stages,
    telemetry: Array.isArray(summary.telemetry) ? summary.telemetry : []
  };
}

export function loadCostSummary(summaryPath) {
  if (!summaryPath) {
    return null;
  }

  const summary = maybeReadJson(summaryPath);
  return normalizeLegacySummary(summary);
}

export function loadUsageCalibration(calibrationPath = DEFAULT_CALIBRATION_PATH) {
  const calibration = maybeReadJson(calibrationPath);

  if (!calibration || typeof calibration !== "object") {
    return null;
  }

  if (calibration.buckets && typeof calibration.buckets === "object") {
    return calibration;
  }

  return null;
}

export function loadCostCalibration(calibrationPath = DEFAULT_CALIBRATION_PATH) {
  return loadUsageCalibration(calibrationPath);
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
      highUsd:
        DEFAULT_FACTORY_COST_HIGH_USD > warnUsd
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
  const calibrationData =
    calibration === undefined ? loadUsageCalibration() : calibration;
  const calibrationKey = `${DEFAULT_PROVIDER}:stage:${mode}:${model}`;
  const calibrationInfo = buildCalibrationInfo(calibrationData, calibrationKey);
  const estimatedUsageBeforeCalibration = estimateStageUsage({ mode, promptChars });
  const estimatedUsage = applyUsageCalibration(
    estimatedUsageBeforeCalibration,
    calibrationInfo
  );
  const { pricing, pricingSource } = resolveModelPricing(model);
  const stageUsdBeforeCalibration = deriveUsdFromUsage(
    estimatedUsageBeforeCalibration,
    pricing
  );
  const stageUsd = deriveUsdFromUsage(estimatedUsage, pricing);
  const previousStages = Object.fromEntries(
    Object.entries(existingSummary?.stages || {}).map(([stageMode, stage]) => [
      stageMode,
      normalizeLegacyStage(stage, stageMode)
    ])
  );
  const stages = {
    ...previousStages,
    [mode]: {
      mode,
      provider: DEFAULT_PROVIDER,
      apiSurface: DEFAULT_API_SURFACE,
      model,
      promptChars,
      estimatedUsageBeforeCalibration,
      estimatedUsage,
      usageCalibration: {
        bucket: calibrationInfo.key,
        sampleSize: calibrationInfo.sampleSize,
        generatedAt: calibrationInfo.generatedAt,
        source: calibrationInfo.source,
        multipliers: calibrationInfo.multipliers
      },
      derivedCost: {
        stageUsdBeforeCalibration,
        stageUsd,
        pricingSource
      }
    }
  };
  const totalEstimatedUsd = roundCurrency(
    Object.values(stages).reduce(
      (sum, stage) => sum + (Number(stage?.derivedCost?.stageUsd) || 0),
      0
    )
  );
  const band = classifyCostBand(totalEstimatedUsd, thresholds);
  const emoji = COST_BAND_EMOJI[band];
  const resolvedPrNumber =
    prNumber != null
      ? toPositiveInteger(prNumber)
      : toPositiveInteger(existingSummary?.prNumber);

  return {
    issueNumber,
    prNumber: resolvedPrNumber,
    branch,
    estimated: true,
    provider: DEFAULT_PROVIDER,
    apiSurface: DEFAULT_API_SURFACE,
    pricing: {
      version: PRICING_VERSION,
      model,
      currency: "USD"
    },
    thresholds,
    heuristic: {
      charsPerToken: CHARS_PER_ESTIMATED_TOKEN,
      stageOutputTokenRatios: STAGE_OUTPUT_TOKEN_RATIOS
    },
    current: {
      stage: mode,
      provider: DEFAULT_PROVIDER,
      apiSurface: DEFAULT_API_SURFACE,
      model,
      promptChars,
      estimatedUsageBeforeCalibration,
      estimatedUsage,
      usageCalibration: {
        bucket: calibrationInfo.key,
        sampleSize: calibrationInfo.sampleSize,
        generatedAt: calibrationInfo.generatedAt,
        source: calibrationInfo.source,
        multipliers: calibrationInfo.multipliers
      },
      derivedCost: {
        stageUsdBeforeCalibration,
        stageUsd,
        totalEstimatedUsd,
        band,
        emoji,
        pricingSource
      }
    },
    stages,
    telemetry: []
  };
}

export function buildCostMetadataFromSummary(summary) {
  const current = summary?.current || {};
  const thresholds = summary?.thresholds || {};
  const derivedCost = current.derivedCost || {};
  const actualUsage = current.actualUsage || {};

  return {
    costEstimateUsd: Number(derivedCost.totalEstimatedUsd) || 0,
    costEstimateBand: derivedCost.band || "",
    costEstimateEmoji: derivedCost.emoji || "",
    costWarnUsd: Number(thresholds.warnUsd) || DEFAULT_FACTORY_COST_WARN_USD,
    costHighUsd: Number(thresholds.highUsd) || DEFAULT_FACTORY_COST_HIGH_USD,
    costPricingSource: derivedCost.pricingSource || "",
    lastEstimatedStage: current.stage || "",
    lastEstimatedModel: current.model || "",
    lastStageCostEstimateUsd: Number(derivedCost.stageUsd) || 0,
    actualApiSurface: current.apiSurface || summary?.apiSurface || null,
    actualStageCostUsd:
      derivedCost.actualUsd == null ? null : Number(derivedCost.actualUsd),
    actualInputTokens:
      actualUsage.inputTokens == null ? null : Number(actualUsage.inputTokens),
    actualCachedInputTokens:
      actualUsage.cachedInputTokens == null
        ? null
        : Number(actualUsage.cachedInputTokens),
    actualOutputTokens:
      actualUsage.outputTokens == null ? null : Number(actualUsage.outputTokens),
    actualReasoningTokens:
      actualUsage.reasoningTokens == null
        ? null
        : Number(actualUsage.reasoningTokens)
  };
}

export function buildCostLabelUpdate(summary) {
  const band = summary?.current?.derivedCost?.band || "";
  const addLabel = labelForCostBand(band);
  const removeLabels = Object.values(FACTORY_COST_BANDS)
    .map((value) => labelForCostBand(value))
    .filter((label) => label && label !== addLabel);

  return {
    addLabel,
    removeLabels
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

export function summarizeIssueUsageEvents(events = [], { issueNumber, prNumber, branch }) {
  const stageEvents = events.filter((event) => event.category === "stage");
  const latestStageByMode = new Map();

  for (const event of stageEvents) {
    const mode = event.stage || "";

    if (!mode) {
      continue;
    }

    const current = latestStageByMode.get(mode);

    if (!current || `${event.recordedAt || ""}` >= `${current.recordedAt || ""}`) {
      latestStageByMode.set(mode, event);
    }
  }

  const stages = {};

  for (const [mode, event] of latestStageByMode.entries()) {
    stages[mode] = {
      mode,
      provider: event.provider || DEFAULT_PROVIDER,
      apiSurface: event.apiSurface || DEFAULT_API_SURFACE,
      model: event.model || "",
      promptChars: Number(event.promptChars) || 0,
      estimatedUsageBeforeCalibration: normalizeUsageBuckets(
        event.estimatedUsageBeforeCalibration
      ),
      estimatedUsage: normalizeUsageBuckets(event.estimatedUsage),
      actualUsage: normalizeUsageBuckets(event.actualUsage),
      usageCalibration: {
        bucket: event.usageCalibration?.bucket || "",
        sampleSize: Number(event.usageCalibration?.sampleSize) || 0,
        generatedAt: event.usageCalibration?.generatedAt || "",
        source: event.usageCalibration?.source || "default",
        multipliers: {
          inputTokens:
            Number(event.usageCalibration?.multipliers?.inputTokens) || 1,
          cachedInputTokens:
            Number(event.usageCalibration?.multipliers?.cachedInputTokens) || 1,
          outputTokens:
            Number(event.usageCalibration?.multipliers?.outputTokens) || 1
        }
      },
      derivedCost: {
        stageUsdBeforeCalibration:
          Number(event.derivedCost?.estimatedUsdBeforeCalibration) || 0,
        stageUsd: Number(event.derivedCost?.estimatedUsd) || 0,
        actualUsd:
          event.derivedCost?.actualUsd == null
            ? null
            : Number(event.derivedCost.actualUsd) || 0,
        pricingSource: event.derivedCost?.pricingSource || "fallback"
      },
      sourceEventPath: event.sourceEventPath || ""
    };
  }

  const totalEstimatedUsd = roundCurrency(
    Object.values(stages).reduce(
      (sum, stage) => sum + (Number(stage?.derivedCost?.stageUsd) || 0),
      0
    )
  );
  const thresholds = {
    warnUsd: DEFAULT_FACTORY_COST_WARN_USD,
    highUsd: DEFAULT_FACTORY_COST_HIGH_USD
  };
  const currentStageMode = [...latestStageByMode.entries()]
    .sort(([, left], [, right]) => `${left.recordedAt || ""}`.localeCompare(`${right.recordedAt || ""}`))
    .at(-1)?.[0] || "";
  const currentStage = currentStageMode ? stages[currentStageMode] : null;
  const band = classifyCostBand(totalEstimatedUsd, thresholds);

  return {
    issueNumber: issueNumber ?? null,
    prNumber: prNumber ?? null,
    branch: branch || "",
    estimated: true,
    provider: currentStage?.provider || DEFAULT_PROVIDER,
    apiSurface: currentStage?.apiSurface || DEFAULT_API_SURFACE,
    pricing: {
      version: PRICING_VERSION,
      model: currentStage?.model || "",
      currency: "USD"
    },
    thresholds,
    heuristic: {
      charsPerToken: CHARS_PER_ESTIMATED_TOKEN,
      stageOutputTokenRatios: STAGE_OUTPUT_TOKEN_RATIOS
    },
    current: currentStage
      ? {
          stage: currentStageMode,
          provider: currentStage.provider,
          apiSurface: currentStage.apiSurface,
          model: currentStage.model,
          promptChars: currentStage.promptChars,
          estimatedUsageBeforeCalibration:
            currentStage.estimatedUsageBeforeCalibration,
          estimatedUsage: currentStage.estimatedUsage,
          actualUsage: currentStage.actualUsage,
          usageCalibration: currentStage.usageCalibration,
          derivedCost: {
            stageUsdBeforeCalibration:
              currentStage.derivedCost.stageUsdBeforeCalibration,
            stageUsd: currentStage.derivedCost.stageUsd,
            actualUsd: currentStage.derivedCost.actualUsd,
            totalEstimatedUsd,
            band,
            emoji: COST_BAND_EMOJI[band],
            pricingSource: currentStage.derivedCost.pricingSource
          },
          sourceEventPath: currentStage.sourceEventPath || ""
        }
      : {},
    stages
  };
}

export { deriveUsdFromUsage, normalizeUsageBuckets, sumUsageBuckets };
