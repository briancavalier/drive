import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  persistCostSummaryForStage,
  resolveStageCommitAction,
  shouldPersistCostSummary,
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

test("shouldPersistCostSummary keeps implement and repair no-op safe", () => {
  assert.equal(shouldPersistCostSummary("implement", false), false);
  assert.equal(shouldPersistCostSummary("repair", false), false);
  assert.equal(shouldPersistCostSummary("implement", true), true);
  assert.equal(shouldPersistCostSummary("review", false), true);
  assert.equal(shouldPersistCostSummary("plan", false), true);
});

test("persistCostSummaryForStage skips implement artifact-only output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cost-summary-"));
  const summaryPath = path.join(tempDir, "estimate.json");
  const artifactsPath = path.join(tempDir, "artifacts");

  fs.writeFileSync(summaryPath, JSON.stringify({ estimated: true }, null, 2));

  const persistedPath = persistCostSummaryForStage({
    mode: "implement",
    artifactsPath,
    costSummaryPath: summaryPath,
    worktreeHasChanges: false
  });

  assert.equal(persistedPath, "");
  assert.equal(fs.existsSync(path.join(artifactsPath, "cost-summary.json")), false);
});

test("persistCostSummaryForStage copies durable summary when allowed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cost-summary-"));
  const summaryPath = path.join(tempDir, "estimate.json");
  const artifactsPath = path.join(tempDir, "artifacts");
  const summary = { estimated: true, current: { totalEstimatedUsd: 0.1 } };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const persistedPath = persistCostSummaryForStage({
    mode: "review",
    artifactsPath,
    costSummaryPath: summaryPath,
    worktreeHasChanges: false
  });

  assert.equal(persistedPath, path.join(artifactsPath, "cost-summary.json"));
  assert.deepEqual(
    JSON.parse(fs.readFileSync(persistedPath, "utf8")),
    summary
  );
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

test("prepare-stage-push fails before git when review payload is invalid", () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-invalid-"));
  const reviewJson = {
    methodology: "default",
    decision: "pass",
    summary: "Test summary",
    blocking_findings_count: 0,
    requirement_checks: [],
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
    assert.match(thrown.message, /requirement_checks must be a non-empty array/);
  } finally {
  }
});

test("prepare-stage-push normalizes drifted review traceability before git", () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-normalized-"));
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
  fs.writeFileSync(
    path.join(artifactsDir, "review.md"),
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "Test summary",
      "",
      "## 🧭 Traceability",
      "",
      "<details><summary>Traceability: Acceptance Criteria</summary>",
      "",
      "- Acceptance Criterion: \"Validation runs before push.\" — satisfied.",
      "  - Evidence: Guarded by prepare-stage-push.",
      "",
      "</details>",
      "",
      "Methodology used: default."
    ].join("\n")
  );

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

  assert.ok(thrown, "expected git failure after validation");
  assert.doesNotMatch(thrown.message, /canonical Traceability section/);

  const normalizedReviewMarkdown = fs.readFileSync(path.join(artifactsDir, "review.md"), "utf8");
  assert.match(normalizedReviewMarkdown, /- Requirement: Validation runs before push\./);
  assert.match(normalizedReviewMarkdown, /  - Status: `satisfied`/);
  assert.match(normalizedReviewMarkdown, /Methodology used: default\./);
});
