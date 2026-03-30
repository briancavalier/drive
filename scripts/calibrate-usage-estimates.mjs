import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USAGE_CALIBRATION_FILE_NAME, USAGE_EVENTS_DIR } from "./lib/cost-estimation.mjs";
import { loadUsageEvents } from "./lib/cost-telemetry.mjs";
import { setOutputs } from "./lib/actions-output.mjs";

const OUTPUT_PATH = path.join(".factory", USAGE_CALIBRATION_FILE_NAME);

function roundToFour(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function isUsableCount(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
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

function bucketKey(event) {
  if (event.category === "stage") {
    return `${event.provider}:${event.category}:${event.stage}:${event.model}`;
  }

  return `${event.provider}:${event.category}:${event.failureKind}:${event.model}`;
}

function aggregate(events) {
  const buckets = new Map();
  let skipped = 0;

  for (const event of events) {
    const actual = event.actualUsage || {};
    const estimated = event.estimatedUsageBeforeCalibration || {};

    if (
      !isUsableCount(actual.inputTokens) &&
      !isUsableCount(actual.cachedInputTokens) &&
      !isUsableCount(actual.outputTokens)
    ) {
      skipped += 1;
      continue;
    }

    if (
      !isUsableCount(estimated.inputTokens) &&
      !isUsableCount(estimated.cachedInputTokens) &&
      !isUsableCount(estimated.outputTokens)
    ) {
      skipped += 1;
      continue;
    }

    const key = bucketKey(event);
    const bucket = buckets.get(key) || {
      provider: event.provider,
      category: event.category,
      stage: event.stage || "",
      failureKind: event.failureKind || "",
      model: event.model,
      sampleSize: 0,
      lastRecordedAt: "",
      totals: {
        estimated: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0
        },
        actual: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0
        }
      }
    };

    bucket.sampleSize += 1;
    bucket.lastRecordedAt =
      `${event.recordedAt || ""}` > `${bucket.lastRecordedAt || ""}`
        ? event.recordedAt
        : bucket.lastRecordedAt;
    bucket.totals.estimated.inputTokens += Number(estimated.inputTokens) || 0;
    bucket.totals.estimated.cachedInputTokens +=
      Number(estimated.cachedInputTokens) || 0;
    bucket.totals.estimated.outputTokens += Number(estimated.outputTokens) || 0;
    bucket.totals.actual.inputTokens += Number(actual.inputTokens) || 0;
    bucket.totals.actual.cachedInputTokens +=
      Number(actual.cachedInputTokens) || 0;
    bucket.totals.actual.outputTokens += Number(actual.outputTokens) || 0;

    buckets.set(key, bucket);
  }

  return { buckets, skipped };
}

function normalizeBucketForComparison(bucket = {}) {
  const { generatedAt: _generatedAt, ...rest } = bucket;
  return rest;
}

function normalizeCalibrationForComparison(calibration = {}) {
  const { generatedAt: _generatedAt, buckets: rawBuckets = {}, ...rest } = calibration;
  const buckets = Object.fromEntries(
    Object.entries(rawBuckets).map(([key, bucket]) => [
      key,
      normalizeBucketForComparison(bucket)
    ])
  );

  return {
    ...rest,
    buckets
  };
}

function buildCalibrationPayload(events, existingCalibration = null) {
  const { buckets, skipped } = aggregate(events);
  const generatedAt = new Date().toISOString();
  const outputBuckets = {};

  for (const [key, bucket] of buckets.entries()) {
    const nextBucket = {
      provider: bucket.provider,
      category: bucket.category,
      stage: bucket.stage,
      failureKind: bucket.failureKind,
      model: bucket.model,
      sampleSize: bucket.sampleSize,
      generatedAt,
      lastRecordedAt: bucket.lastRecordedAt,
      multipliers: {
        inputTokens: bucket.totals.estimated.inputTokens
          ? roundToFour(
              bucket.totals.actual.inputTokens / bucket.totals.estimated.inputTokens
            )
          : 1,
        cachedInputTokens: bucket.totals.estimated.cachedInputTokens
          ? roundToFour(
              bucket.totals.actual.cachedInputTokens /
                bucket.totals.estimated.cachedInputTokens
            )
          : 1,
        outputTokens: bucket.totals.estimated.outputTokens
          ? roundToFour(
              bucket.totals.actual.outputTokens /
                bucket.totals.estimated.outputTokens
            )
          : 1
      },
      totals: {
        estimated: {
          inputTokens: bucket.totals.estimated.inputTokens,
          cachedInputTokens: bucket.totals.estimated.cachedInputTokens,
          outputTokens: bucket.totals.estimated.outputTokens
        },
        actual: {
          inputTokens: bucket.totals.actual.inputTokens,
          cachedInputTokens: bucket.totals.actual.cachedInputTokens,
          outputTokens: bucket.totals.actual.outputTokens
        }
      },
      source: "telemetry"
    };

    const existingBucket = existingCalibration?.buckets?.[key];
    if (
      existingBucket &&
      JSON.stringify(normalizeBucketForComparison(existingBucket)) ===
        JSON.stringify(normalizeBucketForComparison(nextBucket))
    ) {
      nextBucket.generatedAt = existingBucket.generatedAt || generatedAt;
    }

    outputBuckets[key] = nextBucket;
  }

  const nextCalibration = {
    generatedAt,
    buckets: outputBuckets
  };

  if (
    existingCalibration &&
    JSON.stringify(normalizeCalibrationForComparison(existingCalibration)) ===
      JSON.stringify(normalizeCalibrationForComparison(nextCalibration))
  ) {
    nextCalibration.generatedAt = existingCalibration.generatedAt || generatedAt;
  }

  return {
    calibration: nextCalibration,
    bucketsUpdated: buckets.size,
    entriesEvaluated: events.length,
    entriesSkipped: skipped
  };
}

function writeCalibrationFile(calibration, outputPath = OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(calibration, null, 2));
  return outputPath;
}

export function main() {
  const events = loadUsageEvents(USAGE_EVENTS_DIR);
  const existingCalibration = maybeReadJson(OUTPUT_PATH);
  const { calibration, bucketsUpdated, entriesEvaluated, entriesSkipped } =
    buildCalibrationPayload(events, existingCalibration);

  const outputPath = writeCalibrationFile(calibration, OUTPUT_PATH);

  setOutputs({
    output_path: outputPath,
    buckets_updated: String(bucketsUpdated),
    entries_evaluated: String(entriesEvaluated),
    entries_skipped: String(entriesSkipped)
  });

  if (bucketsUpdated === 0) {
    console.log(
      `No usage events with actual usage found; wrote empty calibration file at ${OUTPUT_PATH}.`
    );
  } else {
    console.log(
      `Updated ${bucketsUpdated} calibration bucket(s) using ${entriesEvaluated - entriesSkipped}/${entriesEvaluated} usage events.`
    );
  }

  if (entriesSkipped > 0) {
    console.log(`Skipped ${entriesSkipped} usage events without actual usage data.`);
  }

  return {
    outputPath,
    bucketsUpdated,
    entriesEvaluated,
    entriesSkipped
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
