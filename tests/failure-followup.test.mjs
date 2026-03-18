import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONABLE_MESSAGE_PATTERNS,
  FOLLOWUP_CATEGORIES,
  buildFailureSignature,
  buildFollowupCommentSection,
  buildFollowupIssue,
  classifyFollowup,
  findOpenFollowup
} from "../scripts/lib/failure-followup.mjs";

test("classifyFollowup returns actionable for high-confidence control plane advisory", () => {
  const result = classifyFollowup({
    failureType: "content_or_logic",
    phase: "stage",
    action: "implement",
    failureMessage: "control plane busted",
    advisory: {
      scope: "control_plane",
      confidence: "high",
      diagnosis: "Control plane failure detected"
    }
  });

  assert.equal(result.actionable, true);
  assert.equal(result.category, FOLLOWUP_CATEGORIES.controlPlane);
});

test("classifyFollowup skips ineligible failure types", () => {
  const result = classifyFollowup({
    failureType: "transient_infra",
    phase: "stage",
    action: "implement",
    failureMessage: "network blip",
    advisory: null
  });

  assert.equal(result.actionable, false);
  assert.equal(result.reason, "ineligible_failure_type");
});

test("classifyFollowup uses pattern allowlist when no advisory", () => {
  const pattern = ACTIONABLE_MESSAGE_PATTERNS.find((entry) => entry.id === "missing_review_json");
  assert.ok(pattern, "expected missing_review_json pattern");

  const result = classifyFollowup({
    failureType: "content_or_logic",
    phase: "stage",
    action: "implement",
    failureMessage: "Error: missing review.json artifact",
    advisory: null
  });

  assert.equal(result.actionable, true);
  assert.equal(result.category, pattern.category);
});

test("buildFailureSignature normalizes input fields", () => {
  const signatureA = buildFailureSignature({
    category: "control_plane",
    failureType: "content_or_logic",
    phase: "Stage",
    failureMessage: "Missing REVIEW.json",
    advisory: {
      scope: "CONTROL_PLANE",
      diagnosis: "Missing review.json artifact"
    }
  });

  const signatureB = buildFailureSignature({
    category: "CONTROL_PLANE",
    failureType: "content_or_logic",
    phase: "stage",
    failureMessage: " missing   review.json  ",
    advisory: {
      scope: "control_plane",
      diagnosis: "missing review.json artifact"
    }
  });

  assert.equal(signatureA, signatureB);
});

test("buildFollowupIssue composes template with metadata block", () => {
  const { title, body } = buildFollowupIssue({
    prNumber: 123,
    runUrl: "https://github.com/example/repo/actions/runs/456",
    branch: "factory/branch",
    artifactsPath: ".factory/runs/52",
    failureType: "configuration",
    failureMessage: "Missing FACTORY_TOKEN",
    advisory: {
      scope: "control_plane",
      confidence: "high",
      diagnosis: "Missing FACTORY_GITHUB_TOKEN environment variable"
    },
    category: FOLLOWUP_CATEGORIES.configuration,
    signature: "deadbeef",
    ciRunId: "789",
    repositoryUrl: "https://github.com/example/repo"
  });

  assert.ok(title.startsWith("[Factory] Follow-up: "));
  assert.match(body, /## Problem statement/);
  assert.match(body, /Blocked PR: #123/);
  assert.match(body, /factory-followup-meta/);
  assert.match(body, /"signature":"deadbeef"/);
});

test("findOpenFollowup returns issue containing signature marker", async () => {
  const issue = await findOpenFollowup({
    signature: "abc123",
    searchIssues: async () => ({
      items: [
        { number: 1, body: "<!-- factory-followup-meta: {\"signature\":\"zzz\"} -->" },
        { number: 2, body: "<!-- factory-followup-meta: {\"signature\":\"abc123\"} -->" }
      ]
    })
  });

  assert.equal(issue.number, 2);
});

test("findOpenFollowup searches using full metadata marker", async () => {
  let capturedQuery = "";
  await findOpenFollowup({
    signature: "abc123",
    searchIssues: async ({ query }) => {
      capturedQuery = query;
      return { items: [] };
    }
  });

  assert.equal(
    capturedQuery,
    'state:open in:body "<!-- factory-followup-meta: {\\"signature\\":\\"abc123\\"} -->"'
  );
});

test("buildFollowupCommentSection distinguishes created vs existing", () => {
  const created = buildFollowupCommentSection({
    issueNumber: 42,
    signature: "abc",
    created: true
  });

  const existing = buildFollowupCommentSection({
    issueNumber: 42,
    signature: "abc",
    created: false
  });

  assert.match(created, /follow-up opened as #42/i);
  assert.match(existing, /already tracked as #42/i);
});
