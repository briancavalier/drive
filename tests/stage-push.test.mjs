import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStagePush,
  hasWorkflowFileChanges,
  resolveStageToken
} from "../scripts/lib/stage-push.mjs";

test("resolveStageToken prefers FACTORY_GITHUB_TOKEN", () => {
  const result = resolveStageToken({
    factoryToken: "factory-token",
    githubToken: "github-token"
  });

  assert.equal(result.source, "factory");
  assert.equal(result.token, "factory-token");
});

test("resolveStageToken falls back to GITHUB_TOKEN", () => {
  const result = resolveStageToken({
    factoryToken: "",
    githubToken: "github-token"
  });

  assert.equal(result.source, "github");
  assert.equal(result.token, "github-token");
});

test("hasWorkflowFileChanges only matches workflow paths", () => {
  assert.equal(
    hasWorkflowFileChanges(["README.md", "scripts/apply-pr-state.mjs"]),
    false
  );
  assert.equal(
    hasWorkflowFileChanges([".github/workflows/factory-pr-loop.yml"]),
    true
  );
});

test("evaluateStagePush allows non-workflow changes without FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: ["README.md", "scripts/apply-pr-state.mjs"],
    hasFactoryToken: false
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, false);
});

test("evaluateStagePush blocks workflow changes without FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: [".github/workflows/_factory-stage.yml", "README.md"],
    hasFactoryToken: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.workflowChanges, true);
  assert.match(result.reason, /FACTORY_GITHUB_TOKEN/);
});

test("evaluateStagePush allows workflow changes with FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: [".github/workflows/_factory-stage.yml", "README.md"],
    hasFactoryToken: true
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, true);
});
