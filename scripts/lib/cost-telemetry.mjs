const TELEMETRY_OUTCOMES = Object.freeze({
  succeeded: "succeeded",
  skipped: "skipped"
});

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sanitizeOutcome(outcome) {
  if (!outcome || typeof outcome !== "string") {
    return TELEMETRY_OUTCOMES.succeeded;
  }

  const normalized = outcome.toLowerCase();
  return TELEMETRY_OUTCOMES[normalized] || TELEMETRY_OUTCOMES.succeeded;
}

export function ensureTelemetryArray(summary) {
  if (!summary) {
    throw new Error("Summary is required to ensure telemetry array.");
  }

  if (summary.telemetry == null) {
    summary.telemetry = [];
  }

  if (!Array.isArray(summary.telemetry)) {
    throw new Error("cost-summary telemetry must be an array when present.");
  }

  return summary.telemetry;
}

function resolveStageKey(stageKey, summary) {
  if (stageKey) {
    return stageKey;
  }

  const currentStage = summary?.current?.stage;

  if (currentStage) {
    return currentStage;
  }

  throw new Error("Telemetry stage key could not be resolved from summary.");
}

function resolveStageData(stageKey, stageData, summary) {
  if (stageData && Object.keys(stageData).length > 0) {
    return stageData;
  }

  const stages = summary?.stages || {};

  if (stages[stageKey]) {
    return stages[stageKey];
  }

  throw new Error(`Telemetry stage data missing for stage "${stageKey}".`);
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

export function buildTelemetryEntry({
  summary = {},
  stageKey = "",
  stageData = null,
  context = {},
  outcome = TELEMETRY_OUTCOMES.succeeded,
  recordedAt = new Date().toISOString()
} = {}) {
  const resolvedStageKey = resolveStageKey(stageKey, summary);
  const resolvedStageData = resolveStageData(resolvedStageKey, stageData, summary);
  const issueNumber = normalizeNumber(context.issueNumber ?? summary.issueNumber);
  const prNumber = normalizeNumber(context.prNumber ?? summary.prNumber);
  const runAttempt = normalizeNumber(context.runAttempt);
  const calibrationMultiplier =
    normalizeNonNegative(resolvedStageData.calibrationMultiplier ?? 1) || 1;
  const entry = {
    issueNumber,
    prNumber,
    branch: summary.branch || context.branch || "",
    runId: context.runId ? String(context.runId) : "",
    runAttempt,
    stage: resolvedStageKey,
    model: resolvedStageData.model || context.model || "",
    promptChars: normalizeNonNegative(resolvedStageData.promptChars),
    estimatedInputTokens: normalizeNonNegative(resolvedStageData.estimatedInputTokens),
    stageMultiplier: normalizeNonNegative(resolvedStageData.multiplier),
    pricingSource: resolvedStageData.pricingSource || "",
    estimatedUsdBeforeCalibration: normalizeNonNegative(
      resolvedStageData.estimatedUsdBeforeCalibration ?? resolvedStageData.estimatedUsd
    ),
    estimatedUsd: normalizeNonNegative(resolvedStageData.estimatedUsd),
    calibrationMultiplier,
    calibrationSource: resolvedStageData.calibrationSource || "default",
    calibrationSampleSize: normalizeNonNegative(
      resolvedStageData.calibrationSampleSize ?? context.calibrationSampleSize
    ),
    calibrationKey:
      resolvedStageData.calibrationKey ||
      `${resolvedStageKey}:${resolvedStageData.model || context.model || ""}`,
    calibrationGeneratedAt: resolvedStageData.calibrationGeneratedAt || context.calibrationGeneratedAt || "",
    outcome: sanitizeOutcome(outcome),
    actualInputTokens:
      context.actualInputTokens != null ? normalizeNonNegative(context.actualInputTokens) : null,
    actualUsd: context.actualUsd != null ? normalizeNonNegative(context.actualUsd) : null,
    actualSource: context.actualSource || "",
    recordedAt: recordedAt || new Date().toISOString()
  };

  return cleanObject(entry);
}

export function telemetryEntryKey(entry) {
  if (!entry) {
    return "";
  }

  const stage = entry.stage || "";
  const runId = entry.runId || "";
  const runAttempt =
    entry.runAttempt != null && entry.runAttempt !== ""
      ? String(entry.runAttempt)
      : "";

  if (!stage || !runId) {
    return "";
  }

  return `${stage}::${runId}::${runAttempt}`;
}

export function appendTelemetryEntry(summary, entry) {
  const telemetry = ensureTelemetryArray(summary);
  const key = telemetryEntryKey(entry);

  if (key) {
    const duplicate = telemetry.some((existing) => telemetryEntryKey(existing) === key);

    if (duplicate) {
      return { appended: false, reason: "duplicate" };
    }
  }

  telemetry.push(entry);
  return { appended: true };
}

export { TELEMETRY_OUTCOMES };
