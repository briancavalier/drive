import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadReviewerConfig } from "../scripts/lib/reviewer-config.mjs";
import { synthesizeMultiReview } from "../scripts/run-review-coordinator.mjs";

function makeArtifactsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multi-review-"));
  fs.mkdirSync(path.join(dir, "reviewers"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "reviewers", "selection.json"),
    JSON.stringify(
      {
        mode: "multi_review",
        selected_reviewers: [
          { name: "traceability" },
          { name: "correctness" }
        ],
        skipped_reviewers: []
      },
      null,
      2
    )
  );

  return dir;
}

function writeReviewerArtifact(dir, name, payload) {
  fs.writeFileSync(path.join(dir, "reviewers", `${name}.json`), JSON.stringify(payload, null, 2));
}

test("synthesizeMultiReview merges reviewer artifacts into final review output", () => {
  const dir = makeArtifactsDir();
  writeReviewerArtifact(dir, "traceability", {
    reviewer: "traceability",
    summary: "One gap found.",
    status: "completed",
    findings: [
      {
        level: "blocking",
        title: "Acceptance criterion lacks evidence",
        details: "Missing proof for retry cleanup.",
        scope: "scripts/process-review.mjs",
        recommendation: "Add a regression test.",
        evidence: ["tests/process-review.test.mjs has no interrupted retry case."]
      }
    ],
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Interrupted retries leave no stale review state",
        status: "partially_satisfied",
        evidence: ["Coverage is missing for the interrupted retry path."]
      }
    ],
    uncertainties: []
  });
  writeReviewerArtifact(dir, "correctness", {
    reviewer: "correctness",
    summary: "No additional correctness breaks found.",
    status: "completed",
    findings: [],
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Interrupted retries leave no stale review state",
        status: "satisfied",
        evidence: ["Existing cleanup logic covers the main path."]
      }
    ],
    uncertainties: ["Interrupted retry semantics inferred from code paths."]
  });

  const { review, reviewMarkdown } = synthesizeMultiReview({
    artifactsPath: dir,
    reviewerConfig: loadReviewerConfig()
  });

  assert.equal(review.methodology, "multi-review");
  assert.equal(review.decision, "request_changes");
  assert.equal(review.reviewers_run.length, 2);
  assert.match(reviewMarkdown, /Reviewers/);
  assert.equal(review.disagreements.length, 1);
});
