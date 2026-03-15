import test from "node:test";
import assert from "node:assert/strict";
import {
  listFactoryRunArtifacts,
  shouldBlockFactoryRunArtifacts
} from "../scripts/lib/factory-artifact-guard.mjs";

test("listFactoryRunArtifacts returns only run artifacts", () => {
  assert.deepEqual(
    listFactoryRunArtifacts([
      ".factory/runs/1/spec.md",
      ".factory/prompts/plan.md",
      ".factory/runs/1/plan.md"
    ]),
    [".factory/runs/1/spec.md", ".factory/runs/1/plan.md"]
  );
});

test("guard blocks non-factory pull requests targeting main", () => {
  assert.equal(
    shouldBlockFactoryRunArtifacts({
      eventName: "pull_request",
      baseRef: "main",
      headRef: "codex/fix",
      changedFiles: [".factory/runs/1/spec.md"]
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
      changedFiles: [".factory/runs/1/spec.md"]
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
      changedFiles: [".github/workflows/factory-pr-loop.yml"]
    }),
    false
  );
});
