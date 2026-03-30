import test from "node:test";
import assert from "node:assert/strict";
import { loadReviewerConfig } from "../scripts/lib/reviewer-config.mjs";
import { selectReviewers } from "../scripts/lib/reviewer-selection.mjs";

test("selectReviewers includes required reviewers and records reasons", () => {
  const config = loadReviewerConfig();
  config.policy.mode = "multi_review";
  const selection = selectReviewers({
    config,
    changedFiles: ["src/example.ts"],
    labels: []
  });

  assert.deepEqual(
    selection.selected_reviewers.map((entry) => entry.name),
    ["traceability", "correctness"]
  );
  assert.equal(selection.selected_reviewers[0].reason, "required by policy");
});

test("selectReviewers adds workflow_safety for matching paths", () => {
  const config = loadReviewerConfig();
  config.policy.mode = "multi_review";
  const selection = selectReviewers({
    config,
    changedFiles: [".github/workflows/ci.yml", "scripts/process-review.mjs"],
    labels: []
  });

  assert.ok(
    selection.selected_reviewers.some((entry) => entry.name === "workflow_safety")
  );
});

test("selectReviewers records disabled reviewers as skipped", () => {
  const config = loadReviewerConfig();
  config.policy.mode = "multi_review";
  config.reviewers.workflow_safety.enabled = false;
  const selection = selectReviewers({
    config,
    changedFiles: [".github/workflows/ci.yml"],
    labels: []
  });

  assert.ok(
    selection.skipped_reviewers.some(
      (entry) => entry.name === "workflow_safety" && entry.reason === "disabled"
    )
  );
});
