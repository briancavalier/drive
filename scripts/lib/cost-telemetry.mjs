import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_API_SURFACE,
  DEFAULT_PROVIDER,
  USAGE_EVENTS_DIR,
  normalizeUsageBuckets
} from "./cost-estimation.mjs";

export const TELEMETRY_OUTCOMES = Object.freeze({
  succeeded: "succeeded",
  failed: "failed",
  skipped: "skipped"
});

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeOutcome(outcome) {
  if (!outcome || typeof outcome !== "string") {
    return TELEMETRY_OUTCOMES.succeeded;
  }

  const normalized = outcome.toLowerCase();
  return TELEMETRY_OUTCOMES[normalized] || TELEMETRY_OUTCOMES.succeeded;
}

function slug(value) {
  return `${value || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event";
}

function isoDatePart(recordedAt) {
  const normalized = `${recordedAt || ""}`.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(normalized)
    ? normalized.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

function resolveDiscriminator(entry) {
  if (entry.category === "stage") {
    return slug(entry.stage);
  }

  return slug(entry.failureKind || entry.kind || "generic");
}

function cleanObject(entry) {
  return Object.fromEntries(
    Object.entries(entry).map(([key, value]) => {
      if (value === undefined) {
        return [key, null];
      }

      return [key, value];
    })
  );
}

export function buildUsageEvent({
  category,
  stage = "",
  failureKind = "",
  issueNumber = null,
  prNumber = null,
  branch = "",
  provider = DEFAULT_PROVIDER,
  apiSurface = DEFAULT_API_SURFACE,
  model = "",
  promptChars = 0,
  runId = "",
  runAttempt = null,
  estimatedUsageBeforeCalibration = {},
  estimatedUsage = {},
  actualUsage = {},
  billableExtras = {},
  derivedCost = {},
  usageCalibration = {},
  outcome = TELEMETRY_OUTCOMES.succeeded,
  recordedAt = new Date().toISOString()
}) {
  const entry = {
    category: `${category || ""}`.trim(),
    stage: stage || null,
    failureKind: failureKind || null,
    provider: provider || DEFAULT_PROVIDER,
    apiSurface: apiSurface || DEFAULT_API_SURFACE,
    model: `${model || ""}`.trim(),
    issueNumber: normalizeNumber(issueNumber),
    prNumber: normalizeNumber(prNumber),
    branch: `${branch || ""}`.trim(),
    runId: `${runId || ""}`.trim(),
    runAttempt: normalizeNumber(runAttempt),
    promptChars: Math.max(0, Number(promptChars) || 0),
    estimatedUsageBeforeCalibration: normalizeUsageBuckets(
      estimatedUsageBeforeCalibration
    ),
    estimatedUsage: normalizeUsageBuckets(estimatedUsage),
    actualUsage: {
      inputTokens:
        actualUsage?.inputTokens == null
          ? null
          : Math.max(0, Number(actualUsage.inputTokens) || 0),
      cachedInputTokens:
        actualUsage?.cachedInputTokens == null
          ? null
          : Math.max(0, Number(actualUsage.cachedInputTokens) || 0),
      outputTokens:
        actualUsage?.outputTokens == null
          ? null
          : Math.max(0, Number(actualUsage.outputTokens) || 0),
      reasoningTokens:
        actualUsage?.reasoningTokens == null
          ? null
          : Math.max(0, Number(actualUsage.reasoningTokens) || 0)
    },
    billableExtras: billableExtras || {},
    usageCalibration: {
      bucket: usageCalibration.bucket || "",
      sampleSize: Number(usageCalibration.sampleSize) || 0,
      generatedAt: usageCalibration.generatedAt || "",
      source: usageCalibration.source || "default",
      multipliers: {
        inputTokens: Number(usageCalibration.multipliers?.inputTokens) || 1,
        cachedInputTokens:
          Number(usageCalibration.multipliers?.cachedInputTokens) || 1,
        outputTokens: Number(usageCalibration.multipliers?.outputTokens) || 1
      }
    },
    derivedCost: {
      estimatedUsdBeforeCalibration:
        Number(derivedCost.estimatedUsdBeforeCalibration) || 0,
      estimatedUsd: Number(derivedCost.estimatedUsd) || 0,
      actualUsd:
        derivedCost.actualUsd == null ? null : Number(derivedCost.actualUsd) || 0,
      pricingVersion: derivedCost.pricingVersion || "",
      pricingSource: derivedCost.pricingSource || "",
      currency: derivedCost.currency || "USD"
    },
    outcome: sanitizeOutcome(outcome),
    recordedAt: recordedAt || new Date().toISOString()
  };

  if (!entry.category) {
    throw new Error("Usage event category is required.");
  }

  if (!entry.runId) {
    throw new Error("Usage event runId is required.");
  }

  if (entry.category === "stage" && !entry.stage) {
    throw new Error("Stage usage events require a stage.");
  }

  if (entry.category === "failure_diagnosis" && !entry.failureKind) {
    throw new Error("Failure diagnosis usage events require a failureKind.");
  }

  return cleanObject(entry);
}

export function usageEventKey(entry) {
  if (!entry?.runId || !entry?.category) {
    return "";
  }

  return [
    entry.runId,
    entry.runAttempt ?? "",
    entry.category,
    resolveDiscriminator(entry)
  ].join("::");
}

export function buildUsageEventPath(event, rootDir = USAGE_EVENTS_DIR) {
  const date = isoDatePart(event.recordedAt);
  const discriminator = resolveDiscriminator(event);
  const fileName = [
    slug(event.runId),
    event.runAttempt ?? "0",
    slug(event.category),
    discriminator
  ].join("-");

  return path.join(rootDir, date, `${fileName}.json`);
}

export function writeUsageEvent(event, rootDir = USAGE_EVENTS_DIR) {
  const eventPath = buildUsageEventPath(event, rootDir);
  fs.mkdirSync(path.dirname(eventPath), { recursive: true });
  fs.writeFileSync(eventPath, JSON.stringify(event, null, 2));
  return eventPath;
}

export function listUsageEventFiles(rootDir = USAGE_EVENTS_DIR) {
  const results = [];

  function walk(dir) {
    let entries = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

export function loadUsageEvents(rootDir = USAGE_EVENTS_DIR) {
  return listUsageEventFiles(rootDir).map((filePath) => {
    const event = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      ...event,
      sourceEventPath: filePath
    };
  });
}
