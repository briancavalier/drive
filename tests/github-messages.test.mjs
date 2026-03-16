import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderIntakeRejectedComment,
  renderPlanReadyIssueComment,
  renderRequestChangesReviewBody,
  renderReviewPassComment
} from "../scripts/lib/github-messages.mjs";
import { extractPrMetadata, renderPrBody } from "../scripts/lib/pr-metadata.mjs";

function makeOverrides(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-messages-"));

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }

  return dir;
}

function prBodyInput() {
  return {
    issueNumber: 7,
    branch: "factory/7-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/7",
    metadata: {
      issueNumber: 7,
      artifactsPath: ".factory/runs/7",
      status: "plan_ready",
      repairAttempts: 1,
      maxRepairAttempts: 3
    }
  };
}

test("renderPrBody uses valid override templates and preserves parseable metadata", () => {
  const overridesRoot = makeOverrides({
    "pr-body.md": [
      "# Custom Factory Run",
      "",
      "Issue: #{{ISSUE_NUMBER}}",
      "",
      "{{ARTIFACTS_SECTION}}",
      "",
      "{{STATUS_SECTION}}"
    ].join("\n")
  });

  const body = renderPrBody(prBodyInput(), { overridesRoot });
  const metadata = extractPrMetadata(body);

  assert.match(body, /# Custom Factory Run/);
  assert.equal(metadata.issueNumber, 7);
  assert.equal(metadata.status, "plan_ready");
});

test("renderPrBody prefixes mapped stage and CI statuses with emoji", () => {
  const input = prBodyInput();
  const body = renderPrBody(
    {
      ...input,
      metadata: {
        ...input.metadata,
        status: "implementing"
      },
      ciStatus: "success"
    },
    {}
  );

  assert.match(body, /- Stage: 🏗️ implementing/);
  assert.match(body, /- CI: ✅ success/);
});

test("renderPrBody leaves unmapped stage values without emoji", () => {
  const input = prBodyInput();
  const body = renderPrBody(
    {
      ...input,
      metadata: {
        ...input.metadata,
        status: "reviewing"
      }
    },
    {}
  );

  assert.match(body, /- Stage: reviewing/);
});

test("renderPrBody operator notes include start and pause cues", () => {
  const body = renderPrBody(prBodyInput());

  assert.match(
    body,
    /- ▶️ Apply `factory:implement` to start coding after plan review\./
  );
  assert.match(
    body,
    /- ⏸️ Apply `factory:paused` to pause autonomous work\./
  );
  assert.match(
    body,
    /- ▶️ Remove `factory:paused` and re-apply `factory:implement` to resume\./
  );
});

test("renderPrBody falls back to default template when required tokens are missing", () => {
  const overridesRoot = makeOverrides({
    "pr-body.md": "# Broken PR Body\n\n{{ARTIFACTS_SECTION}}"
  });
  const warnings = [];
  const body = renderPrBody(prBodyInput(), {
    overridesRoot,
    logger: {
      warn: (message) => warnings.push(message)
    }
  });

  assert.match(body, /# Factory Run/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing required tokens: STATUS_SECTION/);
});

test("renderPlanReadyIssueComment falls back to default when override contains unknown tokens", () => {
  const overridesRoot = makeOverrides({
    "plan-ready-issue-comment.md": "PR #{{PR_NUMBER}} {{UNKNOWN_TOKEN}}"
  });
  const warnings = [];
  const message = renderPlanReadyIssueComment(
    { prNumber: 42, implementLabel: "factory:implement" },
    {
      overridesRoot,
      logger: {
        warn: (value) => warnings.push(value)
      }
    }
  );

  assert.equal(
    message,
    "👀 Factory planning is ready in PR #42. Review the draft PR and apply `factory:implement` to start coding."
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unknown tokens: UNKNOWN_TOKEN/);
});

test("renderPlanReadyIssueComment uses built-in default when override file is absent", () => {
  const overridesRoot = makeOverrides();
  const message = renderPlanReadyIssueComment(
    { prNumber: 18, implementLabel: "factory:implement" },
    { overridesRoot }
  );

  assert.equal(
    message,
    "👀 Factory planning is ready in PR #18. Review the draft PR and apply `factory:implement` to start coding."
  );
});

test("renderIntakeRejectedComment uses valid override templates", () => {
  const overridesRoot = makeOverrides({
    "intake-rejected-comment.md": "Missing sections: {{MISSING_FIELDS}}"
  });
  const message = renderIntakeRejectedComment(
    { missingFields: "Goals, Risk" },
    { overridesRoot }
  );

  assert.equal(message, "Missing sections: Goals, Risk");
});

test("renderReviewPassComment keeps the no-findings default copy", () => {
  const message = renderReviewPassComment({
    methodology: "default",
    summary: "All checks passed.",
    blockingFindingsCount: 0,
    artifactsPath: ".factory/runs/9"
  });

  assert.match(message, /^✅ Autonomous review completed/);
  assert.match(message, /No blocking findings recorded\./);
  assert.match(message, /review\.md/);
});

test("renderRequestChangesReviewBody keeps repair-critical content above collapsible details", () => {
  const body = renderRequestChangesReviewBody({
    methodology: "default",
    summary: "Needs more tests.",
    findings: [
      {
        level: "blocking",
        title: "Missing tests",
        details: "Negative-path coverage is missing.",
        scope: "tests/new-feature.test.js",
        recommendation: "Add negative-path coverage."
      }
    ],
    requirementChecks: [
      {
        type: "acceptance_criterion",
        requirement: "Acceptance criteria are fully covered by tests.",
        status: "not_satisfied",
        evidence: "Negative-path coverage is missing."
      }
    ],
    reviewMarkdown: "# Autonomous Review\n\nLong-form review content",
    artifactsPath: ".factory/runs/11"
  });

  assert.match(body, /Blocking findings:/);
  assert.match(body, /Unmet requirement checks:/);
  assert.match(body, /Artifacts:/);
  assert.match(body, /<details>/);
  assert.ok(body.indexOf("Blocking findings:") < body.indexOf("<details>"));
});

test("renderRequestChangesReviewBody uses new override tokens", () => {
  const overridesRoot = makeOverrides({
    "review-request-changes.md": [
      "Summary: {{REVIEW_SUMMARY}}",
      "",
      "{{BLOCKING_FINDINGS_SUMMARY}}",
      "",
      "{{TRACEABILITY_DETAILS}}"
    ].join("\n")
  });
  const body = renderRequestChangesReviewBody({
    methodology: "default",
    summary: "Needs more tests.",
    findings: [
      {
        level: "blocking",
        title: "Missing tests",
        details: "Negative-path coverage is missing.",
        scope: "tests/new-feature.test.js",
        recommendation: "Add negative-path coverage."
      }
    ],
    requirementChecks: [
      {
        type: "plan_deliverable",
        requirement: "Add tests for changed behavior.",
        status: "not_satisfied",
        evidence: "No new tests were added."
      }
    ],
    reviewMarkdown: "# Autonomous Review",
    artifactsPath: ".factory/runs/11"
  }, {
    overridesRoot
  });

  assert.match(body, /Summary: Needs more tests\./);
  assert.match(body, /Missing tests/);
  assert.match(body, /<summary>Traceability<\/summary>/);
});

test("renderRequestChangesReviewBody preserves legacy REVIEW_MARKDOWN overrides", () => {
  const overridesRoot = makeOverrides({
    "review-request-changes.md": [
      "Requested changes via {{REVIEW_METHOD}}",
      "",
      "{{REVIEW_MARKDOWN}}"
    ].join("\n")
  });
  const body = renderRequestChangesReviewBody(
    {
      methodology: "default",
      summary: "Needs more tests.",
      findings: [],
      requirementChecks: [],
      reviewMarkdown: "A".repeat(120),
      artifactsPath: ".factory/runs/11",
      maxBodyChars: 80
    },
    { overridesRoot }
  );

  assert.match(body, /Requested changes via default/);
  assert.match(body, /\*\(Review truncated\. See `.factory\/runs\/11\/review\.md` for the full report\.\)\*/);
});

test("renderRequestChangesReviewBody truncates verbose tail while keeping summary first", () => {
  const body = renderRequestChangesReviewBody({
    methodology: "default",
    summary: "Needs more tests.",
    findings: [
      {
        level: "blocking",
        title: "Missing tests",
        details: "Negative-path coverage is missing.",
        scope: "tests/new-feature.test.js",
        recommendation: "Add negative-path coverage."
      }
    ],
    requirementChecks: [
      {
        type: "acceptance_criterion",
        requirement: "Acceptance criteria are fully covered by tests.",
        status: "not_satisfied",
        evidence: "Negative-path coverage is missing."
      }
    ],
    reviewMarkdown: "X".repeat(61000),
    artifactsPath: ".factory/runs/11",
    maxBodyChars: 500
  });

  assert.match(body, /Autonomous review decision: REQUEST_CHANGES/);
  assert.match(body, /Blocking findings:/);
  assert.match(body, /Unmet requirement checks:/);
  assert.match(body, /Review truncated\./);
  assert.ok(body.indexOf("Blocking findings:") < body.indexOf("<details>"));
});
