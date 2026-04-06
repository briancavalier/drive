import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  main,
  validateEvalCorpus
} from "../scripts/validate-eval-corpus.mjs";

const FIXED_TIME = "2026-04-05T00:00:00Z";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function buildTask(taskId = "task-1") {
  return {
    task_id: taskId,
    split: "dev",
    status: "active",
    source_kind: "replayed_factory_run",
    issue_number: 1,
    title: "Sample task",
    summary: "Sample summary",
    artifact_paths: {
      spec: ".factory/runs/1/spec.md",
      plan: ".factory/runs/1/plan.md",
      acceptance_tests: ".factory/runs/1/acceptance-tests.md",
      review_json: ".factory/runs/1/review.json"
    },
    tags: ["sample"],
    risk_profile: "medium",
    control_plane: false,
    expected_evidence: ["unit tests"],
    comparison_dimensions: ["stage_completion"],
    curator_notes: "Sample notes"
  };
}

function buildIndex(taskIds = ["task-1"], holdoutIds = ["holdout-1"]) {
  return {
    schema_version: 1,
    corpus_revision: 1,
    updated_at: FIXED_TIME,
    splits: {
      dev: {
        task_ids: taskIds
      },
      holdout: {
        task_ids: holdoutIds,
        note: "Holdout contents are stored outside the workspace."
      }
    },
    task_ids: taskIds,
    holdout_ids: holdoutIds,
    notes: ["Sample notes"]
  };
}

function buildHoldout(entries = null) {
  return {
    schema_version: 1,
    holdout_revision: 1,
    entries: entries || [
      {
        task_id: "holdout-1",
        status: "holdout_external",
        provenance: "Private sample",
        owner: "factory-maintainers",
        last_reviewed_at: FIXED_TIME,
        notes: "Manifest only",
        external_storage_reference: "private-holdout://sample/1"
      }
    ]
  };
}

function createCorpusFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-corpus-"));
  const corpusRoot = path.join(repoRoot, "eval", "corpus");
  const tasksDir = path.join(corpusRoot, "tasks");
  const runDir = path.join(repoRoot, ".factory", "runs", "1");

  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "spec.md"), "# Spec\n");
  fs.writeFileSync(path.join(runDir, "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(runDir, "acceptance-tests.md"), "# Acceptance\n");
  fs.writeFileSync(path.join(runDir, "review.json"), "{}\n");

  writeJson(path.join(tasksDir, "task-1.json"), buildTask());
  writeJson(path.join(corpusRoot, "index.json"), buildIndex());
  writeJson(path.join(corpusRoot, "holdout-manifest.json"), buildHoldout());

  return {
    repoRoot,
    corpusRoot
  };
}

test("validateEvalCorpus accepts the checked-in corpus", () => {
  const repoRoot = path.resolve(path.join(import.meta.dirname, ".."));
  const result = validateEvalCorpus(path.join("eval", "corpus"), repoRoot);

  assert.equal(result.corpusRevision, 1);
  assert.equal(result.taskCount, 4);
  assert.equal(result.holdoutCount, 1);
  assert.deepEqual(result.taskIds.sort(), [
    "factory-run-126-post-merge-artifact-ref",
    "factory-run-135-curated-review-body",
    "factory-run-42-workflow-safety-review",
    "factory-run-55-cost-telemetry-calibration"
  ]);
});

test("validateEvalCorpus rejects duplicate task IDs in the index", () => {
  const fixture = createCorpusFixture();
  writeJson(path.join(fixture.corpusRoot, "index.json"), buildIndex(["task-1", "task-1"]));

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /must not contain duplicate task IDs/
  );
});

test("validateEvalCorpus rejects missing required task fields", () => {
  const fixture = createCorpusFixture();
  const invalidTask = buildTask();
  delete invalidTask.summary;
  writeJson(path.join(fixture.corpusRoot, "tasks", "task-1.json"), invalidTask);

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /summary must be a non-empty string/
  );
});

test("validateEvalCorpus rejects missing referenced artifact files", () => {
  const fixture = createCorpusFixture();
  fs.rmSync(path.join(fixture.repoRoot, ".factory", "runs", "1", "plan.md"));

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /references missing artifact/
  );
});

test("validateEvalCorpus rejects invalid split or status", () => {
  const fixture = createCorpusFixture();
  const invalidTask = buildTask();
  invalidTask.split = "holdout";
  invalidTask.status = "pending";
  writeJson(path.join(fixture.corpusRoot, "tasks", "task-1.json"), invalidTask);

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /split must be "dev"/
  );
});

test("validateEvalCorpus rejects holdout entries with repo artifact paths", () => {
  const fixture = createCorpusFixture();
  writeJson(
    path.join(fixture.corpusRoot, "holdout-manifest.json"),
    buildHoldout([
      {
        task_id: "holdout-1",
        status: "holdout_external",
        provenance: "Private sample",
        owner: "factory-maintainers",
        last_reviewed_at: FIXED_TIME,
        notes: "Uses .factory/runs/1/spec.md internally",
        external_storage_reference: "private-holdout://sample/1"
      }
    ])
  );

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /must not include repo artifact paths/
  );
});

test("validateEvalCorpus rejects index and task manifest mismatches", () => {
  const fixture = createCorpusFixture();
  writeJson(path.join(fixture.corpusRoot, "index.json"), buildIndex(["task-2"]));

  assert.throws(
    () => validateEvalCorpus(path.join("eval", "corpus"), fixture.repoRoot),
    /index\.json task_ids must match the task manifests on disk/
  );
});

test("main prints a success summary for a valid corpus", () => {
  const fixture = createCorpusFixture();
  const originalCwd = process.cwd();
  const writes = [];

  try {
    process.chdir(fixture.repoRoot);
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    const result = main([path.join("eval", "corpus")]);
    assert.equal(result.taskCount, 1);
    assert.match(writes.join(""), /Validated eval corpus at eval\/corpus/);

    process.stdout.write = originalWrite;
  } finally {
    process.chdir(originalCwd);
  }
});
