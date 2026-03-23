import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewConversationBody,
  renderInterventionQuestionComment,
  renderInterventionResolutionComment,
  renderIntakeRejectedComment,
  renderPlanReadyIssueComment,
  MAX_REVIEW_BODY_CHARS
} from "../scripts/lib/github-messages.mjs";
import {
  defaultApprovalIntervention,
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

test("renderInterventionQuestionComment renders concise header with per-option fences", () => {
  const intervention = defaultApprovalIntervention({
    id: "int_q_123",
    stage: "implement",
    summary: "Need approval to continue with protected control-plane changes",
    detail: "The next resumed stage needs temporary self-modify authorization.",
    runId: "123456789",
    runUrl: "https://github.com/example/repo/actions/runs/123456789",
    payload: {
      question: "Should the factory authorize self-modify for the next resumed stage and continue?",
      recommendedOptionId: "approve_once",
      options: [
        {
          id: "approve_once",
          label: "Approve once and authorize the next resumed stage",
          effect: "resume_current_stage"
        },
        { id: "deny", label: "Do not approve", effect: "remain_blocked" }
      ]
    }
  });
  const comment = renderInterventionQuestionComment({ intervention });
  const lines = comment.split("\n");

  assert.equal(lines[0], "## Factory Question");
  assert.equal(lines[1], "**🧑 Human action required** · Stage: `implement`");
  assert.equal(lines[2], "Summary: Need approval to continue with protected control-plane changes");
  assert.equal(lines[3], "Question ID: `int_q_123`");
  assert.equal(lines[4], "Recommended: `approve_once`");
  assert.equal(
    lines[5],
    "Run: [GitHub Actions #123456789](https://github.com/example/repo/actions/runs/123456789)"
  );
  assert.equal(lines[6], "");
  assert.equal(lines[7], "### Answer With");
  assert.equal(lines[8], "");
  assert.equal(
    lines[9],
    "> _Should the factory authorize self-modify for the next resumed stage and continue?_"
  );

  const firstOptionIndex = lines.indexOf(
    "**Approve once and authorize the next resumed stage** — Resumes automation"
  );
  assert.ok(firstOptionIndex > 0);
  assert.equal(lines[firstOptionIndex - 1], "");
  assert.equal(lines[firstOptionIndex + 1], "");
  assert.equal(lines[firstOptionIndex + 2], "```text");
  assert.equal(lines[firstOptionIndex + 3], "/factory answer int_q_123 approve_once");
  assert.equal(lines[firstOptionIndex + 4], "```");

  const secondOptionIndex = lines.indexOf("**Do not approve** — Keeps automation blocked");
  assert.ok(secondOptionIndex > firstOptionIndex);
  assert.equal(lines[secondOptionIndex + 1], "");
  assert.equal(lines[secondOptionIndex + 2], "```text");
  assert.equal(lines[secondOptionIndex + 3], "/factory answer int_q_123 deny");
  assert.equal(lines[secondOptionIndex + 4], "```");

  const fences = lines.filter((line) => line === "```text");
  assert.equal(fences.length, 2);

  assert.ok(!comment.includes("### Options"));
  assert.ok(!comment.includes("Reply in a new PR comment"));
  assert.ok(comment.includes("<details>"));
  assert.ok(comment.includes("<summary>Why this needs attention</summary>"));
  assert.doesNotMatch(comment, /apply the label manually/i);

  const metadataMatch = comment.match(/<!-- factory-question: ([^>]+) -->/);
  assert.ok(metadataMatch);
  assert.deepEqual(JSON.parse(metadataMatch[1]), {
    id: "int_q_123",
    type: "approval",
    version: 1,
    status: "open",
    optionIds: ["approve_once", "deny"]
  });
});


test("renderInterventionQuestionComment omits outcome hint for unknown effects", () => {
  const intervention = defaultApprovalIntervention({
    id: "int_unknown",
    stage: "review",
    summary: "Decide next step",
    detail: "",
    payload: {
      question: "What should happen now?",
      recommendedOptionId: null,
      options: [{ id: "hold", label: "Hold for review", effect: "something_else" }]
    }
  });
  const comment = renderInterventionQuestionComment({ intervention });
  const lines = comment.split("\n");
  const optionIndex = lines.indexOf("**Hold for review**");

  assert.ok(optionIndex > -1);
  assert.ok(!lines[optionIndex].includes(" — "));
  assert.equal(lines[optionIndex + 1], "");
  assert.equal(lines[optionIndex + 2], "```text");
  assert.equal(lines[optionIndex + 3], "/factory answer int_unknown hold");
  assert.equal(lines[optionIndex + 4], "```");
});

test("renderInterventionQuestionComment renders generic ambiguity questions", () => {
  const comment = renderInterventionQuestionComment({
    intervention: {
      id: "int_q_ambiguity",
      type: "question",
      stage: "implement",
      summary: "Need a decision between two valid implementation directions",
      detail: "Both paths satisfy the approved plan, but they lead to materially different code.",
      payload: {
        questionKind: "ambiguity",
        question: "Which implementation direction should the factory take?",
        recommendedOptionId: "api_first",
        options: [
          {
            id: "api_first",
            label: "API-first path",
            effect: "resume_current_stage",
            instruction: "Implement the API-first path."
          },
          {
            id: "ui_first",
            label: "UI-first path",
            effect: "resume_current_stage",
            instruction: "Implement the UI-first path."
          },
          {
            id: "human_takeover",
            label: "Hand off to human-only handling",
            effect: "manual_only"
          }
        ]
      }
    }
  });

  assert.match(comment, /Need a decision between two valid implementation directions/);
  assert.match(comment, /\/factory answer int_q_ambiguity api_first/);
  assert.match(comment, /\/factory answer int_q_ambiguity ui_first/);
  assert.match(comment, /\/factory answer int_q_ambiguity human_takeover/);
});

test("renderInterventionQuestionComment skips context section when detail absent", () => {
  const intervention = defaultApprovalIntervention({
    id: "int_no_detail",
    stage: "implement",
    summary: "Confirm deployment",
    detail: "",
    payload: {
      question: "Is the deployment ready?",
      recommendedOptionId: "approve_once",
      options: [
        { id: "approve_once", label: "Approve once", effect: "resume_current_stage" },
        { id: "deny", label: "Deny", effect: "remain_blocked" }
      ]
    }
  });
  const comment = renderInterventionQuestionComment({ intervention });

  assert.ok(!comment.includes("<details>"));
  assert.ok(!comment.includes("<summary>Why this needs attention</summary>"));
});


test("renderInterventionQuestionComment handles missing optional values", () => {
  const intervention = defaultApprovalIntervention({
    id: "int_minimal",
    stage: "review",
    summary: "",
    detail: "",
    runId: null,
    runUrl: null,
    payload: {
      question: "Manual decision required?",
      recommendedOptionId: null,
      options: []
    }
  });
  const comment = renderInterventionQuestionComment({ intervention });
  const lines = comment.split("\n");
  const headingIndex = lines.indexOf("### Answer With");
  const header = lines.slice(0, headingIndex).filter((line) => line);

  assert.deepEqual(header, [
    "## Factory Question",
    "**🧑 Human action required** · Stage: `review`",
    "Question ID: `int_minimal`"
  ]);
  assert.equal(lines[headingIndex - 1], "");
  assert.equal(lines[headingIndex + 1], "");
  assert.equal(lines[headingIndex + 2], "> _Manual decision required?_");
  assert.equal(lines[headingIndex + 3], "");
  assert.equal(lines[headingIndex + 4], "_No answers available._");
  assert.ok(!comment.includes("Summary:"));
  assert.ok(!comment.includes("Recommended:"));
  assert.ok(!comment.includes("Run:"));
  const metadataMatch = comment.match(/<!-- factory-question: ([^>]+) -->/);
  assert.ok(metadataMatch);
  assert.deepEqual(JSON.parse(metadataMatch[1]).optionIds, []);
});


test("renderInterventionQuestionComment omits recommended fact when not provided", () => {
  const intervention = defaultApprovalIntervention({
    id: "int_no_recommendation",
    stage: "implement",
    summary: "Escalate for confirmation",
    detail: "Follow runbook section 2 before answering.",
    payload: {
      question: "Continue automation?",
      recommendedOptionId: null,
      options: [
        { id: "resume", label: "Resume", effect: "resume_current_stage" }
      ]
    }
  });
  const comment = renderInterventionQuestionComment({ intervention });
  const lines = comment.split("\n");
  const headingIndex = lines.indexOf("### Answer With");
  const header = lines.slice(0, headingIndex).filter((line) => line);

  assert.ok(header.includes("**🧑 Human action required** · Stage: `implement`"));
  assert.ok(header.includes("Summary: Escalate for confirmation"));
  assert.ok(header.includes("Question ID: `int_no_recommendation`"));
  assert.ok(!header.some((line) => line.startsWith("Recommended:")));
  assert.equal(lines[headingIndex - 1], "");
});


test("renderInterventionResolutionComment includes resolution metadata", () => {
  const comment = renderInterventionResolutionComment({
    interventionId: "int_q_123",
    optionId: "approve_once",
    resumeAction: "implement"
  });

  assert.match(comment, /Resolved factory question `int_q_123` with answer `approve_once`\./);
  assert.match(comment, /Resuming `implement`\./);
  assert.match(comment, /factory-resolution/);
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

function makeSampleReview(overrides = {}) {
  return {
    methodology: "default",
    decision: "pass",
    summary: "All acceptance criteria are satisfied.",
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Ensure quality",
        status: "satisfied",
        evidence: ["Tests cover expectations."]
      }
    ],
    findings: [],
    ...overrides
  };
}

test("buildReviewConversationBody renders dashboard layout for pass decision", () => {
  const review = makeSampleReview();
  const reviewMarkdown = "# ✅ Autonomous Review Decision: PASS\n\nFull details live here.";
  const body = buildReviewConversationBody({
    review,
    reviewMarkdown,
    artifactsPath: ".factory/runs/11"
  });

  const lines = body.split("\n");

  assert.equal(lines[0], "## Factory Review");
  assert.equal(lines[2], "**✅ PASS** · Method: `default`");
  assert.ok(body.includes("Summary: All acceptance criteria are satisfied."));
  assert.ok(body.includes("**Findings:** Blocking 0 · Requirement gaps 0"));
  assert.ok(
    body.includes("Artifacts: `.factory/runs/11/review.md` · `.factory/runs/11/review.json`")
  );
  assert.ok(body.includes("### Blocking Findings"));
  assert.ok(body.includes("- None recorded in review.json."));
  assert.ok(body.includes("### Requirement Gaps"));
  assert.ok(body.includes("<summary>Traceability</summary>"));
  assert.ok(body.includes("<summary>Full review.md</summary>"));
  assert.ok(!body.includes("Review body truncated due to length"));
});

test("buildReviewConversationBody drops optional sections before hitting the length limit", () => {
  const review = makeSampleReview();
  const reviewMarkdown = `# Review\n\n${"A".repeat(4000)}`;
  const body = buildReviewConversationBody({
    review,
    reviewMarkdown,
    artifactsPath: ".factory/runs/44",
    maxBodyChars: 900
  });

  assert.ok(body.startsWith("## Factory Review"));
  assert.ok(!body.includes("<summary>Full review.md</summary>"));
  assert.ok(body.includes("<summary>Traceability</summary>"));
  assert.ok(body.includes("Review body truncated due to length. See `.factory/runs/44/review.md`"));
  assert.ok(body.length <= 900);
});

test("buildReviewConversationBody falls back to summary block when even summaries exceed the limit", () => {
  const review = makeSampleReview({
    summary: "Summary " + "x".repeat(160),
    requirement_checks: Array.from({ length: 20 }, (_, index) => ({
      type: "acceptance_criterion",
      requirement: `Requirement ${index}`,
      status: index % 2 === 0 ? "not_satisfied" : "partially_satisfied",
      evidence: [`Evidence details ${"y".repeat(50)}`]
    })),
    findings: Array.from({ length: 10 }, (_, index) => ({
      title: `Finding ${index}`,
      level: "blocking",
      scope: "scope",
      details: `Details ${"z".repeat(60)}`,
      recommendation: "Fix it"
    }))
  });
  const body = buildReviewConversationBody({
    review,
    reviewMarkdown: "# Review\n\nDense body",
    artifactsPath: ".factory/runs/55",
    maxBodyChars: 350
  });

  const lines = body.split("\n");

  assert.equal(lines[0], "## Factory Review");
  assert.ok(body.includes("**✅ PASS** · Method: `default`"));
  assert.ok(body.includes("**Findings:** Blocking"));
  assert.ok(body.includes("Review body truncated due to length. See `.factory/runs/55/review.md`"));
  assert.ok(!body.includes("### Blocking Findings"));
  assert.ok(!body.includes("<details>"));
  assert.ok(body.length <= 350);
});
