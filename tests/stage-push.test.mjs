import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStagePush,
  getProtectedPathChanges,
  hasTempFactoryArtifactWrites,
  hasWorkflowFileChanges,
  isSelfModifyEnabled,
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
    hasWorkflowFileChanges(["M\tREADME.md", "A\tsrc/index.js"]),
    false
  );
  assert.equal(
    hasWorkflowFileChanges(["M\t.github/workflows/factory-pr-loop.yml"]),
    true
  );
  assert.equal(
    hasWorkflowFileChanges(["D\t.github/workflows/factory-pr-loop.yml"]),
    true
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
  assert.deepEqual(parseChangedFiles(["R100\tREADME.md\tscripts/self-modify.mjs"]), [
    { status: "R100", path: "scripts/self-modify.mjs" }
  ]);
  assert.deepEqual(parseChangedFiles(["C100\tREADME.md\t.github/workflows/test.yml"]), [
    { status: "C100", path: ".github/workflows/test.yml" }
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

test("isSelfModifyEnabled parses truthy repository variable values", () => {
  assert.equal(isSelfModifyEnabled("true"), true);
  assert.equal(isSelfModifyEnabled("1"), true);
  assert.equal(isSelfModifyEnabled("yes"), true);
  assert.equal(isSelfModifyEnabled("false"), false);
  assert.equal(isSelfModifyEnabled(""), false);
});

test("getProtectedPathChanges reports protected control-plane paths", () => {
  assert.deepEqual(
    getProtectedPathChanges(["M\tREADME.md", "A\tscripts/apply-pr-state.mjs", "A\t.factory/FACTORY.md"]),
    [
      {
        kind: "scripts",
        label: "scripts/**",
        paths: ["scripts/apply-pr-state.mjs"]
      },
      {
        kind: "factoryPolicy",
        label: ".factory/FACTORY.md",
        paths: [".factory/FACTORY.md"]
      }
    ]
  );
  assert.deepEqual(getProtectedPathChanges(["R100\tREADME.md\tscripts/self-modify.mjs"]), [
    {
      kind: "scripts",
      label: "scripts/**",
      paths: ["scripts/self-modify.mjs"]
    }
  ]);
});

test("hasWorkflowFileChanges treats renames into workflows as workflow changes", () => {
  assert.equal(
    hasWorkflowFileChanges(["R100\tREADME.md\t.github/workflows/factory-pr-loop.yml"]),
    true
  );
});

test("evaluateStagePush allows product changes without self-modify mode", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\tREADME.md", "A\tsrc/index.js"],
    hasFactoryToken: false,
    selfModifyEnabled: false,
    hasSelfModifyLabel: false
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, false);
  assert.deepEqual(result.protectedPathChanges, []);
});

test("evaluateStagePush blocks protected-path edits when self-modify mode is disabled", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\tscripts/apply-pr-state.mjs", "A\t.factory/FACTORY.md"],
    hasFactoryToken: true,
    selfModifyEnabled: false,
    hasSelfModifyLabel: true
  });

  assert.equal(result.allowed, false);
  assert.equal(result.workflowChanges, false);
  assert.equal(result.protectedPathChanges.length, 2);
  assert.match(result.reason, /FACTORY_ENABLE_SELF_MODIFY/);
});

test("evaluateStagePush blocks protected-path edits without the self-modify label", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\t.factory/prompts/review.md", "A\t.factory/FACTORY.md"],
    hasFactoryToken: true,
    selfModifyEnabled: true,
    hasSelfModifyLabel: false
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /factory:self-modify/);
});

test("evaluateStagePush blocks protected-path edits without FACTORY_GITHUB_TOKEN", () => {
  const result = evaluateStagePush({
    changedFiles: ["M\t.github/workflows/_factory-stage.yml", "A\t.factory/FACTORY.md"],
    hasFactoryToken: false,
    selfModifyEnabled: true,
    hasSelfModifyLabel: true
  });

  assert.equal(result.allowed, false);
  assert.equal(result.workflowChanges, true);
  assert.equal(result.protectedPathChanges.length, 2);
  assert.match(result.reason, /FACTORY_GITHUB_TOKEN/);
});

test("evaluateStagePush blocks renames into protected paths without authorization", () => {
  const result = evaluateStagePush({
    changedFiles: ["R100\tREADME.md\t.factory/FACTORY.md"],
    hasFactoryToken: true,
    selfModifyEnabled: false,
    hasSelfModifyLabel: true
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /FACTORY_ENABLE_SELF_MODIFY/);
});

test("evaluateStagePush allows protected-path edits when self-modify mode is fully authorized", () => {
  const result = evaluateStagePush({
    changedFiles: [
      "M\tscripts/apply-pr-state.mjs",
      "M\t.factory/prompts/review.md",
      "M\t.factory/review-methods/default/instructions.md",
      "M\t.factory/messages/pr-body.md",
      "M\t.github/workflows/_factory-stage.yml",
      "A\t.factory/FACTORY.md"
    ],
    hasFactoryToken: true,
    selfModifyEnabled: true,
    hasSelfModifyLabel: true
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowChanges, true);
  assert.ok(result.protectedPathChanges.length >= 2);
});

test("evaluateStagePush allows deleting temp artifacts", () => {
  const result = evaluateStagePush({
    changedFiles: ["D\t.factory/tmp/prompt.md", "M\tREADME.md"],
    hasFactoryToken: true,
    selfModifyEnabled: false,
    hasSelfModifyLabel: false
  });

  assert.equal(result.allowed, true);
});

test("evaluateStagePush blocks adding temp artifacts", () => {
  const result = evaluateStagePush({
    changedFiles: ["A\t.factory/tmp/prompt.md", "M\tREADME.md"],
    hasFactoryToken: true,
    selfModifyEnabled: true,
    hasSelfModifyLabel: true
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /\.factory\/tmp\//);
});
