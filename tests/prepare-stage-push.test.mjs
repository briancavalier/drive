import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveStageCommitAction,
  shouldAllowNoChanges,
  validateReviewArtifactsForStage,
  main as prepareStagePushMain
} from "../scripts/prepare-stage-push.mjs";

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

test("review mode allows no-op stage output for identical artifacts", () => {
  assert.equal(shouldAllowNoChanges("review"), true);
  assert.equal(shouldAllowNoChanges("implement"), false);
  assert.equal(shouldAllowNoChanges("repair"), false);
});

test("validateReviewArtifactsForStage skips non-review modes", () => {
  let called = false;

  validateReviewArtifactsForStage(
    { mode: "implement", artifactsPath: "", reviewMethod: "" },
    () => {
      called = true;
    }
  );

  assert.equal(called, false);
});

test("validateReviewArtifactsForStage requires artifacts path in review mode", () => {
  assert.throws(
    () =>
      validateReviewArtifactsForStage(
        { mode: "review", artifactsPath: "", reviewMethod: "default" },
        () => {}
      ),
    /FACTORY_ARTIFACTS_PATH is required/
  );
});

test("validateReviewArtifactsForStage delegates to loadValidatedReviewArtifacts", () => {
  let invocation = null;

  validateReviewArtifactsForStage(
    {
      mode: "review",
      artifactsPath: "/tmp/review-artifacts",
      reviewMethod: "custom"
    },
    (options) => {
      invocation = options;
    }
  );

  assert.deepEqual(invocation, {
    artifactsPath: "/tmp/review-artifacts",
    requestedMethodology: "custom"
  });
});

test("prepare-stage-push fails before git when review validation rejects", () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-invalid-"));
  const reviewJson = {
    methodology: "default",
    decision: "pass",
    summary: "Test summary",
    blocking_findings_count: 0,
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Validation runs before push.",
        status: "satisfied",
        evidence: "Guarded by prepare-stage-push."
      }
    ],
    findings: []
  };

  fs.writeFileSync(path.join(artifactsDir, "review.json"), JSON.stringify(reviewJson, null, 2));
  fs.writeFileSync(path.join(artifactsDir, "review.md"), "# Invalid review\n\nMissing traceability.");

  try {
    let thrown = null;

    try {
      prepareStagePushMain({
        FACTORY_BRANCH: "factory/34-review-test",
        FACTORY_MODE: "review",
        FACTORY_ISSUE_NUMBER: "34",
        FACTORY_ISSUE_TITLE: "Add validation guard",
        FACTORY_ARTIFACTS_PATH: artifactsDir,
        FACTORY_REVIEW_METHOD: "default",
        GITHUB_TOKEN: "ghs_mock"
      });
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, "expected validation failure");
    assert.match(thrown.message, /review\.md must include/);
  } finally {
  }
});
