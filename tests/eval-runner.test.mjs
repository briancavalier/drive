import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadEvalCorpus,
  selectEvalTasks,
  synthesizeTaskResult,
  summarizeEvalRun,
  parseEvalCliArgs,
  runEval
} from "../scripts/lib/eval-runner.mjs";

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, ".."));

function makeTempRepoFixture({ telemetryOnly = false, extraTask = false } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-runner-"));
  const corpusRoot = path.join(repoRoot, "eval", "corpus");
  const tasksDir = path.join(corpusRoot, "tasks");
  const runDir = path.join(repoRoot, ".factory", "runs", "1");
  const secondRunDir = path.join(repoRoot, ".factory", "runs", "2");
  const usageDir = path.join(repoRoot, ".factory", "usage-events", "2026-04-06");

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(usageDir, { recursive: true });
  if (extraTask) {
    fs.mkdirSync(secondRunDir, { recursive: true });
  }

  fs.writeFileSync(path.join(runDir, "approved-issue.md"), "# Approved issue\n");
  fs.writeFileSync(path.join(runDir, "spec.md"), "# Spec\n");
  fs.writeFileSync(path.join(runDir, "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(runDir, "acceptance-tests.md"), "# Acceptance\n");
  fs.writeFileSync(path.join(runDir, "repair-log.md"), "# Repair\n");
  fs.writeFileSync(
    path.join(runDir, "review.json"),
    JSON.stringify(
      {
        methodology: "default",
        decision: "request_changes",
        summary: "Needs a small fix.",
        blocking_findings_count: 1,
        requirement_checks: [
          {
            type: "acceptance_criterion",
            requirement: "A thing works.",
            status: "not_satisfied",
            evidence: ["tests/sample.test.mjs"]
          }
        ],
        findings: [
          {
            level: "blocking",
            title: "Fix needed",
            details: "Observed a failure.",
            scope: "tests",
            recommendation: "Fix the issue."
          }
        ]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(runDir, "cost-summary.json"),
    JSON.stringify(
      {
        estimated: true,
        provider: "openai",
        apiSurface: "codex-action",
        pricing: {
          version: "openai-2026-03-19",
          model: "gpt-5-codex",
          currency: "USD"
        },
        current: {
          stage: "review",
          derivedCost: {
            totalEstimatedUsd: 1.25
          }
        },
        thresholds: {
          warnUsd: 0.25,
          highUsd: 1
        },
        stages: {
          implement: {
            mode: "implement",
            provider: "openai",
            apiSurface: "codex-action",
            model: "gpt-5-codex",
            derivedCost: {
              stageUsd: 0.75,
              actualUsd: 0.75
            }
          },
          review: {
            mode: "review",
            provider: "openai",
            apiSurface: "codex-action",
            model: "gpt-5-mini",
            derivedCost: {
              stageUsd: 0.5,
              actualUsd: null
            }
          }
        },
        telemetry: [
          {
            stage: "implement",
            outcome: "succeeded",
            recordedAt: "2026-04-06T00:00:00Z"
          },
          {
            stage: "review",
            outcome: "succeeded",
            recordedAt: "2026-04-06T00:10:00Z"
          }
        ]
      },
      null,
      2
    )
  );

  if (!telemetryOnly) {
    fs.writeFileSync(
      path.join(runDir, "cost-summary.json"),
      JSON.stringify(
        {
          estimated: true,
          provider: "openai",
          apiSurface: "codex-action",
          pricing: {
            version: "openai-2026-03-19",
            model: "gpt-5-codex",
            currency: "USD"
          },
          current: {
            stage: "review",
            derivedCost: {
              totalEstimatedUsd: 1.25
            }
          },
          thresholds: {
            warnUsd: 0.25,
            highUsd: 1
          },
          stages: {
            implement: {
              mode: "implement",
              provider: "openai",
              apiSurface: "codex-action",
              model: "gpt-5-codex",
              sourceEventPath: ".factory/usage-events/2026-04-06/run-1-1-stage-implement.json",
              derivedCost: {
                stageUsd: 0.75,
                actualUsd: 0.75
              }
            },
            review: {
              mode: "review",
              provider: "openai",
              apiSurface: "codex-action",
              model: "gpt-5-mini",
              sourceEventPath: ".factory/usage-events/2026-04-06/run-1-1-stage-review.json",
              derivedCost: {
                stageUsd: 0.5,
                actualUsd: null
              }
            }
          },
          telemetry: [
            {
              stage: "implement",
              outcome: "succeeded",
              recordedAt: "2026-04-06T00:00:00Z"
            },
            {
              stage: "review",
              outcome: "succeeded",
              recordedAt: "2026-04-06T00:10:00Z"
            }
          ]
        },
        null,
        2
      )
    );
  }

  fs.writeFileSync(
    path.join(usageDir, "run-1-1-stage-implement.json"),
    JSON.stringify(
      {
        category: "stage",
        stage: "implement",
        outcome: "succeeded",
        recordedAt: "2026-04-06T00:00:00Z"
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(usageDir, "run-1-1-stage-review.json"),
    JSON.stringify(
      {
        category: "stage",
        stage: "review",
        outcome: "succeeded",
        recordedAt: "2026-04-06T00:10:00Z"
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(corpusRoot, "index.json"),
    JSON.stringify(
      {
        schema_version: 1,
        corpus_revision: 3,
        updated_at: "2026-04-06T00:00:00Z",
        splits: {
          dev: {
            task_ids: extraTask ? ["task-1", "task-2"] : ["task-1"]
          },
          holdout: {
            task_ids: ["holdout-1"],
            note: "Holdout is external."
          }
        },
        task_ids: extraTask ? ["task-1", "task-2"] : ["task-1"],
        holdout_ids: ["holdout-1"],
        notes: ["Sample corpus"]
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(corpusRoot, "holdout-manifest.json"),
    JSON.stringify(
      {
        schema_version: 1,
        holdout_revision: 1,
        entries: [
          {
            task_id: "holdout-1",
            status: "holdout_external",
            provenance: "Private",
            owner: "factory-maintainers",
            last_reviewed_at: "2026-04-06T00:00:00Z",
            notes: "No task contents",
            external_storage_reference: "private-holdout://sample/1"
          }
        ]
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(tasksDir, "task-1.json"),
    JSON.stringify(
      {
        task_id: "task-1",
        split: "dev",
        status: "active",
        source_kind: "replayed_factory_run",
        issue_number: 1,
        title: "Sample task",
        summary: "Task summary",
        artifact_paths: {
          approved_issue: ".factory/runs/1/approved-issue.md",
          spec: ".factory/runs/1/spec.md",
          plan: ".factory/runs/1/plan.md",
          acceptance_tests: ".factory/runs/1/acceptance-tests.md",
          repair_log: ".factory/runs/1/repair-log.md",
          review_json: ".factory/runs/1/review.json",
          cost_summary: ".factory/runs/1/cost-summary.json"
        },
        tags: ["sample"],
        risk_profile: "high",
        control_plane: true,
        expected_evidence: ["evidence"],
        comparison_dimensions: ["stage_completion"],
        curator_notes: "Sample notes"
      },
      null,
      2
    )
  );

  if (extraTask) {
    fs.writeFileSync(path.join(secondRunDir, "approved-issue.md"), "# Approved issue 2\n");
    fs.writeFileSync(path.join(secondRunDir, "spec.md"), "# Spec 2\n");
    fs.writeFileSync(path.join(secondRunDir, "plan.md"), "# Plan 2\n");
    fs.writeFileSync(path.join(secondRunDir, "acceptance-tests.md"), "# Acceptance 2\n");
    fs.writeFileSync(
      path.join(secondRunDir, "review.json"),
      JSON.stringify(
        {
          methodology: "default",
          decision: "pass",
          blocking_findings_count: 0,
          requirement_checks: []
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(secondRunDir, "cost-summary.json"),
      JSON.stringify(
        {
          estimated: true,
          provider: "openai",
          apiSurface: "codex-action",
          pricing: {
            version: "openai-2026-03-19",
            model: "gpt-5-mini",
            currency: "USD"
          },
          current: {
            stage: "review",
            derivedCost: {
              totalEstimatedUsd: 0.5
            }
          },
          stages: {
            review: {
              mode: "review",
              provider: "openai",
              apiSurface: "codex-action",
              model: "gpt-5-mini",
              derivedCost: {
                stageUsd: 0.5,
                actualUsd: null
              }
            }
          }
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(tasksDir, "task-2.json"),
      JSON.stringify(
        {
          task_id: "task-2",
          split: "dev",
          status: "active",
          source_kind: "replayed_factory_run",
          issue_number: 2,
          title: "Second task",
          summary: "Second task summary",
          artifact_paths: {
            approved_issue: ".factory/runs/2/approved-issue.md",
            spec: ".factory/runs/2/spec.md",
            plan: ".factory/runs/2/plan.md",
            acceptance_tests: ".factory/runs/2/acceptance-tests.md",
            review_json: ".factory/runs/2/review.json",
            cost_summary: ".factory/runs/2/cost-summary.json"
          },
          tags: ["secondary"],
          risk_profile: "medium",
          control_plane: false,
          expected_evidence: ["evidence"],
          comparison_dimensions: ["stage_completion"],
          curator_notes: "Secondary task"
        },
        null,
        2
      )
    );
  }

  fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".git", "HEAD"), "ref: refs/heads/main\n");

  return repoRoot;
}

test("loadEvalCorpus loads the checked-in corpus", () => {
  const corpus = loadEvalCorpus(path.join("eval", "corpus"), REPO_ROOT);

  assert.equal(corpus.index.corpus_revision, 1);
  assert.equal(corpus.tasksById.size, 4);
});

test("selectEvalTasks filters by task id and rejects missing tasks", () => {
  const corpus = loadEvalCorpus(path.join("eval", "corpus"), REPO_ROOT);
  const selected = selectEvalTasks(corpus, {
    taskIds: ["factory-run-55-cost-telemetry-calibration"]
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].task_id, "factory-run-55-cost-telemetry-calibration");

  assert.throws(
    () => selectEvalTasks(corpus, { taskIds: ["does-not-exist"] }),
    /Unknown eval task IDs/
  );
});

test("parseEvalCliArgs supports task filters and output overrides", () => {
  const parsed = parseEvalCliArgs([
    "--task",
    "a",
    "--task",
    "b",
    "--split",
    "dev",
    "--output",
    "eval/runs/manual-smoke"
  ]);

  assert.deepEqual(parsed, {
    split: "dev",
    taskIds: ["a", "b"],
    output: "eval/runs/manual-smoke"
  });
});

test("synthesizeTaskResult derives stage, review, cost, timing, and human audit fields", () => {
  const repoRoot = makeTempRepoFixture();
  const corpus = loadEvalCorpus(path.join("eval", "corpus"), repoRoot);
  const task = selectEvalTasks(corpus)[0];
  const result = synthesizeTaskResult({
    task,
    runId: "run-123",
    corpusRevision: corpus.index.corpus_revision,
    repoRoot,
    evaluatedAt: "2026-04-06T00:15:00Z"
  });

  assert.equal(result.run_id, "run-123");
  assert.equal(result.review_outcome.decision, "request_changes");
  assert.equal(result.review_outcome.unmet_requirement_checks_count, 1);
  assert.equal(result.stage_outcomes.plan.present, true);
  assert.equal(result.stage_outcomes.implement.succeeded, true);
  assert.equal(result.repair_summary.repair_log_present, true);
  assert.equal(result.cost_summary.total_estimated_usd, 1.25);
  assert.equal(result.cost_summary.has_actuals, true);
  assert.equal(result.timing.started_at, "2026-04-06T00:00:00Z");
  assert.equal(result.timing.duration_ms, 600000);
  assert.equal(result.human_audit.required, true);
  assert.equal(result.human_audit.status, "not_recorded");
  assert.equal(result.intervention_summary.known, false);
});

test("synthesizeTaskResult falls back to normalized cost-summary telemetry when event files are not linked", () => {
  const repoRoot = makeTempRepoFixture({ telemetryOnly: true });
  const corpus = loadEvalCorpus(path.join("eval", "corpus"), repoRoot);
  const task = selectEvalTasks(corpus)[0];
  const result = synthesizeTaskResult({
    task,
    runId: "run-telemetry-only",
    corpusRevision: corpus.index.corpus_revision,
    repoRoot,
    evaluatedAt: "2026-04-06T00:15:00Z"
  });

  assert.equal(result.stage_outcomes.implement.succeeded, true);
  assert.equal(result.stage_outcomes.implement.usage_event_paths.length, 0);
  assert.equal(result.stage_outcomes.review.succeeded, true);
  assert.equal(result.timing.started_at, "2026-04-06T00:00:00Z");
  assert.equal(result.timing.duration_ms, 600000);
  assert.equal(
    result.notes.some((note) => /Stage implement is present but no linked usage event was available/i.test(note)),
    false
  );
  assert.equal(
    result.notes.some((note) => /Stage review is present but no linked usage event was available/i.test(note)),
    false
  );
});

test("summarizeEvalRun aggregates multiple task results", () => {
  const taskResults = [
    {
      task_id: "a",
      stage_outcomes: {
        plan: { present: true, succeeded: true },
        implement: { present: true, succeeded: true },
        repair: { present: false, succeeded: false },
        review: { present: true, succeeded: true }
      },
      review_outcome: { decision: "pass" },
      intervention_summary: { known: false, count: null },
      repair_summary: { present: false },
      human_audit: { required: true, status: "not_recorded" },
      cost_summary: { total_estimated_usd: 1, total_actual_usd: 0.5, has_actuals: true },
      notes: ["a warning"]
    },
    {
      task_id: "b",
      stage_outcomes: {
        plan: { present: true, succeeded: true },
        implement: { present: true, succeeded: false },
        repair: { present: true, succeeded: true },
        review: { present: true, succeeded: true }
      },
      review_outcome: { decision: "request_changes" },
      intervention_summary: { known: false, count: null },
      repair_summary: { present: true },
      human_audit: { required: false, status: "not_recorded" },
      cost_summary: { total_estimated_usd: 2, total_actual_usd: 0, has_actuals: false },
      notes: []
    }
  ];

  const summary = summarizeEvalRun({
    runId: "run-123",
    corpusRevision: 1,
    gitCommit: "abc123",
    startedAt: "2026-04-06T00:00:00Z",
    finishedAt: "2026-04-06T00:10:00Z",
    taskResults,
    selectedTaskIds: ["a", "b"]
  });

  assert.equal(summary.task_count, 2);
  assert.equal(summary.stage_success_counts.plan.succeeded, 2);
  assert.equal(summary.stage_success_counts.implement.succeeded, 1);
  assert.equal(summary.review_decision_distribution.pass, 1);
  assert.equal(summary.review_decision_distribution.request_changes, 1);
  assert.equal(summary.repair_presence_rate, 0.5);
  assert.equal(summary.cost_totals.total_estimated_usd, 3);
  assert.equal(summary.cost_totals.tasks_with_actuals, 1);
  assert.equal(summary.human_audit.missing_required_tasks, 1);
  assert.match(summary.task_warnings[0], /a warning/);
});

test("runEval writes task results and aggregate outputs to the requested output directory", () => {
  const repoRoot = makeTempRepoFixture();
  const outputDir = path.join(repoRoot, "eval", "runs", "manual-smoke");

  const result = runEval({
    repoRoot,
    output: outputDir,
    now: () => new Date("2026-04-06T00:15:00Z"),
    getGitCommitFn: () => "fixture-commit"
  });

  assert.equal(result.outputRoot, outputDir);
  assert.equal(fileExists(path.join(outputDir, "run.json")), true);
  assert.equal(fileExists(path.join(outputDir, "tasks", "task-1.json")), true);
  assert.equal(fileExists(path.join(outputDir, "eval-summary.json")), true);
  assert.equal(fileExists(path.join(outputDir, "eval-summary.md")), true);
  assert.equal(result.summary.task_count, 1);
});

test("runEval clears stale task results when reusing an output directory", () => {
  const repoRoot = makeTempRepoFixture({ extraTask: true });
  const outputDir = path.join(repoRoot, "eval", "runs", "manual-smoke");

  runEval({
    repoRoot,
    output: outputDir,
    now: () => new Date("2026-04-06T00:15:00Z"),
    getGitCommitFn: () => "fixture-commit"
  });

  runEval({
    repoRoot,
    taskIds: ["task-1"],
    output: outputDir,
    now: () => new Date("2026-04-06T00:20:00Z"),
    getGitCommitFn: () => "fixture-commit"
  });

  assert.equal(fileExists(path.join(outputDir, "tasks", "task-1.json")), true);
  assert.equal(fileExists(path.join(outputDir, "tasks", "task-2.json")), false);
});

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
