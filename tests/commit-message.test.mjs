import test from "node:test";
import assert from "node:assert/strict";
import { buildCommitMessage } from "../scripts/lib/commit-message.mjs";

test("buildCommitMessage merges tests with code for implement stage", () => {
  const result = buildCommitMessage({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: [
      "M\tscripts/prepare-stage-push.mjs",
      "M\ttests/prepare-stage-push.test.mjs"
    ]
  });

  assert.equal(result, "factory(implement): update prepare stage push with tests");
});

test("repair commits include issue suffix", () => {
  const result = buildCommitMessage({
    mode: "repair",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: ["M\t.github/workflows/_factory-stage.yml"]
  });

  assert.equal(result, "factory(repair): update factory stage for issue #18");
});

test("planning artifacts fall back to branch slug", () => {
  const result = buildCommitMessage({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: [
      "M\t.factory/runs/18/spec.md",
      "M\t.factory/runs/18/plan.md"
    ]
  });

  assert.equal(result, "factory(implement): update improve factory generated commit messages");
});

test("verb selection reflects additions and deletions", () => {
  const addResult = buildCommitMessage({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: ["A\tsrc/feature-config.json"]
  });

  assert.equal(addResult, "factory(implement): add feature config");

  const removeResult = buildCommitMessage({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: ["D\tsrc/legacy-module.js"]
  });

  assert.equal(removeResult, "factory(implement): remove legacy module");
});

test("repair summary truncates while preserving suffix", () => {
  const result = buildCommitMessage({
    mode: "repair",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: ["M\tsrc/extraordinarily-long-feature-handling-file-name.js"],
    maxSummaryLength: 40
  });

  assert.ok(result.startsWith("factory(repair): update"));
  assert.ok(result.includes("..."));
  assert.ok(result.endsWith("for issue #18"));
});

test("rename descriptors use destination path", () => {
  const result = buildCommitMessage({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    stagedDiff: ["R100\tsrc/old-name.js\tsrc/new-feature-name.js"]
  });

  assert.equal(result, "factory(implement): update new feature name");
});
