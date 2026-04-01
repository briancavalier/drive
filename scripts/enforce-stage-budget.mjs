import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";

const FAILURE_TYPE = "budget_guardrail";
const BUDGET_DECISION_DETAILS = Object.freeze({
  pass: "pass",
  hardBlock: "hard_block",
  questionRequired: "question_required",
  observe: "observe",
  error: "error"
});
const BROAD_PATH_COUNT_THRESHOLD = 6;
const CONTROL_PLANE_PATH_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.factory\//,
  /^scripts\//
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`);
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`);
  }
}

export function extractPlannedPaths(planText, { artifactsPath = "" } = {}) {
  const matches = new Set();
  const patterns = [
    /`((?:\.?[\w-]+\/)+[\w.-]+)`/g,
    /\b((?:\.?[\w-]+\/)+[\w.-]+)\b/g
  ];

  for (const pattern of patterns) {
    for (const match of planText.matchAll(pattern)) {
      const candidate = `${match[1] || ""}`.trim();

      if (!candidate || !candidate.includes("/")) {
        continue;
      }

      if (
        candidate.startsWith(".factory/runs/") ||
        candidate.startsWith("factory/runs/") ||
        (artifactsPath && candidate.startsWith(`${artifactsPath}/`))
      ) {
        continue;
      }

      matches.add(candidate.replace(/^\.\/+/, ""));
    }
  }

  return [...matches].sort();
}

function hasControlPlanePaths(paths) {
  return paths.some((candidate) =>
    CONTROL_PLANE_PATH_PATTERNS.some((pattern) => pattern.test(candidate))
  );
}

function buildFailureMessage({
  stageUsd,
  totalUsd,
  costBand,
  warnUsd,
  highUsd,
  truncatedCount,
  omittedCount,
  plannedPaths,
  controlPlanePathsDetected,
  reasons
}) {
  return [
    "Budget guardrail blocked the implement stage before Codex execution.",
    `Estimated stage USD: ${stageUsd.toFixed(2)}`,
    `Estimated total USD: ${totalUsd.toFixed(2)}`,
    `Estimated cost band: ${costBand || "unknown"}`,
    `Warn threshold USD: ${warnUsd.toFixed(2)}`,
    `High threshold USD: ${highUsd.toFixed(2)}`,
    `Prompt truncation count: ${truncatedCount}`,
    `Prompt omission count: ${omittedCount}`,
    `Planned path count: ${plannedPaths.length}`,
    `Control-plane paths detected: ${controlPlanePathsDetected ? "yes" : "no"}`,
    "",
    "Guardrail reasons:",
    ...reasons.map((reason) => `- ${reason}`)
  ].join("\n");
}

function writeDecision(outputs, outputWriter) {
  outputWriter(outputs);
  return outputs;
}

export function enforceStageBudget({
  env = process.env,
  outputWriter = setOutputs
} = {}) {
  const mode = `${env.FACTORY_MODE || ""}`.trim();
  const artifactsPath = `${env.FACTORY_ARTIFACTS_PATH || ""}`.trim();
  const costSummaryPath = `${env.FACTORY_COST_SUMMARY_PATH || ""}`.trim();
  const promptMetaPath =
    `${env.FACTORY_PROMPT_META_PATH || ""}`.trim() ||
    path.join(".factory", "tmp", "prompt-meta.json");
  const planPath =
    `${env.FACTORY_PLAN_PATH || ""}`.trim() ||
    path.join(artifactsPath, "plan.md");

  if (!mode || !artifactsPath || !costSummaryPath) {
    const message =
      "FACTORY_MODE, FACTORY_ARTIFACTS_PATH, and FACTORY_COST_SUMMARY_PATH are required for budget preflight.";
    writeDecision(
      {
        budget_decision: "error",
        budget_decision_detail: BUDGET_DECISION_DETAILS.error,
        failure_type: "configuration",
        failure_message: message
      },
      outputWriter
    );
    return { exitCode: 1, status: "configuration_failure", message };
  }

  let summary;
  let promptMeta;

  try {
    summary = readJson(costSummaryPath);
    promptMeta = readJson(promptMetaPath);
  } catch (error) {
    writeDecision(
      {
        budget_decision: "error",
        budget_decision_detail: BUDGET_DECISION_DETAILS.error,
        failure_type: "configuration",
        failure_message: error.message
      },
      outputWriter
    );
    return { exitCode: 1, status: "configuration_failure", message: error.message };
  }

  const stageUsd = Number(summary?.current?.derivedCost?.stageUsd) || 0;
  const totalUsd = Number(summary?.current?.derivedCost?.totalEstimatedUsd) || stageUsd;
  const costBand = `${summary?.current?.derivedCost?.band || ""}`.trim();
  const warnUsd = Number(summary?.thresholds?.warnUsd) || 0;
  const highUsd = Number(summary?.thresholds?.highUsd) || 0;
  const truncatedCount = Array.isArray(promptMeta?.truncatedSections)
    ? promptMeta.truncatedSections.length
    : 0;
  const omittedCount = Array.isArray(promptMeta?.omittedSections)
    ? promptMeta.omittedSections.length
    : 0;
  const budgetOverride = promptMeta?.budgetOverride || null;

  if (mode !== "implement") {
    writeDecision(
      {
        budget_decision: "observe",
        budget_decision_detail: BUDGET_DECISION_DETAILS.observe,
        planned_path_count: "0",
        control_plane_paths_detected: "false"
      },
      outputWriter
    );
    return { exitCode: 0, status: "observe" };
  }

  let planText;

  try {
    planText = readText(planPath);
  } catch (error) {
    writeDecision(
      {
        budget_decision: "error",
        budget_decision_detail: BUDGET_DECISION_DETAILS.error,
        failure_type: "configuration",
        failure_message: error.message
      },
      outputWriter
    );
    return { exitCode: 1, status: "configuration_failure", message: error.message };
  }

  const plannedPaths = extractPlannedPaths(planText, { artifactsPath });
  const controlPlanePathsDetected = hasControlPlanePaths(plannedPaths);
  const broadPathSurface = plannedPaths.length >= BROAD_PATH_COUNT_THRESHOLD;
  const reasons = [];
  let budgetDecisionDetail = BUDGET_DECISION_DETAILS.pass;

  if (costBand === "high") {
    budgetDecisionDetail = BUDGET_DECISION_DETAILS.hardBlock;
    reasons.push("Estimated implement cost is already in the high cost band.");
  }

  if (
    (truncatedCount > 0 || omittedCount > 0) &&
    (broadPathSurface || controlPlanePathsDetected)
  ) {
    if (budgetDecisionDetail === BUDGET_DECISION_DETAILS.pass) {
      budgetDecisionDetail = BUDGET_DECISION_DETAILS.questionRequired;
    }
    reasons.push(
      "Prompt context was truncated or omitted while the planned change surface is broad or touches control-plane paths."
    );
  }

  if (reasons.length === 0) {
    writeDecision(
      {
        budget_decision: "pass",
        budget_decision_detail: BUDGET_DECISION_DETAILS.pass,
        budget_override_consumed: "false",
        planned_path_count: String(plannedPaths.length),
        control_plane_paths_detected: controlPlanePathsDetected ? "true" : "false"
      },
      outputWriter
    );
    return { exitCode: 0, status: "pass" };
  }

  const canBypassQuestionRequired =
    budgetDecisionDetail === BUDGET_DECISION_DETAILS.questionRequired &&
    `${budgetOverride?.kind || ""}`.trim() === BUDGET_DECISION_DETAILS.questionRequired &&
    `${budgetOverride?.sourceInterventionId || ""}`.trim();

  if (canBypassQuestionRequired) {
    writeDecision(
      {
        budget_decision: "pass",
        budget_decision_detail: BUDGET_DECISION_DETAILS.pass,
        budget_override_consumed: "true",
        planned_path_count: String(plannedPaths.length),
        control_plane_paths_detected: controlPlanePathsDetected ? "true" : "false"
      },
      outputWriter
    );
    return { exitCode: 0, status: "pass" };
  }

  const failureMessage = buildFailureMessage({
    stageUsd,
    totalUsd,
    costBand,
    warnUsd,
    highUsd,
    truncatedCount,
    omittedCount,
    plannedPaths,
    controlPlanePathsDetected,
    reasons
  });

  writeDecision(
    {
      budget_decision: "block",
      budget_decision_detail: budgetDecisionDetail,
      budget_override_consumed: "false",
      failure_type: FAILURE_TYPE,
      failure_message: failureMessage,
      planned_path_count: String(plannedPaths.length),
      control_plane_paths_detected: controlPlanePathsDetected ? "true" : "false"
    },
    outputWriter
  );
  return { exitCode: 1, status: "blocked", message: failureMessage };
}

async function runFromCli() {
  const result = enforceStageBudget();
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runFromCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
