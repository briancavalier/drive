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
      "{{CONTROL_PANEL_SECTION}}",
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
    /missing required tokens: (CONTROL_PANEL_SECTION, STATUS_SECTION|STATUS_SECTION, CONTROL_PANEL_SECTION)/
  );
});

test("renderPrBody includes emoji-enhanced status lines and operator notes", () => {
  const body = renderPrBody(prBodyInput());
  const lines = body.split("\n");
  const stageLine = lines.find((line) => line.startsWith("- Stage:"));
  const ciLine = lines.find((line) => line.startsWith("- CI:"));
  const costLine = lines.find((line) => line.startsWith("- Estimated cost:"));
  const latestCostLine = lines.find((line) => line.startsWith("- Latest stage estimate:"));

  assert.equal(stageLine, "- Stage: 👀 plan_ready");
  assert.equal(ciLine, "- CI: ⏳ pending");
  assert.equal(costLine, "- Estimated cost: 🟡 $0.223 total (medium)");
  assert.equal(latestCostLine, "- Latest stage estimate: $0.223 using gpt-5-codex");
  assert.ok(
    lines.includes(
      "- [approved-issue.md](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/approved-issue.md)"
    )
  );
  assert.ok(
    lines.includes(
      "- Use the control panel above for start, pause, retry, and reset actions."
    )
  );
  assert.ok(
    lines.includes(
      "- Labels such as `factory:implement` and `factory:paused` remain available as manual fallbacks."
    )
  );
  assert.ok(
    lines.includes("- 💸 Cost values are advisory estimates, not billed usage.")
  );

  const successBody = renderPrBody(
    {
      ...prBodyInput(),
      ciStatus: "success"
    }
  );
  const successCiLine = successBody.split("\n").find((line) => line.startsWith("- CI:"));

  assert.equal(successCiLine, "- CI: ✅ success");
});

test("renderPrBody renders control panel for plan_ready status", () => {
  const body = renderPrBody(prBodyInput());
  const [, panelRest = ""] = body.split("## Factory Control Panel");
  const panelSection = panelRest.split("## Status")[0] || "";
  const panelLines = panelSection.trim().split("\n").map((line) => line.trim());

  assert.ok(panelSection.includes("**State:** 👀 Plan ready"));
  assert.ok(panelSection.includes("**Waiting on:** operator"));
  assert.ok(panelSection.includes("**Last completed stage:** plan"));
  assert.ok(panelSection.includes("**Recommended next step:** Review the plan artifacts"));
  assert.ok(
    panelSection.includes(
      "[📄 Plan](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/plan.md)"
    )
  );
  assert.ok(
    panelSection.includes(
      "[📄 Acceptance tests](https://github.com/example/repo/blob/factory/7-sample/.factory/runs/7/acceptance-tests.md)"
    )
  );

  const actionsIndex = panelLines.indexOf("**Actions**");
  assert.ok(actionsIndex >= 0, "expected actions header");
  const actionLines = panelLines.slice(actionsIndex + 1).filter((line) => line.startsWith("- "));
  const actionLabels = actionLines.map((line) => {
    const match = line.match(/\[([^\]]+)\]/);
    return match ? match[1] : line;
  });

  assert.deepEqual(actionLabels, ["▶ Start implement", "⏸ Pause", "📄 Open plan artifacts"]);
});

test("renderPrBody falls back to raw status when emoji mapping is missing", () => {
  const fallbackInput = prBodyInput();
  fallbackInput.metadata = {
    ...fallbackInput.metadata,
    status: "reviewing"
  };
  const body = renderPrBody(fallbackInput);
  const stageLine = body.split("\n").find((line) => line.startsWith("- Stage:"));

  assert.equal(stageLine, "- Stage: reviewing");
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
