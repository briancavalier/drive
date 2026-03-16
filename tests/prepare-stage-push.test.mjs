import test from "node:test";
import assert from "node:assert/strict";
import { resolveStageCommitAction } from "../scripts/prepare-stage-push.mjs";

test("resolveStageCommitAction commits staged changes with generated summary", () => {
  const result = resolveStageCommitAction({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    issueTitle: "",
    commitsAhead: 0,
    stagedDiff: [
      "M\tscripts/prepare-stage-push.mjs",
      "M\ttests/prepare-stage-push.test.mjs"
    ],
    diffFromRemote: ""
  });

  assert.deepEqual(result, {
    operation: "commit",
    commitSubject: "factory(implement): update prepare stage push with tests"
  });
});

test("resolveStageCommitAction amends a single pre-existing local commit", () => {
  const result = resolveStageCommitAction({
    mode: "implement",
    issueNumber: 24,
    branch: "factory/24-add-selective-emoji-to-human-facing-factory-stat",
    issueTitle: "",
    commitsAhead: 1,
    stagedDiff: "",
    diffFromRemote: [
      "M\tscripts/lib/github-messages.mjs",
      "M\ttests/github-messages.test.mjs"
    ]
  });

  assert.deepEqual(result, {
    operation: "amend",
    commitSubject: "factory(implement): update github messages with tests"
  });
});

test("resolveStageCommitAction rejects multiple local commits ahead of origin", () => {
  assert.throws(
    () =>
      resolveStageCommitAction({
        mode: "repair",
        issueNumber: 24,
        branch: "factory/24-add-selective-emoji-to-human-facing-factory-stat",
        issueTitle: "",
        commitsAhead: 2,
        stagedDiff: "",
        diffFromRemote: "M\tscripts/process-review.mjs"
      }),
    /Expected at most one stage-output commit/
  );
});
