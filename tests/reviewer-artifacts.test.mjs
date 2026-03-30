import test from "node:test";
import assert from "node:assert/strict";
import { validateReviewerArtifactPayload } from "../scripts/lib/reviewer-artifacts.mjs";

function baseArtifact(overrides = {}) {
  return {
    reviewer: "traceability",
    summary: "No blocking issues found.",
    status: "completed",
    findings: [],
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Spec remains traceable.",
        status: "satisfied",
        evidence: ["tests/build-stage-prompt.test.mjs covers prompt content."]
      }
    ],
    uncertainties: [],
    ...overrides
  };
}

test("validateReviewerArtifactPayload accepts a valid reviewer artifact", () => {
  const artifact = validateReviewerArtifactPayload(baseArtifact(), {
    reviewerName: "traceability"
  });

  assert.equal(artifact.reviewer, "traceability");
});

test("validateReviewerArtifactPayload rejects findings without evidence", () => {
  assert.throws(
    () =>
      validateReviewerArtifactPayload(
        baseArtifact({
          findings: [
            {
              level: "blocking",
              title: "Missing proof",
              details: "Details",
              scope: "tests/example.test.mjs",
              recommendation: "Add evidence",
              evidence: []
            }
          ]
        }),
        {
          reviewerName: "traceability"
        }
      ),
    /evidence/
  );
});

test("validateReviewerArtifactPayload requires checklist for workflow safety", () => {
  assert.throws(
    () =>
      validateReviewerArtifactPayload(
        {
          ...baseArtifact({ reviewer: "workflow_safety" }),
          requirement_checks: []
        },
        {
          reviewerName: "workflow_safety",
          requiresChecklist: true
        }
      ),
    /checklist/
  );
});
