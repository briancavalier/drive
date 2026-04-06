import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  validateIndex,
  validateTaskManifest,
  validateHoldoutManifest
} from "../validate-eval-corpus.mjs";
import { loadCostSummary } from "./cost-estimation.mjs";

export const EVAL_SCHEMA_VERSION = 1;
export const DEFAULT_CORPUS_ROOT = path.join("eval", "corpus");
export const DEFAULT_EVAL_RUNS_ROOT = path.join("eval", "runs");
export const EXECUTION_MODE = "local_replay";
const TASKS_DIR_NAME = "tasks";
const HOLDOUT_FILE_NAME = "holdout-manifest.json";
const INDEX_FILE_NAME = "index.json";
const REVIEW_DECISIONS = new Set(["pass", "request_changes"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function maybeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function trimString(value) {
  return `${value ?? ""}`.trim();
}

function isoNow() {
  return new Date().toISOString();
}

function toSafeRunId(timestamp = new Date()) {
  return timestamp.toISOString().replace(/[:.]/g, "-");
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadTaskFiles(tasksDir, repoRoot) {
  return fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const filePath = path.join(tasksDir, entry.name);
      const manifest = validateTaskManifest(readJson(filePath), repoRoot);
      return {
        filePath,
        manifest
      };
    });
}

export function loadEvalCorpus(corpusRoot = DEFAULT_CORPUS_ROOT, repoRoot = process.cwd()) {
  const resolvedCorpusRoot = path.resolve(repoRoot, corpusRoot);
  const index = validateIndex(readJson(path.join(resolvedCorpusRoot, INDEX_FILE_NAME)));
  const holdout = validateHoldoutManifest(
    readJson(path.join(resolvedCorpusRoot, HOLDOUT_FILE_NAME))
  );
  const taskEntries = loadTaskFiles(path.join(resolvedCorpusRoot, TASKS_DIR_NAME), repoRoot);
  const tasksById = new Map(taskEntries.map((entry) => [entry.manifest.task_id, entry.manifest]));
  const manifestTaskIds = sortStrings([...tasksById.keys()]);
  const declaredTaskIds = sortStrings(index.task_ids);

  if (JSON.stringify(manifestTaskIds) !== JSON.stringify(declaredTaskIds)) {
    throw new Error("Corpus task manifests do not match eval/corpus/index.json task_ids");
  }

  return {
    root: resolvedCorpusRoot,
    index,
    holdout,
    tasksById
  };
}

export function selectEvalTasks(corpus, { split = "dev", taskIds = [] } = {}) {
  if (split !== "dev") {
    throw new Error(`Unsupported eval split "${split}". Only "dev" is currently runnable.`);
  }

  const selectedIds = taskIds.length > 0 ? taskIds : corpus.index.splits.dev.task_ids;
  const missingIds = selectedIds.filter((taskId) => !corpus.tasksById.has(taskId));

  if (missingIds.length > 0) {
    throw new Error(`Unknown eval task IDs: ${missingIds.join(", ")}`);
  }

  const tasks = selectedIds.map((taskId) => corpus.tasksById.get(taskId));
  const nonDevTasks = tasks.filter((task) => task.split !== split);

  if (nonDevTasks.length > 0) {
    throw new Error(
      `Requested tasks are not in split "${split}": ${nonDevTasks.map((task) => task.task_id).join(", ")}`
    );
  }

  return tasks;
}

function resolveArtifactAbsolutePaths(task, repoRoot) {
  return Object.fromEntries(
    Object.entries(task.artifact_paths).map(([key, relativePath]) => [
      key,
      path.resolve(repoRoot, relativePath)
    ])
  );
}

function loadReviewArtifact(reviewJsonPath) {
  if (!reviewJsonPath || !fileExists(reviewJsonPath)) {
    return null;
  }

  return readJson(reviewJsonPath);
}

function loadCostSummaryArtifact(costSummaryPath) {
  if (!costSummaryPath || !fileExists(costSummaryPath)) {
    return null;
  }

  return loadCostSummary(costSummaryPath);
}

function loadUsageEvent(repoRoot, sourceEventPath) {
  const normalized = trimString(sourceEventPath);
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(repoRoot, normalized);
  if (!fileExists(absolutePath)) {
    return null;
  }

  return {
    path: normalized,
    payload: readJson(absolutePath)
  };
}

function collectStageUsageEvents(repoRoot, costSummary) {
  const stageUsageEvents = {};

  for (const [stageName, stageData] of Object.entries(costSummary?.stages || {})) {
    const usageEvent = loadUsageEvent(repoRoot, stageData?.sourceEventPath);
    if (usageEvent) {
      stageUsageEvents[stageName] = usageEvent;
    }
  }

  return stageUsageEvents;
}

function summarizeStageOutcome({
  stageName,
  task,
  absoluteArtifactPaths,
  costSummary,
  stageUsageEvents
}) {
  const costStage = costSummary?.stages?.[stageName] || null;
  const usageEvent = stageUsageEvents[stageName] || null;
  let artifactEvidence = [];
  let present = false;
  let succeeded = false;

  if (stageName === "plan") {
    artifactEvidence = [
      task.artifact_paths.approved_issue,
      task.artifact_paths.spec,
      task.artifact_paths.plan,
      task.artifact_paths.acceptance_tests
    ].filter(Boolean);
    present = fileExists(absoluteArtifactPaths.plan);
    succeeded = present;
  } else if (stageName === "implement") {
    artifactEvidence = [task.artifact_paths.cost_summary].filter(Boolean);
    present = Boolean(costStage);
    succeeded = usageEvent ? usageEvent.payload.outcome === "succeeded" : present;
  } else if (stageName === "repair") {
    artifactEvidence = [task.artifact_paths.repair_log, task.artifact_paths.cost_summary].filter(
      Boolean
    );
    present = Boolean(costStage || fileExists(absoluteArtifactPaths.repair_log || ""));
    succeeded = usageEvent
      ? usageEvent.payload.outcome === "succeeded"
      : fileExists(absoluteArtifactPaths.repair_log || "");
  } else if (stageName === "review") {
    artifactEvidence = [task.artifact_paths.review_json, task.artifact_paths.cost_summary].filter(
      Boolean
    );
    present = fileExists(absoluteArtifactPaths.review_json || "") || Boolean(costStage);
    succeeded = usageEvent
      ? usageEvent.payload.outcome === "succeeded"
      : fileExists(absoluteArtifactPaths.review_json || "");
  }

  return {
    present,
    succeeded,
    artifact_evidence: artifactEvidence,
    usage_event_paths: usageEvent ? [usageEvent.path] : []
  };
}

function countUnmetRequirementChecks(review) {
  return (review?.requirement_checks || []).filter(
    (check) => check.status === "partially_satisfied" || check.status === "not_satisfied"
  ).length;
}

function summarizeReviewOutcome(review) {
  if (!review) {
    return {
      present: false,
      decision: null,
      methodology: null,
      blocking_findings_count: null,
      requirement_checks_count: 0,
      unmet_requirement_checks_count: 0
    };
  }

  const decision = REVIEW_DECISIONS.has(review.decision) ? review.decision : trimString(review.decision) || null;

  return {
    present: true,
    decision,
    methodology: trimString(review.methodology) || null,
    blocking_findings_count:
      Number.isInteger(review.blocking_findings_count) ? review.blocking_findings_count : null,
    requirement_checks_count: Array.isArray(review.requirement_checks)
      ? review.requirement_checks.length
      : 0,
    unmet_requirement_checks_count: countUnmetRequirementChecks(review)
  };
}

function sumActualStageUsd(costSummary) {
  return Object.values(costSummary?.stages || {}).reduce((total, stage) => {
    const actualUsd = stage?.derivedCost?.actualUsd;
    return total + (typeof actualUsd === "number" ? actualUsd : 0);
  }, 0);
}

function countStagesWithActuals(costSummary) {
  return Object.values(costSummary?.stages || {}).filter(
    (stage) => typeof stage?.derivedCost?.actualUsd === "number"
  ).length;
}

function buildCostSummary(task, costSummary, stageUsageEvents) {
  const usageEventPaths = uniqueStrings(
    Object.values(stageUsageEvents).map((entry) => entry.path)
  );

  return {
    present: Boolean(costSummary),
    artifact_path: task.artifact_paths.cost_summary || null,
    total_estimated_usd: costSummary?.current?.derivedCost?.totalEstimatedUsd ?? null,
    total_actual_usd: costSummary ? Number(sumActualStageUsd(costSummary).toFixed(4)) : null,
    tasks_with_actual_stage_costs: costSummary ? countStagesWithActuals(costSummary) : 0,
    usage_event_paths: usageEventPaths,
    has_actuals: costSummary ? countStagesWithActuals(costSummary) > 0 : false
  };
}

function buildTimingSummary(stageUsageEvents) {
  const timestamps = Object.values(stageUsageEvents)
    .map((entry) => trimString(entry.payload.recordedAt))
    .filter(Boolean)
    .sort();

  if (timestamps.length === 0) {
    return {
      started_at: null,
      finished_at: null,
      duration_ms: null
    };
  }

  const startedAt = timestamps[0];
  const finishedAt = timestamps[timestamps.length - 1];
  const durationMs =
    timestamps.length > 1
      ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
      : null;

  return {
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null
  };
}

function buildHumanAuditSummary(task) {
  const required = trimString(task.risk_profile).toLowerCase() === "high";

  return {
    required,
    status: "not_recorded",
    reviewer: null,
    reviewed_at: null,
    notes: required
      ? "Human-audited slice is modeled in the schema but not populated by issue #91."
      : "Human audit not required for this task in issue #91."
  };
}

function buildInterventionSummary(task) {
  return {
    known: false,
    count: null,
    open_failure: false,
    open_question: false,
    notes: [
      `Historical replay task ${task.task_id} does not include canonical serialized PR metadata in the corpus artifacts.`
    ]
  };
}

function buildRepairSummary(task, absoluteArtifactPaths, stageUsageEvents) {
  const repairLogPath = task.artifact_paths.repair_log || null;
  const repairLogExists = repairLogPath
    ? fileExists(absoluteArtifactPaths.repair_log || "")
    : false;
  const repairUsageEvent = stageUsageEvents.repair || null;

  return {
    present: repairLogExists || Boolean(repairUsageEvent),
    repair_log_present: repairLogExists,
    repair_log_path: repairLogExists ? repairLogPath : null,
    evidence_present: repairLogExists || Boolean(repairUsageEvent),
    usage_event_paths: repairUsageEvent ? [repairUsageEvent.path] : []
  };
}

function buildTaskWarnings(stageOutcomes, costSummary, reviewOutcome, interventionSummary) {
  const warnings = [];

  for (const [stageName, stageOutcome] of Object.entries(stageOutcomes)) {
    if (stageOutcome.present && stageOutcome.usage_event_paths.length === 0 && stageName !== "plan") {
      warnings.push(`Stage ${stageName} is present but no linked usage event was available.`);
    }
  }

  if (!costSummary.present) {
    warnings.push("No cost-summary.json artifact was available for this task.");
  }

  if (!reviewOutcome.present) {
    warnings.push("No review.json artifact was available for this task.");
  }

  if (!interventionSummary.known) {
    warnings.push("Intervention state is not recoverable from the current replay artifact set.");
  }

  return warnings;
}

export function synthesizeTaskResult({
  task,
  runId,
  corpusRevision,
  repoRoot,
  evaluatedAt = isoNow()
}) {
  const absoluteArtifactPaths = resolveArtifactAbsolutePaths(task, repoRoot);
  const review = loadReviewArtifact(absoluteArtifactPaths.review_json);
  const costSummary = loadCostSummaryArtifact(absoluteArtifactPaths.cost_summary);
  const stageUsageEvents = collectStageUsageEvents(repoRoot, costSummary);
  const stageOutcomes = {
    plan: summarizeStageOutcome({
      stageName: "plan",
      task,
      absoluteArtifactPaths,
      costSummary,
      stageUsageEvents
    }),
    implement: summarizeStageOutcome({
      stageName: "implement",
      task,
      absoluteArtifactPaths,
      costSummary,
      stageUsageEvents
    }),
    repair: summarizeStageOutcome({
      stageName: "repair",
      task,
      absoluteArtifactPaths,
      costSummary,
      stageUsageEvents
    }),
    review: summarizeStageOutcome({
      stageName: "review",
      task,
      absoluteArtifactPaths,
      costSummary,
      stageUsageEvents
    })
  };
  const reviewOutcome = summarizeReviewOutcome(review);
  const interventionSummary = buildInterventionSummary(task);
  const repairSummary = buildRepairSummary(task, absoluteArtifactPaths, stageUsageEvents);
  const costSummaryResult = buildCostSummary(task, costSummary, stageUsageEvents);
  const timing = buildTimingSummary(stageUsageEvents);
  const humanAudit = buildHumanAuditSummary(task);
  const notes = buildTaskWarnings(stageOutcomes, costSummaryResult, reviewOutcome, interventionSummary);

  return {
    schema_version: EVAL_SCHEMA_VERSION,
    run_id: runId,
    task_id: task.task_id,
    corpus_revision: corpusRevision,
    evaluated_at: evaluatedAt,
    source: {
      mode: EXECUTION_MODE,
      source_kind: task.source_kind
    },
    task: {
      task_id: task.task_id,
      issue_number: task.issue_number,
      title: task.title,
      summary: task.summary,
      tags: task.tags,
      risk_profile: task.risk_profile,
      control_plane: task.control_plane,
      comparison_dimensions: task.comparison_dimensions,
      artifact_paths: task.artifact_paths
    },
    stage_outcomes: stageOutcomes,
    review_outcome: reviewOutcome,
    intervention_summary: interventionSummary,
    repair_summary: repairSummary,
    cost_summary: costSummaryResult,
    timing,
    human_audit: humanAudit,
    notes
  };
}

export function summarizeEvalRun({
  runId,
  corpusRevision,
  gitCommit,
  startedAt,
  finishedAt,
  taskResults,
  selectedTaskIds,
  warnings = []
}) {
  const stageNames = ["plan", "implement", "repair", "review"];
  const stageSuccessCounts = Object.fromEntries(
    stageNames.map((stageName) => [
      stageName,
      {
        present: 0,
        succeeded: 0
      }
    ])
  );
  const reviewDecisionDistribution = {};
  let interventionKnownCount = 0;
  let interventionPresentCount = 0;
  let repairPresenceCount = 0;
  let humanAuditRequiredCount = 0;
  let humanAuditRecordedCount = 0;
  let tasksWithActualCost = 0;
  let totalEstimatedUsd = 0;
  let totalActualUsd = 0;
  const missingDataWarnings = [...warnings];

  for (const result of taskResults) {
    for (const stageName of stageNames) {
      const stageOutcome = result.stage_outcomes[stageName];
      if (stageOutcome.present) {
        stageSuccessCounts[stageName].present += 1;
      }
      if (stageOutcome.succeeded) {
        stageSuccessCounts[stageName].succeeded += 1;
      }
    }

    const decision = result.review_outcome.decision || "missing";
    reviewDecisionDistribution[decision] = (reviewDecisionDistribution[decision] || 0) + 1;

    if (result.intervention_summary.known) {
      interventionKnownCount += 1;
      if (Number(result.intervention_summary.count || 0) > 0) {
        interventionPresentCount += 1;
      }
    }

    if (result.repair_summary.present) {
      repairPresenceCount += 1;
    }

    if (result.human_audit.required) {
      humanAuditRequiredCount += 1;
      if (result.human_audit.status !== "not_recorded") {
        humanAuditRecordedCount += 1;
      }
    }

    if (result.cost_summary.has_actuals) {
      tasksWithActualCost += 1;
    }

    totalEstimatedUsd += Number(result.cost_summary.total_estimated_usd || 0);
    totalActualUsd += Number(result.cost_summary.total_actual_usd || 0);

    for (const note of result.notes) {
      missingDataWarnings.push(`${result.task_id}: ${note}`);
    }
  }

  return {
    schema_version: EVAL_SCHEMA_VERSION,
    run_id: runId,
    corpus_revision: corpusRevision,
    execution_mode: EXECUTION_MODE,
    git_commit: gitCommit,
    started_at: startedAt,
    finished_at: finishedAt,
    task_count: taskResults.length,
    selected_task_ids: selectedTaskIds,
    stage_success_counts: stageSuccessCounts,
    review_decision_distribution: reviewDecisionDistribution,
    intervention_rate: interventionKnownCount > 0 ? interventionPresentCount / interventionKnownCount : null,
    repair_presence_rate: taskResults.length > 0 ? repairPresenceCount / taskResults.length : null,
    cost_totals: {
      total_estimated_usd: Number(totalEstimatedUsd.toFixed(4)),
      total_actual_usd: Number(totalActualUsd.toFixed(4)),
      tasks_with_actuals: tasksWithActualCost
    },
    human_audit: {
      required_tasks: humanAuditRequiredCount,
      recorded_tasks: humanAuditRecordedCount,
      missing_required_tasks: humanAuditRequiredCount - humanAuditRecordedCount
    },
    task_warnings: missingDataWarnings
  };
}

export function renderEvalSummaryMarkdown(summary, taskResults) {
  const lines = [
    "# Eval Summary",
    "",
    `- Run ID: \`${summary.run_id}\``,
    `- Corpus revision: \`${summary.corpus_revision}\``,
    `- Execution mode: \`${summary.execution_mode}\``,
    `- Git commit: \`${summary.git_commit}\``,
    `- Task count: ${summary.task_count}`,
    ""
  ];

  lines.push("## Rollup", "");
  for (const [stageName, counts] of Object.entries(summary.stage_success_counts)) {
    lines.push(`- ${stageName}: ${counts.succeeded}/${counts.present} succeeded`);
  }
  lines.push(
    `- Review decisions: ${Object.entries(summary.review_decision_distribution)
      .map(([decision, count]) => `${decision}=${count}`)
      .join(", ") || "none"}`
  );
  lines.push(
    `- Intervention rate: ${
      summary.intervention_rate == null ? "unknown" : summary.intervention_rate.toFixed(2)
    }`
  );
  lines.push(`- Repair presence rate: ${summary.repair_presence_rate?.toFixed(2) ?? "0.00"}`);
  lines.push(
    `- Cost totals: estimated=$${summary.cost_totals.total_estimated_usd.toFixed(4)} actual=$${summary.cost_totals.total_actual_usd.toFixed(4)} tasks-with-actuals=${summary.cost_totals.tasks_with_actuals}`
  );
  lines.push(
    `- Human audit coverage: required=${summary.human_audit.required_tasks} recorded=${summary.human_audit.recorded_tasks} missing=${summary.human_audit.missing_required_tasks}`
  );
  lines.push("", "## Tasks", "");

  for (const result of taskResults) {
    lines.push(
      `- \`${result.task_id}\`: review=${result.review_outcome.decision || "missing"}, repair=${result.repair_summary.present ? "present" : "absent"}, actual-costs=${result.cost_summary.has_actuals ? "yes" : "no"}, warnings=${result.notes.length}`
    );
  }

  if (summary.task_warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of summary.task_warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildRunManifest({
  runId,
  corpusRevision,
  selectedTaskIds,
  gitCommit,
  startedAt,
  finishedAt,
  warnings = []
}) {
  return {
    schema_version: EVAL_SCHEMA_VERSION,
    run_id: runId,
    corpus_revision: corpusRevision,
    selected_task_ids: selectedTaskIds,
    execution_mode: EXECUTION_MODE,
    git_commit: gitCommit,
    started_at: startedAt,
    finished_at: finishedAt,
    warnings
  };
}

export function parseEvalCliArgs(argv = []) {
  const options = {
    split: "dev",
    taskIds: [],
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--task") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--task requires a task ID");
      }
      options.taskIds.push(next);
      index += 1;
      continue;
    }

    if (arg === "--split") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--split requires a value");
      }
      options.split = next;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--output requires a directory path");
      }
      options.output = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveOutputRoot(outputArg, repoRoot) {
  return outputArg
    ? path.resolve(repoRoot, outputArg)
    : path.resolve(repoRoot, DEFAULT_EVAL_RUNS_ROOT, toSafeRunId());
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function getGitCommit(repoRoot = process.cwd()) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
}

export function runEval({
  repoRoot = process.cwd(),
  corpusRoot = DEFAULT_CORPUS_ROOT,
  split = "dev",
  taskIds = [],
  output = null,
  now = () => new Date(),
  getGitCommitFn = getGitCommit
} = {}) {
  const startedAt = now().toISOString();
  const runId = output ? path.basename(path.resolve(repoRoot, output)) : toSafeRunId(now());
  const corpus = loadEvalCorpus(corpusRoot, repoRoot);
  const tasks = selectEvalTasks(corpus, { split, taskIds });
  const selectedTaskIds = tasks.map((task) => task.task_id);
  const outputRoot = output
    ? path.resolve(repoRoot, output)
    : path.resolve(repoRoot, DEFAULT_EVAL_RUNS_ROOT, runId);
  const gitCommit = getGitCommitFn(repoRoot);
  const taskResults = tasks.map((task) =>
    synthesizeTaskResult({
      task,
      runId,
      corpusRevision: corpus.index.corpus_revision,
      repoRoot,
      evaluatedAt: startedAt
    })
  );
  const finishedAt = now().toISOString();
  const summary = summarizeEvalRun({
    runId,
    corpusRevision: corpus.index.corpus_revision,
    gitCommit,
    startedAt,
    finishedAt,
    taskResults,
    selectedTaskIds,
    warnings: []
  });
  const runManifest = buildRunManifest({
    runId,
    corpusRevision: corpus.index.corpus_revision,
    selectedTaskIds,
    gitCommit,
    startedAt,
    finishedAt,
    warnings: summary.task_warnings
  });

  writeJson(path.join(outputRoot, "run.json"), runManifest);
  for (const result of taskResults) {
    writeJson(path.join(outputRoot, "tasks", `${result.task_id}.json`), result);
  }
  writeJson(path.join(outputRoot, "eval-summary.json"), summary);
  fs.writeFileSync(
    path.join(outputRoot, "eval-summary.md"),
    renderEvalSummaryMarkdown(summary, taskResults)
  );

  return {
    outputRoot,
    runManifest,
    summary,
    taskResults
  };
}
