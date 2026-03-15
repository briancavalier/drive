import test from "node:test";
import assert from "node:assert/strict";
import {
  listBlockingFactoryRunArtifacts,
  listFactoryRunArtifacts,
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
