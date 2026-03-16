import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStagePush,
  hasTempFactoryArtifactWrites,
  hasWorkflowFileChanges,
  parseChangedFiles,
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
    hasWorkflowFileChanges(["M\tREADME.md", "A\tscripts/apply-pr-state.mjs"]),
    false
  );
  assert.equal(
    hasWorkflowFileChanges(["M\t.github/workflows/factory-pr-loop.yml"]),
    true
  );
  assert.equal(
    hasWorkflowFileChanges(["D\t.github/workflows/factory-pr-loop.yml"]),
    false
  );
});

test("parseChangedFiles supports raw paths and name-status entries", () => {
  assert.deepEqual(parseChangedFiles(["README.md"]), [
    { status: "", path: "README.md" }
  ]);
  assert.deepEqual(parseChangedFiles(["M\tREADME.md", "D\t.factory/tmp/prompt.md"]), [
    { status: "M", path: "README.md" },
    { status: "D", path: ".factory/tmp/prompt.md" }
  ]);
});

test("hasTempFactoryArtifactWrites only matches temp additions or modifications", () => {
  assert.equal(
    hasTempFactoryArtifactWrites(["D\t.factory/tmp/prompt.md"]),
    false
  );
  assert.equal(
    hasTempFactoryArtifactWrites(["M\t.factory/tmp/prompt.md"]),
    true
  );
  assert.equal(
    hasTempFactoryArtifactWrites(["A\t.factory/tmp/prompt-meta.json"]),
    true
  );
});

test("evaluateStagePush allows non-workflow changes without FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\tREADME.md", "A\tscripts/apply-pr-state.mjs"],
    hasFactoryToken: false
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, false);
});

test("evaluateStagePush blocks workflow changes without FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\t.github/workflows/_factory-stage.yml", "M\tREADME.md"],
    hasFactoryToken: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.workflowChanges, true);
  assert.match(result.reason, /FACTORY_GITHUB_TOKEN/);
});

test("evaluateStagePush allows workflow changes with FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\t.github/workflows/_factory-stage.yml", "M\tREADME.md"],
    hasFactoryToken: true
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, true);
});

test("evaluateStagePush allows deleting temp artifacts", () => {
  const result = evaluateStagePush({
    changedFiles: ["D\t.factory/tmp/prompt.md", "M\tREADME.md"],
    hasFactoryToken: true
  });

  assert.equal(result.allowed, true);
});

test("evaluateStagePush blocks adding temp artifacts", () => {
  const result = evaluateStagePush({
    changedFiles: ["A\t.factory/tmp/prompt.md", "M\tREADME.md"],
    hasFactoryToken: true
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /\.factory\/tmp\//);
});
