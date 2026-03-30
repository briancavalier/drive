import test from "node:test";
import assert from "node:assert/strict";
import {
  loadReviewerConfig,
  resolveReviewMethodologyName,
  validateReviewerConfig
} from "../scripts/lib/reviewer-config.mjs";

test("loadReviewerConfig falls back to single-review defaults when config is missing", () => {
  const config = loadReviewerConfig({ configPath: ".factory/does-not-exist.json" });

  assert.equal(config.policy.mode, "single_review");
  assert.equal(config.policy.fallback_methodology, "default");
});

test("validateReviewerConfig accepts the repository reviewer config", () => {
  const config = loadReviewerConfig();

  assert.equal(config.version, 1);
  assert.ok(config.reviewers.traceability);
  assert.ok(config.reviewers.correctness);
});

test("resolveReviewMethodologyName prefers multi-review when policy mode is enabled", () => {
  const methodology = resolveReviewMethodologyName({
    reviewerConfig: validateReviewerConfig({
      version: 1,
      reviewers: {},
      policy: {
        mode: "multi_review",
        max_reviewers: 2,
        fallback_methodology: "default",
        required_reviewers: [],
        coordinator: {
          strategy: "conservative",
          require_evidence_for_blocking: true,
          preserve_blocking_from: [],
          record_disagreements: true
        }
      }
    })
  });

  assert.equal(methodology, "multi-review");
});
