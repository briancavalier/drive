import test from "node:test";
import assert from "node:assert/strict";
import {
  listBlockingFactoryTempArtifacts,
  listBlockingFactoryRunArtifacts,
  listFactoryRunArtifacts,
  listInvalidFactoryRunArtifacts,
  shouldBlockFactoryRunArtifacts
} from "../scripts/lib/factory-artifact-guard.mjs";

test("listFactoryRunArtifacts returns only run artifacts", () => {
  assert.deepEqual(
    listFactoryRunArtifacts([
      { status: "A", path: ".factory/runs/1/spec.md" },
      { status: "M", path: ".factory/prompts/plan.md" },
      { status: "D", path: ".factory/runs/1/plan.md" }
    ]),
    [
      { status: "A", path: ".factory/runs/1/spec.md" },
      { status: "D", path: ".factory/runs/1/plan.md" }
    ]
  );
});

test("listBlockingFactoryRunArtifacts ignores deletions", () => {
  assert.deepEqual(
    listBlockingFactoryRunArtifacts([
      { status: "D", path: ".factory/runs/1/spec.md" },
      { status: "M", path: ".factory/runs/1/plan.md" }
    ]),
    [{ status: "M", path: ".factory/runs/1/plan.md" }]
  );
});

test("listInvalidFactoryRunArtifacts flags unexpected files under run directories", () => {
  assert.deepEqual(
    listInvalidFactoryRunArtifacts([
      { status: "A", path: ".factory/runs/1/approved-issue.md" },
      { status: "A", path: ".factory/runs/1/spec.md" },
      { status: "A", path: ".factory/runs/1/cost-summary.json" },
      { status: "A", path: ".factory/runs/1/tmp.txt" },
      { status: "A", path: ".factory/runs/1/nested/extra.md" }
    ]),
    [
      { status: "A", path: ".factory/runs/1/tmp.txt" },
      { status: "A", path: ".factory/runs/1/nested/extra.md" }
    ]
  );
});

test("listBlockingFactoryTempArtifacts blocks temp additions but not deletions", () => {
  assert.deepEqual(
    listBlockingFactoryTempArtifacts([
      { status: "A", path: ".factory/tmp/prompt.md" },
      { status: "D", path: ".factory/tmp/prompt-meta.json" }
    ]),
    [{ status: "A", path: ".factory/tmp/prompt.md" }]
  );
});

test("guard blocks non-factory pull requests targeting main", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "codex/fix",
      changes: [{ status: "A", path: ".factory/runs/1/spec.md" }]
    }),
    true
  );
});

test("guard allows factory pull requests targeting main", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "factory/1-example",
      changes: [{ status: "A", path: ".factory/runs/1/spec.md" }]
    }),
    false
  );
});

test("guard blocks unexpected run artifacts even on factory branches", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "factory/1-example",
      changes: [{ status: "A", path: ".factory/runs/1/notes.txt" }]
    }),
    true
  );
});

test("guard ignores unrelated changes", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "codex/fix",
      changes: [{ status: "M", path: ".github/workflows/factory-pr-loop.yml" }]
    }),
    false
  );
});

test("guard allows deletion-only cleanup pull requests", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "codex/fix",
      changes: [{ status: "D", path: ".factory/runs/1/spec.md" }]
    }),
    false
  );
});

test("guard blocks temporary artifact writes on any branch", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "factory/1-example",
      changes: [{ status: "A", path: ".factory/tmp/prompt.md" }]
    }),
    true
  );
});

test("guard ignores calibration artifact at the factory root", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "codex/fix",
      changes: [{ status: "A", path: ".factory/cost-calibration.json" }]
    }),
    false
  );
});
