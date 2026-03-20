import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_API_SURFACE,
  DEFAULT_PROVIDER,
  PRICING_VERSION,
  CHARS_PER_ESTIMATED_TOKEN,
  deriveUsdFromUsage,
  normalizeUsageBuckets
} from "./lib/cost-estimation.mjs";
import { buildUsageEvent, writeUsageEvent } from "./lib/cost-telemetry.mjs";

const FAILURE_OUTPUT_RATIOS = Object.freeze({
  stage_failure: 0.2,
  review_processing_failure: 0.2,
  review_artifact_repair_failure: 0.2
});

function maybeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildFailureDiagnosisEstimate({ promptChars, failureKind }) {
  const inputTokens = Math.ceil(Math.max(0, Number(promptChars) || 0) / CHARS_PER_ESTIMATED_TOKEN);
  const outputRatio = FAILURE_OUTPUT_RATIOS[failureKind] || 0.2;

  return {
    inputTokens,
    cachedInputTokens: 0,
    outputTokens: Math.round(inputTokens * outputRatio),
    reasoningTokens: null
  };
}

function buildPricing(model) {
  const pricingTable = {
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
  };

  return pricingTable[model] || pricingTable["gpt-5-codex"];
}

function buildStageUsageFromEnv(env) {
  return {
    estimatedUsageBeforeCalibration: normalizeUsageBuckets({
      inputTokens: env.FACTORY_ESTIMATED_INPUT_TOKENS_BEFORE_CALIBRATION,
      cachedInputTokens: env.FACTORY_ESTIMATED_CACHED_INPUT_TOKENS_BEFORE_CALIBRATION,
      outputTokens: env.FACTORY_ESTIMATED_OUTPUT_TOKENS_BEFORE_CALIBRATION,
      reasoningTokens: env.FACTORY_ESTIMATED_REASONING_TOKENS_BEFORE_CALIBRATION
    }),
    estimatedUsage: normalizeUsageBuckets({
      inputTokens: env.FACTORY_ESTIMATED_INPUT_TOKENS,
      cachedInputTokens: env.FACTORY_ESTIMATED_CACHED_INPUT_TOKENS,
      outputTokens: env.FACTORY_ESTIMATED_OUTPUT_TOKENS,
      reasoningTokens: env.FACTORY_ESTIMATED_REASONING_TOKENS
    })
  };
}

export function main(env = process.env) {
  const category = `${env.FACTORY_USAGE_CATEGORY || ""}`.trim();
  const runId = `${env.GITHUB_RUN_ID || env.FACTORY_RUN_ID || ""}`.trim();

  if (!category || !runId) {
    throw new Error("FACTORY_USAGE_CATEGORY and GITHUB_RUN_ID are required.");
  }

  const model = `${env.FACTORY_STAGE_MODEL || env.FACTORY_FAILURE_DIAGNOSIS_MODEL || ""}`.trim();
  const issueNumber = toPositiveInteger(env.FACTORY_ISSUE_NUMBER);
  const prNumber = toPositiveInteger(env.FACTORY_PR_NUMBER);
  const branch = `${env.FACTORY_BRANCH || ""}`.trim();
  const runAttempt = toPositiveInteger(env.GITHUB_RUN_ATTEMPT || env.FACTORY_RUN_ATTEMPT);
  const recordedAt = new Date().toISOString();

  let estimatedUsageBeforeCalibration = {};
  let estimatedUsage = {};
  let usageCalibration = {
    bucket: "",
    sampleSize: 0,
    generatedAt: "",
    source: "default",
    multipliers: {
      inputTokens: 1,
      cachedInputTokens: 1,
      outputTokens: 1
    }
  };
  let promptChars = Number(env.FACTORY_PROMPT_CHARS) || 0;

  if (category === "stage") {
    const usage = buildStageUsageFromEnv(env);
    estimatedUsageBeforeCalibration = usage.estimatedUsageBeforeCalibration;
    estimatedUsage = usage.estimatedUsage;
    usageCalibration = {
      bucket: env.FACTORY_USAGE_CALIBRATION_BUCKET || "",
      sampleSize: Number(env.FACTORY_USAGE_CALIBRATION_SAMPLE_SIZE) || 0,
      generatedAt: env.FACTORY_USAGE_CALIBRATION_GENERATED_AT || "",
      source: env.FACTORY_USAGE_CALIBRATION_SOURCE || "default",
      multipliers: {
        inputTokens: Number(env.FACTORY_USAGE_CALIBRATION_INPUT_MULTIPLIER) || 1,
        cachedInputTokens:
          Number(env.FACTORY_USAGE_CALIBRATION_CACHED_INPUT_MULTIPLIER) || 1,
        outputTokens: Number(env.FACTORY_USAGE_CALIBRATION_OUTPUT_MULTIPLIER) || 1
      }
    };
  } else if (category === "failure_diagnosis") {
    if (!promptChars && env.FACTORY_PROMPT_FILE) {
      promptChars = maybeRead(env.FACTORY_PROMPT_FILE).length;
    }
    estimatedUsageBeforeCalibration = buildFailureDiagnosisEstimate({
      promptChars,
      failureKind: env.FACTORY_FAILURE_KIND
    });
    estimatedUsage = estimatedUsageBeforeCalibration;
  } else {
    throw new Error(`Unsupported FACTORY_USAGE_CATEGORY: ${category}`);
  }

  const pricing = buildPricing(model);
  const event = buildUsageEvent({
    category,
    stage: env.FACTORY_MODE || env.FACTORY_STAGE || "",
    failureKind: env.FACTORY_FAILURE_KIND || "",
    issueNumber,
    prNumber,
    branch,
    provider: env.FACTORY_USAGE_PROVIDER || DEFAULT_PROVIDER,
    apiSurface: env.FACTORY_USAGE_API_SURFACE || DEFAULT_API_SURFACE,
    model,
    promptChars,
    runId,
    runAttempt,
    estimatedUsageBeforeCalibration,
    estimatedUsage,
    usageCalibration,
    actualUsage: {},
    derivedCost: {
      estimatedUsdBeforeCalibration: deriveUsdFromUsage(
        estimatedUsageBeforeCalibration,
        pricing
      ),
      estimatedUsd: deriveUsdFromUsage(estimatedUsage, pricing),
      pricingVersion: PRICING_VERSION,
      pricingSource: env.FACTORY_COST_PRICING_SOURCE || "model",
      currency: "USD"
    },
    outcome: env.FACTORY_USAGE_OUTCOME || "succeeded",
    recordedAt
  });
  const eventPath = writeUsageEvent(event);

  process.stdout.write(`${eventPath}\n`);
  return eventPath;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
