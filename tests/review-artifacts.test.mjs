import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadValidatedReviewArtifacts,
  normalizeReviewArtifacts
} from "../scripts/lib/review-artifacts.mjs";
import { renderCanonicalTraceabilityMarkdown } from "../scripts/lib/review-output.mjs";

function normalizeEvidenceForMarkdown(evidence) {
  if (Array.isArray(evidence)) {
    return evidence.map((item) => `${item ?? ""}`);
  }

  if (typeof evidence === "string") {
    return [evidence];
  }

  return ["[invalid evidence placeholder]"];
}

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
        evidence: ["End-to-end tests cover acceptance criteria."]
      }
    ],
    findings: [],
    checklist: {
      state_changed: true,
      writers_reviewed: true,
      readers_reviewed: true,
      workflow_paths_checked: true,
      cleanup_paths_checked: true,
      tests_evidence_checked: true,
      residual_risks: "No additional residual workflow risks identified."
    },
    ...reviewJson
  };
  const traceability = renderCanonicalTraceabilityMarkdown(
    baseReview.requirement_checks.map((check) => ({
      ...check,
      evidence: normalizeEvidenceForMarkdown(check.evidence)
    }))
  );
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

test("loadValidatedReviewArtifacts accepts workflow-safety methodology", () => {
  const artifactsPath = createArtifacts({
    reviewJson: { methodology: "workflow-safety" }
  });
  const { review } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "workflow-safety"
  });

  assert.equal(review.methodology, "workflow-safety");
  assert.equal(review.checklist.state_changed, true);
});

test("loadValidatedReviewArtifacts rejects workflow-safety reviews without checklist", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      methodology: "workflow-safety",
      checklist: undefined
    }
  });
  const reviewJsonPath = path.join(artifactsPath, "review.json");
  const parsed = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));
  delete parsed.checklist;
  fs.writeFileSync(reviewJsonPath, JSON.stringify(parsed, null, 2));

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "workflow-safety"
      }),
    /checklist must be an object for workflow-safety reviews/
  );
});

test("loadValidatedReviewArtifacts rejects workflow-safety pass reviews with incomplete checklist booleans", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      methodology: "workflow-safety",
      checklist: {
        state_changed: true,
        writers_reviewed: true,
        readers_reviewed: false,
        workflow_paths_checked: true,
        cleanup_paths_checked: true,
        tests_evidence_checked: true,
        residual_risks: "Reader inventory was incomplete."
      }
    }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "workflow-safety"
      }),
    /workflow-safety pass reviews must mark every checklist boolean as true/
  );
});

test("loadValidatedReviewArtifacts requires checklist for multi-review when workflow_safety ran", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      methodology: "multi-review",
      reviewers_run: [
        {
          name: "traceability",
          status: "completed",
          summary: "Traceability satisfied."
        },
        {
          name: "workflow_safety",
          status: "completed",
          summary: "Workflow safety satisfied."
        }
      ],
      checklist: undefined
    }
  });
  const reviewJsonPath = path.join(artifactsPath, "review.json");
  const parsed = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));
  delete parsed.checklist;
  fs.writeFileSync(reviewJsonPath, JSON.stringify(parsed, null, 2));

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "multi-review"
      }),
    /checklist must be an object for workflow-safety reviews/
  );
});

test("loadValidatedReviewArtifacts accepts checklist for multi-review when workflow_safety ran", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      methodology: "multi-review",
      reviewers_run: [
        {
          name: "traceability",
          status: "completed",
          summary: "Traceability satisfied."
        },
        {
          name: "workflow_safety",
          status: "completed",
          summary: "Workflow safety satisfied."
        }
      ]
    }
  });

  const { review } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "multi-review"
  });

  assert.equal(review.methodology, "multi-review");
  assert.equal(review.checklist.state_changed, true);
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

test("loadValidatedReviewArtifacts rewrites drifted traceability to the canonical block", () => {
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
        evidence: ["End-to-end tests cover acceptance criteria."]
      }
    ]), "<details>\n<summary>🧭 Traceability</summary>\n\nThis content has drifted.\n</details>");

  fs.writeFileSync(reviewMdPath, markdownWithoutTraceability);

  const { reviewMarkdown } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
  assert.match(reviewMarkdown, /#### Acceptance Criteria \(✅ 1\)/);
  assert.match(
    reviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: Acceptance criteria are covered by automated tests\./
  );
  assert.match(
    reviewMarkdown,
    /  - \*\*Evidence:\*\* End-to-end tests cover acceptance criteria\./
  );
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
  assert.doesNotMatch(reviewMarkdown, /This content has drifted\./);
  assert.doesNotMatch(reviewMarkdown, /This replaces the canonical content\./);
});

test("normalizeReviewArtifacts rewrites drifted traceability using canonical markdown", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "Reviewer note: retain this intro.",
      "",
      "<details><summary>Traceability: Acceptance Criteria</summary>",
      "",
      "- Acceptance Criterion: \"Acceptance criteria are covered by automated tests.\" — satisfied.",
      "  - Evidence: End-to-end tests cover acceptance criteria.",
      "",
      "</details>",
      "",
      "Methodology used: default."
    ].join("\n")
  );

  const { reviewMarkdown } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  const normalizedOnDisk = fs.readFileSync(reviewMdPath, "utf8").trim();

  assert.equal(reviewMarkdown, normalizedOnDisk);
  assert.match(reviewMarkdown, /Reviewer note: retain this intro\./);
  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
  assert.match(reviewMarkdown, /#### Acceptance Criteria \(✅ 1\)/);
  assert.match(
    reviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: Acceptance criteria are covered by automated tests\./
  );
  assert.match(
    reviewMarkdown,
    /  - \*\*Evidence:\*\* End-to-end tests cover acceptance criteria\./
  );
  assert.doesNotMatch(
    reviewMarkdown,
    /- Acceptance Criterion: "Acceptance criteria are covered by automated tests\."/
  );
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
});

test("normalizeReviewArtifacts replaces one-line details traceability blocks instead of keeping stale content", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "Reviewer note: retain this intro.",
      "",
      "<details><summary>Traceability: Acceptance Criteria</summary>",
      "- Acceptance Criterion: \"Acceptance criteria are covered by automated tests.\" — satisfied.",
      "  - Evidence: Drifted evidence that should be removed.",
      "</details>",
      "",
      "Methodology used: default."
    ].join("\n")
  );

  const { reviewMarkdown } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
  assert.match(
    reviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: Acceptance criteria are covered by automated tests\./
  );
  assert.doesNotMatch(reviewMarkdown, /Drifted evidence that should be removed\./);
  assert.doesNotMatch(reviewMarkdown, /- Acceptance Criterion:/);
  assert.doesNotMatch(reviewMarkdown, /Methodology used: default\./);
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
});

test("normalizeReviewArtifacts does not treat Traceability Notes as the traceability section", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "## Traceability Notes",
      "Keep this section unchanged.",
      "",
      "Methodology used: default."
    ].join("\n")
  );

  const { reviewMarkdown } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.match(reviewMarkdown, /## Traceability Notes/);
  assert.match(reviewMarkdown, /Keep this section unchanged\./);
  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
});

test("normalizeReviewArtifacts replaces prose and subheading traceability content until the next section", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "Reviewer note: retain this intro.",
      "",
      "## 🧭 Traceability",
      "",
      "This prose summary is drifted.",
      "",
      "### Acceptance Criteria",
      "",
      "- Acceptance Criterion: \"Acceptance criteria are covered by automated tests.\" — satisfied.",
      "  - Evidence: Drifted evidence that should be removed.",
      "",
      "## Methodology",
      "Methodology used: default."
    ].join("\n")
  );

  const { reviewMarkdown } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.match(reviewMarkdown, /Reviewer note: retain this intro\./);
  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
  assert.match(reviewMarkdown, /## Methodology/);
  assert.match(reviewMarkdown, /Methodology used: default\./);
  assert.doesNotMatch(reviewMarkdown, /This prose summary is drifted\./);
  assert.doesNotMatch(reviewMarkdown, /(^|\n)###(?!#) Acceptance Criteria/);
  assert.doesNotMatch(reviewMarkdown, /Drifted evidence that should be removed\./);
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
});

test("normalizeReviewArtifacts discards unheaded prose after the replaced traceability section", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "<details><summary>Traceability: Acceptance Criteria</summary>",
      "",
      "- Acceptance Criterion: \"Acceptance criteria are covered by automated tests.\" — satisfied.",
      "  - Evidence: Drifted evidence that should be removed.",
      "",
      "</details>",
      "",
      "Methodology used: default.",
      "Closing reviewer note."
    ].join("\n")
  );

  const { reviewMarkdown } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.doesNotMatch(reviewMarkdown, /Methodology used: default\./);
  assert.doesNotMatch(reviewMarkdown, /Closing reviewer note\./);
  assert.doesNotMatch(reviewMarkdown, /Drifted evidence that should be removed\./);
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
});

test("loadValidatedReviewArtifacts appends canonical traceability when missing", () => {
  const artifactsPath = createArtifacts();
  const reviewMdPath = path.join(artifactsPath, "review.md");

  fs.writeFileSync(
    reviewMdPath,
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "Methodology used: default."
    ].join("\n")
  );

  const { reviewMarkdown } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.match(reviewMarkdown, /Methodology used: default\./);
  assert.match(reviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(reviewMarkdown, /## 🧭 Traceability/);
  assert.match(reviewMarkdown, /#### Acceptance Criteria \(✅ 1\)/);
  assert.doesNotMatch(reviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(reviewMarkdown, /- Status:/);
});

test("renderCanonicalTraceabilityMarkdown lists status counts in severity order", () => {
  const markdown = renderCanonicalTraceabilityMarkdown([
    {
      type: "acceptance_criterion",
      requirement: "CI covers the negative path.",
      status: "not_satisfied",
      evidence: ["ci / test: negative path fails."]
    },
    {
      type: "acceptance_criterion",
      requirement: "Manual QA verified positive path.",
      status: "partially_satisfied",
      evidence: ["Manual QA covers positive path; negative path missing."]
    },
    {
      type: "acceptance_criterion",
      requirement: "Automated regression coverage is in place.",
      status: "satisfied",
      evidence: ["Unit tests cover user flows."]
    },
    {
      type: "acceptance_criterion",
      requirement: "Documentation update was not required.",
      status: "not_applicable",
      evidence: ["No user-facing docs impacted."]
    },
    {
      type: "acceptance_criterion",
      requirement: "Linting checks run on CI.",
      status: "satisfied",
      evidence: ["ci / lint: success"]
    }
  ]);

  assert.match(markdown, /<summary>🧭 Traceability<\/summary>/);
  assert.match(markdown, /#### Acceptance Criteria \(❌ 1, ⚠️ 1, ✅ 2, ⬜ 1\)/);
  assert.match(markdown, /- ❌ \*\*Not satisfied\*\*: CI covers the negative path\./);
  assert.match(markdown, /- ⚠️ \*\*Partially satisfied\*\*: Manual QA verified positive path\./);
  assert.match(markdown, /- ✅ \*\*Satisfied\*\*: Automated regression coverage is in place\./);
  assert.match(markdown, /- ⬜ \*\*Not applicable\*\*: Documentation update was not required\./);
});

test("loadValidatedReviewArtifacts preserves evidence arrays", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: ["tests/e2e.test.mjs", "ci / test: success"]
        }
      ]
    }
  });
  const { review } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.deepEqual(review.requirement_checks[0].evidence, [
    "tests/e2e.test.mjs",
    "ci / test: success"
  ]);
});

test("loadValidatedReviewArtifacts normalizes legacy evidence strings to arrays", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: "tests/e2e.test.mjs"
        }
      ]
    }
  });
  const { review } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology: "default"
  });

  assert.deepEqual(review.requirement_checks[0].evidence, ["tests/e2e.test.mjs"]);
});

test("loadValidatedReviewArtifacts rejects empty evidence arrays", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: []
        }
      ]
    }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "default"
      }),
    /requirement_checks\[0\]\.evidence must be a non-empty array/
  );
});

test("loadValidatedReviewArtifacts rejects empty evidence items", () => {
  const artifactsPath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: ["tests/e2e.test.mjs", " "]
        }
      ]
    }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath,
        requestedMethodology: "default"
      }),
    /requirement_checks\[0\]\.evidence\[1\] must not be empty/
  );
});

test("loadValidatedReviewArtifacts rejects invalid evidence types", () => {
  const nullEvidencePath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: null
        }
      ]
    }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath: nullEvidencePath,
        requestedMethodology: "default"
      }),
    /requirement_checks\[0\]\.evidence must be a string or an array of strings/
  );

  const objectEvidencePath = createArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are covered by automated tests.",
          status: "satisfied",
          evidence: { file: "tests/e2e.test.mjs" }
        }
      ]
    }
  });

  assert.throws(
    () =>
      loadValidatedReviewArtifacts({
        artifactsPath: objectEvidencePath,
        requestedMethodology: "default"
      }),
    /requirement_checks\[0\]\.evidence must be a string or an array of strings/
  );
});
