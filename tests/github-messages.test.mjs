import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewConversationBody,
  renderIntakeRejectedComment,
  renderPlanReadyIssueComment,
  MAX_REVIEW_BODY_CHARS
} from "../scripts/lib/github-messages.mjs";
import {
  defaultFailureIntervention,
  extractPrMetadata,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";

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
      maxRepairAttempts: 3,
      costEstimateUsd: 0.2234,
      costEstimateBand: "medium",
      costEstimateEmoji: "🟡",
      lastEstimatedStage: "plan",
      lastEstimatedModel: "gpt-5-codex",
      lastStageCostEstimateUsd: 0.2234
    }
  };
}

test("renderPrBody uses valid override templates and preserves parseable metadata", () => {
  const overridesRoot = makeOverrides({
    "pr-body.md": [
      "# Custom Factory Run",
      "",
      "{{DASHBOARD_SECTION}}",
      "",
      "{{SUGGESTED_ACTIONS_SECTION}}",
      "",
      "Issue: #{{ISSUE_NUMBER}}",
      "",
      "{{ARTIFACTS_SECTION}}",
      "",
      "{{OPERATOR_NOTES_SECTION}}"
    ].join("\n")
  });

  const body = renderPrBody(prBodyInput(), { overridesRoot });
  const metadata = extractPrMetadata(body);

  assert.match(body, /# Custom Factory Run/);
  assert.equal(metadata.issueNumber, 7);
  assert.equal(metadata.status, "plan_ready");
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

  assert.match(body, /## Factory Dashboard/);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /missing required tokens: (DASHBOARD_SECTION|SUGGESTED_ACTIONS_SECTION|ARTIFACTS_SECTION|OPERATOR_NOTES_SECTION)/
  );
});

test("renderPrBody renders plan_ready dashboard layout", () => {
  const body = renderPrBody(prBodyInput());
  const lines = body.split("\n");
  const summaryLine = lines.find((line) => line.startsWith("**👀"));
  const ciLine = lines.find((line) => line.startsWith("CI:"));
  const costLine = lines.find((line) => line.startsWith("Cost:"));
  const openLine = lines.find((line) => line.startsWith("**Open:**"));

  assert.ok(lines.includes("## Factory Dashboard"));
  assert.equal(summaryLine, "**👀 Plan ready** · 🧑 Human action required");
  assert.equal(ciLine, "CI: ⏳ Pending · Repairs: `1 / 3`");
  assert.equal(costLine, "Cost: 🟡 $0.223 total · Estimate: $0.223 via gpt-5-codex");
  assert.equal(
    openLine,
    "**Open:** [Review summary](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/review.md) · [Review JSON](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/review.json)"
  );

  const actionsIndex = lines.indexOf("**Suggested next actions**");
  assert.ok(actionsIndex >= 0, "expected suggested actions heading");

  const suggestions = [];
  for (let i = actionsIndex + 1; i < lines.length; i += 1) {
    const value = lines[i];
    if (!value.trim()) {
      break;
    }
    suggestions.push(value);
  }

  assert.deepEqual(suggestions, [
    "- `/factory implement` — Start implementation after plan approval.",
    "- `/factory pause` — Pause automation to hand off or intervene."
  ]);

  const planLine = lines.find((line) => line.startsWith("**Plan**"));
  const buildLine = lines.find((line) => line.startsWith("**Build**"));
  const reviewLine = lines.find((line) => line.startsWith("**Review**"));

  assert.match(
    planLine,
    /\*\*Plan\*\* \[Approved issue\].*\[Spec\].*\[Plan\].*\[Acceptance tests\]/
  );
  assert.match(
    buildLine,
    /\*\*Build\*\* \[Repair log\].*\[Cost summary\]/
  );
  assert.match(
    reviewLine,
    /\*\*Review\*\* \[Review summary\].*\[Review JSON\]/
  );

  const operatorNotesIndex = lines.indexOf("## Operator Notes");
  assert.ok(operatorNotesIndex >= 0, "expected operator notes heading");
  assert.deepEqual(
    lines.slice(operatorNotesIndex + 1, operatorNotesIndex + 4),
    [
      "- Slash commands control the run.",
      "- Manual label fallbacks remain available.",
      "- Cost estimates are advisory heuristics."
    ]
  );

  assert.ok(lines.includes("Closes #7"));
});

test("renderPrBody renders blocked summary with stage from blockedAction", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    issueNumber: 88,
    branch: "factory/88-test",
    metadata: {
      ...prBodyInput().metadata,
      issueNumber: 88,
      artifactsPath: ".factory/runs/88",
      status: "blocked",
      blockedAction: "review",
      intervention: defaultFailureIntervention({
        payload: { failureType: "stage_setup" }
      }),
      repairAttempts: 1,
      maxRepairAttempts: 3,
      lastRunUrl: "https://github.com/example/repo/actions/runs/123",
      costEstimateUsd: 12.5,
      costEstimateEmoji: "💡",
      lastStageCostEstimateUsd: 4.5,
      lastEstimatedModel: "gpt-5-codex"
    }
  });
  const lines = body.split("\n");

  assert.equal(
    lines.find((line) => line.startsWith("**⚠️")),
    "**⚠️ Blocked** · 🔍 `review` · 🧑 Human action required"
  );
  assert.equal(
    lines.find((line) => line.startsWith("CI:")),
    "CI: ⏳ Pending · Repairs: `1 / 3`"
  );
  assert.equal(
    lines.find((line) => line.startsWith("Cost:")),
    "Cost: 💡 $12.50 total · Estimate: $4.50 via gpt-5-codex"
  );
  assert.equal(
    lines.find((line) => line.startsWith("**Open:**")),
    "**Open:** [Latest run](https://github.com/example/repo/actions/runs/123) · [Review summary](https://github.com/example/repo/blob/factory/88-test/.factory/runs/88/review.md) · [Review JSON](https://github.com/example/repo/blob/factory/88-test/.factory/runs/88/review.json)"
  );

  const actionsIndex = lines.indexOf("**Suggested next actions**");
  const suggestions = [];
  for (let i = actionsIndex + 1; i < lines.length; i += 1) {
    const value = lines[i];
    if (!value.trim()) {
      break;
    }
    suggestions.push(value);
  }

  assert.deepEqual(suggestions, [
    "- `/factory resume` — Resume automation from the current stage.",
    "- `/factory reset` — Reset to plan-ready before restarting.",
    "- `/factory pause` — Pause automation to hand off or intervene."
  ]);
});

test("renderPrBody shows last completed stage for paused status", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    branch: "factory/99-paused",
    metadata: {
      ...prBodyInput().metadata,
      status: "paused",
      paused: true,
      lastCompletedStage: "implement",
      repairAttempts: 2,
      maxRepairAttempts: 4
    }
  });
  const lines = body.split("\n");
  const summaryLine = lines.find((line) => line.startsWith("**⏸️"));

  assert.equal(summaryLine, "**⏸️ Paused** · 🏗️ `implement` · ⏸️ Automation paused");
});

test("renderPrBody omits redundant stage segment for implementing status", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    branch: "factory/42-test",
    ciStatus: "success",
    metadata: {
      ...prBodyInput().metadata,
      artifactsPath: ".factory/runs/42",
      status: "implementing",
      repairAttempts: 0,
      lastRunUrl: "https://github.com/example/repo/actions/runs/456",
      costEstimateUsd: 0,
      costEstimateEmoji: "",
      lastStageCostEstimateUsd: 0,
      lastEstimatedModel: ""
    }
  });
  const lines = body.split("\n");
  const summaryLine = lines.find((line) => line.startsWith("**🏗️"));
  const segments = summaryLine.split(" · ");

  assert.equal(summaryLine, "**🏗️ Implementing** · 🤖 Automation running");
  assert.equal(segments.length, 2);
  assert.equal(
    lines.find((line) => line.startsWith("CI:")),
    "CI: ✅ Success · Repairs: `0 / 3`"
  );

  const actionsIndex = lines.indexOf("**Suggested next actions**");
  const suggestions = [];
  for (let i = actionsIndex + 1; i < lines.length; i += 1) {
    const value = lines[i];
    if (!value.trim()) {
      break;
    }
    suggestions.push(value);
  }

  assert.deepEqual(suggestions, [
    "- `/factory pause` — Pause automation to hand off or intervene."
  ]);
});

test("renderPrBody omits redundant stage segment for ready_for_review status", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    branch: "factory/100-ready",
    metadata: {
      ...prBodyInput().metadata,
      status: "ready_for_review"
    }
  });
  const lines = body.split("\n");
  const summaryLine = lines.find((line) => line.startsWith("**✅"));
  const segments = summaryLine.split(" · ");

  assert.equal(summaryLine, "**✅ Ready for review** · 🧑‍⚖️ Human review required");
  assert.equal(segments.length, 2);
});

test("renderPlanReadyIssueComment falls back to default when override contains unknown tokens", () => {
  const overridesRoot = makeOverrides({
    "plan-ready-issue-comment.md": "PR #{{PR_NUMBER}} {{UNKNOWN_TOKEN}}"
  });
  const warnings = [];
  const message = renderPlanReadyIssueComment(
    { prNumber: 42, implementCommand: "/factory implement" },
    {
      overridesRoot,
      logger: {
        warn: (value) => warnings.push(value)
      }
    }
  );

  assert.equal(
    message,
    "👀 Factory planning is ready in PR #42. Review the draft PR and comment `/factory implement` to start coding."
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unknown tokens: UNKNOWN_TOKEN/);
});

test("renderPlanReadyIssueComment uses built-in default when override file is absent", () => {
  const overridesRoot = makeOverrides();
  const message = renderPlanReadyIssueComment(
    { prNumber: 18, implementCommand: "/factory implement" },
    { overridesRoot }
  );

  assert.equal(
    message,
    "👀 Factory planning is ready in PR #18. Review the draft PR and comment `/factory implement` to start coding."
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

function sampleReviewMarkdown({ decision = "pass" } = {}) {
  const decisionEmoji = decision === "pass" ? "✅" : "❌";
  const decisionLabel = decision === "pass" ? "PASS" : "REQUEST_CHANGES";

  return [
    `# ${decisionEmoji} Autonomous Review Decision: ${decisionLabel}`,
    "",
    "## 📝 Summary",
    "Everything looks good.",
    "",
    "## 🧭 Traceability",
    "",
    "<details>",
    "<summary>🧭 Traceability: Acceptance Criteria (✅ 1)</summary>",
    "",
    "- ✅ **Satisfied**: Ensure quality",
    "  - **Evidence:** Tests cover expectations.",
    "",
    "</details>"
  ].join("\n");
}

test("buildReviewConversationBody posts full review plus footer within limit", () => {
  const reviewMarkdown = sampleReviewMarkdown();
  const artifactsPath = ".factory/runs/11";
  const body = buildReviewConversationBody({
    reviewMarkdown,
    artifactsPath
  });

  const expectedFooter = "\n\n—\nArtifacts: `.factory/runs/11/review.md`";

  assert.equal(body, `${reviewMarkdown}${expectedFooter}`);
  assert.match(body, /✅ Autonomous Review Decision: PASS/);
  assert.match(body, /## 📝 Summary/);
  assert.match(body, /## 🧭 Traceability/);
});

test("buildReviewConversationBody retains traceability section when truncated", () => {
  const traceabilitySection = [
    "## 🧭 Traceability",
    "",
    "<details>",
    "<summary>🧭 Traceability: Acceptance Criteria (✅ 1)</summary>",
    "",
    "- ✅ **Satisfied**: Ensure quality",
    "  - **Evidence:** Tests cover expectations.",
    "",
    "</details>"
  ].join("\n");
  const longPreview = `# ❌ Autonomous Review Decision: REQUEST_CHANGES\n\n## 📝 Summary\n${"A".repeat(1000)}\n\n${traceabilitySection}\n\n${"Z".repeat(5000)}`;
  const body = buildReviewConversationBody({
    reviewMarkdown: longPreview,
    artifactsPath: ".factory/runs/44",
    maxBodyChars: 900
  });

  assert.match(body, /❌ Autonomous Review Decision: REQUEST_CHANGES/);
  assert.match(body, /## 🧭 Traceability/);
  assert.match(body, /Review truncated after traceability details/);
  assert.match(body, /Artifacts: `.factory\/runs\/44\/review\.md`/);
  assert.ok(body.length <= 900);
});

test("buildReviewConversationBody falls back to raw slice when traceability still too long", () => {
  const reviewMarkdown = [
    "# ✅ Autonomous Review Decision: PASS",
    "",
    "Intro",
    "",
    "## 📝 Summary",
    "",
    "Line 1",
    "Line 2",
    "Line 3",
    "",
    `${"Extended context ".repeat(20)}`
  ].join("\n");
  const body = buildReviewConversationBody({
    reviewMarkdown,
    artifactsPath: ".factory/runs/55",
    maxBodyChars: 220
  });

  assert.match(body, /Review truncated after traceability details/);
  assert.match(body, /Artifacts: `.factory\/runs\/55\/review\.md`/);
  assert.match(body, /# ✅ Autonomous Review Decision: PASS/);
  assert.match(body, /## 📝 Summary/);
  assert.ok(body.length <= 220);
});
