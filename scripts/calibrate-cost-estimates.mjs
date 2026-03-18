import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COST_CALIBRATION_FILE_NAME,
  COST_SUMMARY_FILE_NAME,
  loadCostCalibration
} from "./lib/cost-estimation.mjs";

const FACTORY_RUNS_DIR = path.join(".factory", "runs");
const OUTPUT_PATH = path.join(".factory", COST_CALIBRATION_FILE_NAME);

function roundToFour(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listRunDirectories(rootDir = FACTORY_RUNS_DIR) {
  try {
    return fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDir, entry.name));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function loadSummary(summaryPath) {
  try {
    return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function collectTelemetryEntries() {
  const entries = [];

  for (const runDir of listRunDirectories()) {
    const summaryPath = path.join(runDir, COST_SUMMARY_FILE_NAME);
    const summary = loadSummary(summaryPath);

    if (!summary?.telemetry || !Array.isArray(summary.telemetry)) {
      continue;
    }

    for (const telemetryEntry of summary.telemetry) {
      entries.push({
        ...telemetryEntry,
        issueNumber: summary.issueNumber,
        runDir
      });
    }
  }

  return entries;
}

function buildCalibrationBuckets(entries) {
  const buckets = new Map();
  let skipped = 0;

  for (const entry of entries) {
    const stage = entry.stage || "";
    const model = entry.model || "";
    const actualUsd = toNumber(entry.actualUsd);
    const estimatedBaseUsd =
      toNumber(entry.estimatedUsdBeforeCalibration) ?? toNumber(entry.estimatedUsd);

    if (!stage || !model || !actualUsd || actualUsd <= 0 || !estimatedBaseUsd || estimatedBaseUsd <= 0) {
      skipped += 1;
      continue;
    }

    const key = `${stage}:${model}`;
    const bucket = buckets.get(key) || {
      stage,
      model,
      totalActualUsd: 0,
      totalEstimatedUsd: 0,
      sampleSize: 0,
      lastRecordedAt: ""
    };

    bucket.totalActualUsd += actualUsd;
    bucket.totalEstimatedUsd += estimatedBaseUsd;
    bucket.sampleSize += 1;

    if (entry.recordedAt && entry.recordedAt > bucket.lastRecordedAt) {
      bucket.lastRecordedAt = entry.recordedAt;
    }

    buckets.set(key, bucket);
  }

  return {
    buckets,
    skipped
  };
}

function writeCalibrationFile(calibration, outputPath = OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(calibration, null, 2));
  return outputPath;
}

function buildCalibrationPayload(existingCalibration = null) {
  const telemetryEntries = collectTelemetryEntries();
  const { buckets, skipped } = buildCalibrationBuckets(telemetryEntries);
  const generatedAt = new Date().toISOString();
  const outputBuckets = {};

  for (const [key, bucket] of buckets.entries()) {
    const multiplier =
      bucket.totalEstimatedUsd > 0
        ? roundToFour(bucket.totalActualUsd / bucket.totalEstimatedUsd)
        : 1;

    outputBuckets[key] = {
      stage: bucket.stage,
      model: bucket.model,
      multiplier,
      sampleSize: bucket.sampleSize,
      totalEstimatedUsd: roundToFour(bucket.totalEstimatedUsd),
      totalActualUsd: roundToFour(bucket.totalActualUsd),
      source: "telemetry",
      generatedAt,
      lastRecordedAt: bucket.lastRecordedAt
    };
  }

  return {
    calibration: {
      generatedAt,
      buckets: outputBuckets
    },
    bucketsUpdated: buckets.size,
    entriesEvaluated: telemetryEntries.length,
    entriesSkipped: skipped,
    existingCalibration
  };
}

export function main() {
  const existingCalibration = loadCostCalibration(OUTPUT_PATH);
  const {
    calibration,
    bucketsUpdated,
    entriesEvaluated,
    entriesSkipped
  } = buildCalibrationPayload(existingCalibration);

  writeCalibrationFile(calibration, OUTPUT_PATH);

  if (bucketsUpdated === 0) {
    console.log(
      `No telemetry entries with actual costs found; wrote empty calibration file at ${OUTPUT_PATH}.`
    );
  } else {
    console.log(
      `Updated ${bucketsUpdated} calibration bucket(s) using ${entriesEvaluated - entriesSkipped}/${entriesEvaluated} telemetry entries.`
    );

    for (const [key, bucket] of Object.entries(calibration.buckets)) {
      console.log(
        `- ${key} multiplier ${bucket.multiplier} from ${bucket.sampleSize} sample(s) (last recorded ${bucket.lastRecordedAt || "unknown"})`
      );
    }
  }

  if (entriesSkipped > 0) {
    console.log(`Skipped ${entriesSkipped} telemetry entries without actual costs or estimates.`);
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
