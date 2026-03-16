import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadValidatedReviewArtifacts } from "../scripts/lib/review-artifacts.mjs";
import { renderCanonicalTraceabilityMarkdown } from "../scripts/lib/review-output.mjs";

function createArtifacts({
  reviewJson = {},
  beforeTraceability = "",
  afterTraceability = ""
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-artifacts-"));
  const baseReview = {
    methodology: "default",
    decision: "pass",
    summary: "All acceptance criteria are satisfied.",
    blocking_findings_count: 0,
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Acceptance criteria are covered by automated tests.",
        status: "satisfied",
        evidence: "End-to-end tests cover acceptance criteria."
      }
    ],
    findings: [],
    ...reviewJson
  };
  const traceability = renderCanonicalTraceabilityMarkdown(baseReview.requirement_checks);
  const markdownSegments = [
    "# ✅ Autonomous Review Decision: PASS",
    "",
    "## 📝 Summary",
    baseReview.summary,
    ""
  ];

  if (beforeTraceability) {
    markdownSegments.push(beforeTraceability, "");
  }

  markdownSegments.push(traceability);

  if (afterTraceability) {
    markdownSegments.push("", afterTraceability);
  }

  fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(baseReview, null, 2));
  fs.writeFileSync(path.join(dir, "review.md"), markdownSegments.join("\n"));

  return dir;
}

test("loadValidatedReviewArtifacts returns normalized review payload", () => {
  const artifactsPath = createArtifacts();
  const { review, reviewMarkdown } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.equal(review.methodology, "default");
  assert.equal(review.decision, "pass");
  assert.equal(review.findings.length, 0);
  assert.match(reviewMarkdown, /Autonomous Review Decision: PASS/);
});

test("loadValidatedReviewArtifacts rejects mismatched methodology", () => {
  const artifactsPath = createArtifacts({
    reviewJson: { methodology: "custom" }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "default"
      }),
    /review\.json methodology "custom" does not match expected "default"/
  );
});

test("loadValidatedReviewArtifacts enforces canonical traceability block", () => {
  const artifactsPath = createArtifacts({
    afterTraceability: "This replaces the canonical content."
  });
  const reviewMdPath = path.join(artifactsPath, "review.md");
  const markdownWithoutTraceability = fs
    .readFileSync(reviewMdPath, "utf8")
    .replace(renderCanonicalTraceabilityMarkdown([
      {
        type: "acceptance_criterion",
        requirement: "Acceptance criteria are covered by automated tests.",
        status: "satisfied",
        evidence: "End-to-end tests cover acceptance criteria."
      }
    ]), "## 🧭 Traceability\nThis content has drifted.");

  fs.writeFileSync(reviewMdPath, markdownWithoutTraceability);

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "default"
      }),
    /review\.md must include the canonical Traceability section/
  );
});

