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
      "Issue: #{{ISSUE_NUMBER}}",
      "",
      "{{DASHBOARD_SECTION}}",
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

  assert.match(body, /# Factory Run/);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /missing required tokens: (DASHBOARD_SECTION, OPERATOR_NOTES_SECTION|OPERATOR_NOTES_SECTION, DASHBOARD_SECTION)/
  );
});

test("renderPrBody renders dashboard layout and operator notes", () => {
  const body = renderPrBody(prBodyInput());
  const lines = body.split("\n");
  const dashboardIndex = lines.indexOf("## Factory Dashboard");

  assert.ok(dashboardIndex >= 0, "expected dashboard heading");
  assert.equal(lines[dashboardIndex + 1], "| | |");
  assert.equal(lines[dashboardIndex + 2], "| --- | --- |");

  const expectedRows = [
    ["State", "👀 Plan ready"],
    ["Owner", "Operator"],
    ["Stage", "`plan`"],
    ["CI", "⏳ pending"],
    ["Repairs", "1/3"],
    ["Cost", "🟡 $0.223 total (medium)"],
    ["Estimate", "$0.223 via gpt-5-codex"],
    ["Next", "Review the plan artifacts, then start implementation if they look good."]
  ];

  expectedRows.forEach(([label, value], index) => {
    assert.equal(
      lines[dashboardIndex + 3 + index],
      `| **${label}** | ${value} |`,
      `expected dashboard row for ${label}`
    );
  });

  const openLine = lines[dashboardIndex + 3 + expectedRows.length];
  assert.match(openLine, /\*\*Open:\*\* \[🧾 review\.md\]\(https:\/\/github\.com\/example\/repo\/blob\/factory\/7-sample\/\.factory\/runs\/7\/review\.md\)/);
  assert.match(openLine, /\[🧾 review\.json\]\(https:\/\/github\.com\/example\/repo\/blob\/factory\/7-sample\/\.factory\/runs\/7\/review\.json\)/);

  const actionsLine = lines[dashboardIndex + 4 + expectedRows.length];
  assert.equal(
    actionsLine,
    "**Actions:** [▶ Comment /factory implement](https://github.com/example/repo/pull/7) *(state change)* · [⏸ Comment /factory pause](https://github.com/example/repo/pull/7) *(state change)*"
  );

  const artifactsIndex = lines.indexOf("## Artifacts");
  assert.ok(artifactsIndex > dashboardIndex, "expected artifacts section");
  assert.equal(lines[artifactsIndex + 1], "**Plan**");
  assert.equal(
    lines[artifactsIndex + 2],
    [
      "[approved-issue.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/approved-issue.md)",
      "[spec.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/spec.md)",
      "[plan.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/plan.md)",
      "[acceptance-tests.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/acceptance-tests.md)"
    ].join(" · ")
  );
  assert.equal(lines[artifactsIndex + 3], "**Execution**");
  assert.equal(
    lines[artifactsIndex + 4],
    [
      "[repair-log.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/repair-log.md)",
      "[cost-summary.json](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/cost-summary.json)"
    ].join(" · ")
  );
  assert.equal(lines[artifactsIndex + 5], "**Review**");
  assert.equal(
    lines[artifactsIndex + 6],
    [
      "[review.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/review.md)",
      "[review.json](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/review.json)"
    ].join(" · ")
  );

  assert.ok(
    lines.includes(
      "- Use the dashboard above for start, pause, retry, and reset actions."
    )
  );
  assert.ok(
    lines.includes(
      "- ▶️ Comment `/factory implement` to start coding after plan review."
    )
  );
  assert.ok(
    lines.includes("- ⏸️ Comment `/factory pause` to pause autonomous work.")
  );
  assert.ok(
    lines.includes(
      "- ▶️ Comment `/factory resume` to resume a paused run or a recoverable blocked run."
    )
  );
  assert.ok(
    lines.includes("- 🔁 Comment `/factory reset` to reset the PR back to plan-ready.")
  );
  assert.ok(
    lines.includes("- 💸 Cost values are advisory estimates, not billed usage.")
  );

  const successBody = renderPrBody({
    ...prBodyInput(),
    ciStatus: "success"
  });
  const successLines = successBody.split("\n");
  const successDashboardIndex = successLines.indexOf("## Factory Dashboard");
  assert.equal(successLines[successDashboardIndex + 6], "| **CI** | ✅ success |");
});

test("renderPrBody dashboard includes reason and state-changing actions for blocked status", () => {
  const blockedInput = prBodyInput();
  blockedInput.metadata = {
    ...blockedInput.metadata,
    status: "blocked",
    lastFailureType: "stage_noop",
    stageNoopAttempts: 2
  };
  const body = renderPrBody(blockedInput);
  const lines = body.split("\n");

  assert.ok(body.includes("## Factory Dashboard"));
  assert.ok(!body.includes("## Factory Control Panel"));
  assert.ok(!body.includes("## Status"));

  const stateRow = lines.find((line) => line.startsWith("| **State** |"));
  assert.match(
    stateRow || "",
    /⚠️ Blocked — Latest stage run produced no committed changes after repeated attempts\./
  );

  const actionsLine = lines.find((line) => line.startsWith("**Actions:**"));
  assert.ok(actionsLine?.includes("*(state change)*"), "expected state change badge");
  assert.match(actionsLine || "", /\/factory reset/);
  assert.match(actionsLine || "", /\/factory pause/);
});

test("renderPrBody wiring uses prNumber when provided for control panel actions", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    prNumber: 81
  });
  const startLine = body
    .split("\n")
    .find((line) => line.includes("▶ Comment /factory implement"));

  assert.ok(startLine, "expected implement action line");
  assert.match(startLine, /\/pull\/81/);
  assert.ok(!/\/pull\/7/.test(startLine));
});

test("renderPrBody falls back to raw CI status when emoji mapping is missing", () => {
  const body = renderPrBody({
    ...prBodyInput(),
    ciStatus: "flaky"
  });
  const ciRow = body.split("\n").find((line) => line.startsWith("| **CI** |"));

  assert.equal(ciRow, "| **CI** | flaky |");
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
