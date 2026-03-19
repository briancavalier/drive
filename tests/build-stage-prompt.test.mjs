import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStagePrompt,
  loadStagePromptInputs,
  resolvePromptBudgets,
  writePromptArtifacts
} from "../scripts/build-stage-prompt.mjs";
import { APPROVED_ISSUE_FILE_NAME } from "../scripts/lib/factory-config.mjs";
import { defaultPrMetadata, renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { parseIssueForm } from "../scripts/lib/issue-form.mjs";
import { resolveReviewMethodology } from "../scripts/lib/review-methods.mjs";
import { FAILURE_TYPES } from "../scripts/lib/failure-classification.mjs";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "prompt");
const implementTemplate = fs.readFileSync(
  path.join(process.cwd(), ".factory", "prompts", "implement.md"),
  "utf8"
);
const planTemplate = fs.readFileSync(
  path.join(process.cwd(), ".factory", "prompts", "plan.md"),
  "utf8"
);
const repairTemplate = fs.readFileSync(
  path.join(process.cwd(), ".factory", "prompts", "repair.md"),
  "utf8"
);
const reviewTemplate = fs.readFileSync(
  path.join(process.cwd(), ".factory", "prompts", "review.md"),
  "utf8"
);

function fixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function makeArtifactsDir(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-prompt-"));
  const files = {
    [APPROVED_ISSUE_FILE_NAME]: fixture("long-issue-body.md"),
    "spec.md": fixture("spec.md"),
    "plan.md": fixture("plan.md"),
    "acceptance-tests.md": fixture("acceptance-tests.md"),
    "repair-log.md": fixture("repair-log.md"),
    ...overrides
  };

  for (const [fileName, contents] of Object.entries(files)) {
    if (contents != null) {
      fs.writeFileSync(path.join(dir, fileName), contents);
    }
  }

  return dir;
}

function inflatedIssueBody() {
  const extraProblem = "\n\nThe review stage must be measurable, deterministic, and auditable.";
  const extraGoals = "\n- Keep prompt context compact while preserving enough routing detail.";
  const extraAcceptance =
    "\n- The generated prompt remains within the configured stage budget.";

  return fixture("long-issue-body.md")
    .replace(
      "### Goals\n",
      `### Goals\n${extraProblem.repeat(40)}\n`
    )
    .replace(
      "### Non-goals\n",
      `${extraGoals.repeat(40)}\n\n### Non-goals\n`
    )
    .replace(
      "### Risk\n",
      `${extraAcceptance.repeat(40)}\n\n### Risk\n`
    );
}

function legacyIssueSections(parsedIssue) {
  return [
    ["Problem Statement", parsedIssue.problemStatement],
    ["Goals", parsedIssue.goals],
    ["Non-Goals", parsedIssue.nonGoals],
    ["Constraints", parsedIssue.constraints],
    ["Acceptance Criteria", parsedIssue.acceptanceCriteria],
    ["Risk", parsedIssue.risk],
    ["Affected Area", parsedIssue.affectedArea]
  ]
    .map(([title, body]) => (body ? `## ${title}\n${body.trim()}\n` : ""))
    .join("\n");
}

function legacyArtifacts(artifactsDir) {
  return [
    "spec.md",
    "plan.md",
    "acceptance-tests.md",
    "repair-log.md"
  ]
    .map((fileName) => {
      const contents = fs.readFileSync(path.join(artifactsDir, fileName), "utf8").trim();
      const limited =
        contents.length > 6000 ? `${contents.slice(0, 6000)}\n...[truncated]` : contents;

      return [
        `### ${fileName}`,
        "",
        `\`\`\`md\n${limited}\n\`\`\``,
        ""
      ].join("\n");
    })
    .join("\n");
}

function legacyImplementPrompt({ issueBody, pullRequestBody, artifactsDir }) {
  const parsedIssue = parseIssueForm(issueBody);
  const context = [
    [
      "## Run Metadata",
      "- Mode: implement",
      "- Issue: #1",
      "- Pull Request: #9",
      "- Branch: factory/1-sample",
      "- Current status: implementing"
    ].join("\n"),
    `## Issue Request\n${legacyIssueSections(parsedIssue).trim()}`,
    `## Pull Request Summary\n${pullRequestBody.replace(/<!--\s*factory-state[\s\S]*?-->/m, "").trim()}`,
    `## Existing Artifacts\n${legacyArtifacts(artifactsDir)}`
  ].join("\n\n");

  return implementTemplate
    .replaceAll("{{ISSUE_NUMBER}}", "1")
    .replaceAll("{{ARTIFACTS_PATH}}", artifactsDir)
    .replace("{{CONTEXT}}", context);
}

function legacyReviewPrompt({ artifactsDir, methodologyInstructions }) {
  const legacyTemplate = [
    "You are the autonomous review stage of a GitHub-native software factory.",
    "",
    "Goals:",
    "",
    "- Apply the active methodology `{{METHODOLOGY_NAME}}` to evaluate the latest branch update.",
    "- Read `{{ARTIFACTS_PATH}}/spec.md`, `{{ARTIFACTS_PATH}}/plan.md`, `{{ARTIFACTS_PATH}}/acceptance-tests.md`, and `{{ARTIFACTS_PATH}}/repair-log.md` as needed.",
    "- Inspect the current git diff, test results, and supporting evidence to determine alignment with the specification and acceptance tests.",
    "",
    "{{METHODOLOGY_NOTE}}",
    "",
    "Methodology rubric:",
    "",
    "{{METHODOLOGY_INSTRUCTIONS}}",
    "",
    "Deliverables (write both files inside `{{ARTIFACTS_PATH}}/`):",
    "",
    "1. `review.md` — human-readable summary that includes:",
    "   - Overall decision and short summary. Prefix the decision heading with `✅` (pass) or `❌` (request_changes).",
    "   - A Summary section using the `📝` heading.",
    "   - Blocking findings first, using a `🚨` heading and keeping them outside collapsible sections.",
    "   - Non-blocking findings or notes under a `⚠️` heading when present.",
    "   - The control plane renders the final `🧭` Traceability section from `review.json`; `review.md` should focus on the human-readable review narrative.",
    "   - Methodology used (`{{METHODOLOGY_NAME}}`).",
    "2. `review.json` — machine-readable artifact that must include `methodology`, `decision`, `summary`, `blocking_findings_count`, `requirement_checks`, and `findings`.",
    "",
    "Review guidance:",
    "",
    "- Validate correctness against the spec, plan deliverables, and acceptance tests.",
    "- Build explicit traceability between requirements and evidence before deciding.",
    "- Confirm test coverage and CI evidence are sufficient.",
    "- Assess regression risk, security/safety implications, and scope control.",
    "- Flag missing artifacts, weak evidence, or deviations from plan/spec.",
    "- Keep blocking findings and unmet requirements visible outside collapsible sections.",
    "- When requesting changes, clearly document actionable recommendations.",
    "",
    "Context:",
    "",
    "{{CONTEXT}}"
  ].join("\n");

  return legacyTemplate
    .replaceAll("{{ARTIFACTS_PATH}}", artifactsDir)
    .replaceAll("{{METHODOLOGY_NAME}}", "default")
    .replace("{{METHODOLOGY_NOTE}}", "")
    .replace("{{METHODOLOGY_INSTRUCTIONS}}", methodologyInstructions)
    .replace("{{CONTEXT}}", "## Run Metadata\n- Mode: review\n");
}

function legacyReviewMethodologyInstructions() {
  return [
    "## Review Rubric: Default",
    "",
    "Review procedure:",
    "",
    "1. Read the approved `spec.md`, `plan.md`, `acceptance-tests.md`, relevant CI evidence, and the current git diff before deciding.",
    "2. Write `review.md` in this order: decision and summary, blocking findings, then non-blocking notes.",
    "3. Keep blocking findings and unmet requirements outside collapsible sections so repair context stays visible in GitHub reviews.",
    "4. Build explicit traceability in `review.json` for:",
    "   - every acceptance criterion",
    "   - each major spec commitment touched by the change",
    "   - each plan deliverable touched by the change",
    "5. For every traceability item, record:",
    "   - type: `acceptance_criterion`, `spec_commitment`, or `plan_deliverable`",
    "   - requirement text",
    "   - status: `satisfied`, `partially_satisfied`, `not_satisfied`, or `not_applicable`",
    "   - evidence as an array of concrete citations such as changed files, tests, CI jobs, or artifact evidence",
    "6. The control plane renders the canonical `review.md` Traceability section from `review.json`; do not rely on hand-authored markdown traceability to stay in sync.",
    "7. If evidence is missing for a changed requirement, record that gap explicitly and treat it as a finding.",
    "8. Do not issue a `pass` decision if any requirement check is `partially_satisfied` or `not_satisfied`.",
    "",
    "Focus areas:",
    "",
    "1. **Correctness:** Implementation must satisfy the approved spec, plan, and acceptance tests. Validate logic, data handling, and edge cases.",
    "2. **Acceptance Coverage:** Ensure automated tests demonstrate each acceptance criterion and changed high-risk path. Identify missing, weak, or flaky coverage.",
    "3. **Regression Risk:** Review the diff for unintended side effects, backwards incompatibilities, migrations, dependency changes, and behavior changes outside the requested scope.",
    "4. **Testing & Evidence:** Confirm CI signal is green and that the evidence cited in traceability is specific and relevant to the changed behavior.",
    "5. **Security & Safety:** Look for security, privacy, validation, secrets-handling, and destructive-operation risks requiring remediation.",
    "6. **Scope Control & Documentation:** Verify the change stays within the approved scope or clearly justifies safe deviations, and includes required docs/config updates.",
    "",
    "Finding guidance:",
    "",
    "- Use **blocking** findings for issues that must be fixed before human review, including correctness failures, unmet acceptance criteria, insufficient evidence for changed behavior, security risks, and scope breakage.",
    "- Use **non_blocking** findings for improvements that are useful but not required for hand-off.",
    "- Provide actionable recommendations for every finding and reference impacted files, tests, or CI evidence.",
    "- Avoid speculative, stylistic, or low-confidence findings unless they materially affect correctness, safety, or operability.",
    "",
    "If everything meets expectations, the review can issue a `pass` decision only when all requirement checks are `satisfied` or `not_applicable`."
  ].join("\n");
}

test("resolvePromptBudgets honors overrides and hard ceiling", () => {
  const budgets = resolvePromptBudgets({
    FACTORY_PLAN_PROMPT_MAX_CHARS: "26000",
    FACTORY_IMPLEMENT_PROMPT_MAX_CHARS: "9000",
    FACTORY_REPAIR_PROMPT_MAX_CHARS: "15000",
    FACTORY_REVIEW_PROMPT_MAX_CHARS: "8000",
    FACTORY_PROMPT_HARD_MAX_CHARS: "10000"
  });

  assert.deepEqual(budgets, {
    hardMax: 10000,
    plan: 10000,
    implement: 9000,
    repair: 10000,
    review: 8000
  });
});

test("stage prompts delegate commit and push to the workflow", () => {
  for (const template of [planTemplate, implementTemplate, repairTemplate]) {
    assert.match(template, /Do not run `git commit` or `git push`/);
    assert.doesNotMatch(template, /Use the commit message `factory\(/);
  }
});

test("plan prompt trims oversized issue sections and stays within budget", () => {
  const artifactsDir = makeArtifactsDir();
  const result = buildStagePrompt({
    mode: "plan",
    issueNumber: 1,
    prNumber: 0,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: inflatedIssueBody(),
    budgets: {
      plan: 5500,
      implement: 12000,
      repair: 14000,
      hardMax: 5500
    },
    templateText: planTemplate
  });

  assert.ok(result.prompt.length <= 5500, `prompt length ${result.prompt.length}`);
  assert.ok(result.meta.truncatedSections.length > 0);
  assert.ok(
    result.meta.truncatedSections.includes("problem") ||
      result.meta.truncatedSections.includes("goals") ||
      result.meta.truncatedSections.includes("acceptance")
  );
  assert.match(result.prompt, /Run Metadata/);
  assert.ok(result.meta.omittedSections.length > 0);
});

test("implement prompt excludes PR body and full artifact bodies", () => {
  const artifactsDir = makeArtifactsDir();
  const pullRequestBody = [
    "PR BODY SENTINEL SHOULD NOT APPEAR",
    "",
    renderPrBody({
      issueNumber: 1,
      branch: "factory/1-sample",
      repositoryUrl: "https://github.com/example/repo",
      artifactsPath: artifactsDir,
      metadata: defaultPrMetadata({
        issueNumber: 1,
        artifactsPath: artifactsDir,
        status: "implementing"
      })
    })
  ].join("\n");

  const result = buildStagePrompt({
    mode: "implement",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody,
    budgets: {
      plan: 20000,
      implement: 7000,
      repair: 14000,
      hardMax: 7000
    },
    templateText: implementTemplate
  });

  assert.ok(result.prompt.length <= 7000, `prompt length ${result.prompt.length}`);
  assert.doesNotMatch(result.prompt, /PR BODY SENTINEL SHOULD NOT APPEAR/);
  assert.doesNotMatch(
    result.prompt,
    /Successful CI for a factory-managed PR routes to a review stage instead/
  );
  assert.match(result.prompt, /Artifact Index/);
  assert.match(result.prompt, /headings: Summary \| Workflow Flow/);
});

test("implement prompt metadata lists last failure type and stage counters", () => {
  const artifactsDir = makeArtifactsDir();
  const metadata = defaultPrMetadata({
    issueNumber: 1,
    artifactsPath: artifactsDir,
    status: "implementing",
    lastFailureType: "stage_noop",
    stageNoopAttempts: 1,
    stageSetupAttempts: 2
  });
  const pullRequestBody = renderPrBody({
    issueNumber: 1,
    branch: "factory/1-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: artifactsDir,
    metadata
  });
  const result = buildStagePrompt({
    mode: "implement",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody,
    budgets: {
      plan: 20000,
      implement: 7000,
      repair: 14000,
      hardMax: 7000
    },
    templateText: implementTemplate
  });

  assert.match(result.prompt, /Last failure type: stage_noop/);
  assert.match(result.prompt, /Stage no-op attempts: 1\/2/);
  assert.match(result.prompt, /Stage setup attempts: 2/);
  assert.match(result.prompt, /Previous stage produced no repository changes/);
});

test("review prompt embeds methodology instructions and metadata", () => {
  const artifactsDir = makeArtifactsDir();
  const pullRequestBody = renderPrBody({
    issueNumber: 1,
    branch: "factory/1-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: artifactsDir,
    metadata: defaultPrMetadata({
      issueNumber: 1,
      artifactsPath: artifactsDir,
      status: "reviewing"
    })
  });
  const methodology = resolveReviewMethodology({ requested: "default" });
  const templateVariables = {
    METHODOLOGY_NAME: methodology.name,
    METHODOLOGY_INSTRUCTIONS: methodology.instructions.trim(),
    METHODOLOGY_NOTE: "",
    METHODOLOGY_REQUESTED: methodology.requested,
    METHODOLOGY_FALLBACK: "false"
  };

  const result = buildStagePrompt({
    mode: "review",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody,
    templateText: reviewTemplate,
    templateVariables,
    budgets: {
      plan: 5500,
      implement: 12000,
      review: 8000,
      repair: 14000,
      hardMax: 14000
    }
  });

  assert.match(result.prompt, /Autonomous review stage/i);
  assert.match(result.prompt, /Review against these dimensions:/);
  assert.match(result.prompt, /review\.json/);
  assert.match(result.prompt, /Traceability/);
  assert.match(result.prompt, /The control plane renders the final `🧭` Traceability section from `review\.json`/);
  assert.match(result.prompt, /The control plane renders canonical traceability in `review\.md` from `review\.json` after the run/);
  assert.match(result.prompt, /decision, `📝` Summary, `🚨` blocking findings, `⚠️` non-blocking notes/);
  assert.match(result.prompt, /requirement_checks/);
  assert.match(result.prompt, /requirement_checks` entries must include `type`, `requirement`, `status`, and `evidence`/);
  assert.match(result.prompt, /`evidence` must be an array of non-empty strings/);
  assert.match(result.prompt, /findings` entries must include `level`, `title`, `details`, `scope`, and `recommendation`/);
  assert.match(result.prompt, /Record evidence in `review\.json` as arrays of concrete citations/);
  assert.match(result.prompt, /partially_satisfied/);
  assert.match(result.prompt, /Any requirement check marked `partially_satisfied` or `not_satisfied` requires `request_changes`\./);
  assert.match(result.prompt, /A `pass` decision is only valid when every requirement check is `satisfied` or `not_applicable`\./);
  assert.deepEqual(result.meta.methodology, {
    name: "default",
    requested: "default",
    fallback: false
  });
});

test("review prompt resolves workflow-safety methodology when requested", () => {
  const artifactsDir = makeArtifactsDir();
  const pullRequestBody = renderPrBody({
    issueNumber: 1,
    branch: "factory/1-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: artifactsDir,
    metadata: defaultPrMetadata({
      issueNumber: 1,
      artifactsPath: artifactsDir,
      status: "reviewing"
    })
  });
  const methodology = resolveReviewMethodology({ requested: "workflow-safety" });
  const templateVariables = {
    METHODOLOGY_NAME: methodology.name,
    METHODOLOGY_INSTRUCTIONS: methodology.instructions.trim(),
    METHODOLOGY_NOTE: "",
    METHODOLOGY_REQUESTED: methodology.requested,
    METHODOLOGY_FALLBACK: methodology.fallback ? "true" : "false"
  };

  const result = buildStagePrompt({
    mode: "review",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody,
    templateText: reviewTemplate,
    templateVariables,
    budgets: {
      plan: 5500,
      implement: 12000,
      review: 8000,
      repair: 14000,
      hardMax: 14000
    }
  });

  assert.match(result.prompt, /Review Rubric: Workflow-Safety/);
  assert.match(result.prompt, /Least-Privilege Permissions/);
  assert.match(result.prompt, /Trigger Scope & Recursion/);
  assert.deepEqual(result.meta.methodology, {
    name: "workflow-safety",
    requested: "workflow-safety",
    fallback: false
  });
});

test("review prompt includes CI evidence when workflow run provided", () => {
  const artifactsDir = makeArtifactsDir();
  const methodology = resolveReviewMethodology({ requested: "default" });
  const templateVariables = {
    METHODOLOGY_NAME: methodology.name,
    METHODOLOGY_INSTRUCTIONS: methodology.instructions.trim(),
    METHODOLOGY_NOTE: "",
    METHODOLOGY_REQUESTED: methodology.requested,
    METHODOLOGY_FALLBACK: "false"
  };
  const jobsPayload = {
    jobs: [
      {
        id: 42,
        name: "ci / test",
        conclusion: "success",
        steps: [
          { name: "Install dependencies", conclusion: "success" },
          { name: "Run tests", conclusion: "success" },
          { name: "Upload coverage", conclusion: "success" }
        ]
      }
    ]
  };

  const result = buildStagePrompt({
    mode: "review",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody: "",
    templateText: reviewTemplate,
    templateVariables,
    jobsPayload,
    ciRunId: "123456789",
    budgets: {
      plan: 5500,
      implement: 12000,
      review: 8000,
      repair: 14000,
      hardMax: 14000
    }
  });

  assert.match(result.prompt, /## CI Evidence/);
  assert.match(result.prompt, /123456789/);
  assert.match(result.prompt, /ci \/ test: success/);
  assert.ok(result.meta.includedSections.includes("ci-evidence"));
});

test("review prompt records fallback note when method missing", () => {
  const artifactsDir = makeArtifactsDir();
  const methodology = resolveReviewMethodology({ requested: "nonexistent-method" });
  const templateVariables = {
    METHODOLOGY_NAME: methodology.name,
    METHODOLOGY_INSTRUCTIONS: methodology.instructions.trim(),
    METHODOLOGY_NOTE: `Requested methodology "${methodology.requested}" was not found. Falling back to "${methodology.name}".`,
    METHODOLOGY_REQUESTED: methodology.requested,
    METHODOLOGY_FALLBACK: "true"
  };

  const result = buildStagePrompt({
    mode: "review",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody: "",
    templateText: reviewTemplate,
    templateVariables,
    budgets: {
      plan: 5500,
      implement: 12000,
      review: 8000,
      repair: 14000,
      hardMax: 14000
    }
  });

  assert.match(result.prompt, /Falling back to "default"/);
  assert.deepEqual(result.meta.methodology, {
    name: "default",
    requested: methodology.requested,
    fallback: true
  });
});

test("review static instruction payload is materially smaller than the legacy shape", () => {
  const methodology = resolveReviewMethodology({ requested: "default" });
  const legacyPrompt = legacyReviewPrompt({
    artifactsDir: "/tmp/factory-run",
    methodologyInstructions: legacyReviewMethodologyInstructions()
  });

  const nextStaticPayload = reviewTemplate.length + methodology.instructions.trim().length;
  const legacyStaticPayload = legacyPrompt.length;

  assert.ok(
    nextStaticPayload < legacyStaticPayload * 0.82,
    `${nextStaticPayload} vs ${legacyStaticPayload}`
  );
});

test("repair prompt includes failure context and capped repair-log tail", () => {
  const longRepairLog = `${fixture("repair-log.md")}\n\n${"- extra diagnostic context\n".repeat(80)}`;
  const artifactsDir = makeArtifactsDir({
    "repair-log.md": longRepairLog
  });
  const result = buildStagePrompt({
    mode: "repair",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody: renderPrBody({
      issueNumber: 1,
      branch: "factory/1-sample",
      repositoryUrl: "https://github.com/example/repo",
      artifactsPath: artifactsDir,
      metadata: defaultPrMetadata({
        issueNumber: 1,
        artifactsPath: artifactsDir,
        status: "repairing"
      })
    }),
    jobsPayload: {
      jobs: [
        {
          name: "CI",
          conclusion: "failure",
          steps: [
            { name: "test", conclusion: "failure" },
            { name: "lint", conclusion: "success" }
          ]
        }
      ]
    },
    ciRunId: "123456",
    budgets: {
      plan: 20000,
      implement: 12000,
      repair: 6500,
      hardMax: 6500
    },
    templateText: repairTemplate
  });

  assert.ok(result.prompt.length <= 6500, `prompt length ${result.prompt.length}`);
  assert.match(result.prompt, /Workflow run id: 123456/);
  assert.match(result.prompt, /- CI: failure/);
  assert.match(result.prompt, /Repair Log Tail/);
  assert.match(result.prompt, /\.\.\.\[tail\]/);
  assert.ok((result.prompt.match(/extra diagnostic context/g) || []).length < 40);
});

test("repair prompt surfaces stored review artifact failure details", () => {
  const artifactsDir = makeArtifactsDir();
  const failure = {
    type: FAILURE_TYPES.reviewArtifactContract,
    phase: "review",
    message: "review.json must contain an object",
    capturedAt: "2026-03-19T12:34:56.000Z"
  };
  const metadata = defaultPrMetadata({
    issueNumber: 1,
    artifactsPath: artifactsDir,
    status: "repairing",
    lastFailureType: FAILURE_TYPES.reviewArtifactContract,
    lastReviewArtifactFailure: failure
  });
  const result = buildStagePrompt({
    mode: "repair",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody: renderPrBody({
      issueNumber: 1,
      branch: "factory/1-sample",
      repositoryUrl: "https://github.com/example/repo",
      artifactsPath: artifactsDir,
      metadata
    }),
    budgets: {
      plan: 20000,
      implement: 12000,
      repair: 6500,
      hardMax: 6500
    },
    templateText: repairTemplate
  });

  assert.match(result.prompt, /Invalid review artifacts/);
  assert.match(result.prompt, /review\.json, review\.md/);
  assert.match(result.prompt, /2026-03-19T12:34:56\.000Z/);
});

test("writePromptArtifacts emits prompt-meta.json", () => {
  const artifactsDir = makeArtifactsDir();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-prompt-output-"));
  const result = buildStagePrompt({
    mode: "implement",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody: fixture("long-issue-body.md"),
    pullRequestBody: renderPrBody({
      issueNumber: 1,
      branch: "factory/1-sample",
      repositoryUrl: "https://github.com/example/repo",
      artifactsPath: artifactsDir,
      metadata: defaultPrMetadata({
        issueNumber: 1,
        artifactsPath: artifactsDir,
        status: "implementing"
      })
    }),
    templateText: implementTemplate
  });

  writePromptArtifacts(outputDir, result);

  const meta = JSON.parse(
    fs.readFileSync(path.join(outputDir, "prompt-meta.json"), "utf8")
  );

  assert.equal(meta.mode, "implement");
  assert.equal(meta.finalChars, result.prompt.length);
  assert.ok(Array.isArray(meta.includedSections));
  assert.ok(Array.isArray(meta.sections));
});

test("implement prompt is materially smaller than the legacy prompt shape", () => {
  const artifactsDir = makeArtifactsDir();
  const issueBody = inflatedIssueBody();
  const pullRequestBody = renderPrBody({
    issueNumber: 1,
    branch: "factory/1-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: artifactsDir,
    metadata: defaultPrMetadata({
      issueNumber: 1,
      artifactsPath: artifactsDir,
      status: "implementing"
    })
  });

  const nextPrompt = buildStagePrompt({
    mode: "implement",
    issueNumber: 1,
    prNumber: 9,
    branch: "factory/1-sample",
    artifactsPath: artifactsDir,
    issueBody,
    pullRequestBody,
    templateText: implementTemplate
  }).prompt;
  const legacyPrompt = legacyImplementPrompt({
    issueBody,
    pullRequestBody,
    artifactsDir
  });

  assert.ok(nextPrompt.length < legacyPrompt.length * 0.6, `${nextPrompt.length} vs ${legacyPrompt.length}`);
});

test("loadStagePromptInputs reads approved issue snapshot from artifacts", async () => {
  const artifactsDir = makeArtifactsDir({
    [APPROVED_ISSUE_FILE_NAME]: [
      "## Problem Statement",
      "Approved snapshot problem",
      "## Goals",
      "Approved goals",
      "## Non-goals",
      "Approved non-goals",
      "## Constraints",
      "Approved constraints",
      "## Acceptance Criteria",
      "Approved acceptance",
      "## Risk",
      "Approved risk",
      "## Affected Area",
      "Approved area"
    ].join("\n")
  });

  const input = await loadStagePromptInputs({
    FACTORY_MODE: "implement",
    FACTORY_ISSUE_NUMBER: "12",
    FACTORY_BRANCH: "factory/12-sample",
    FACTORY_ARTIFACTS_PATH: artifactsDir
  });

  assert.match(input.issueBody, /Approved snapshot problem/);
});

test("loadStagePromptInputs fails closed when approved issue snapshot is missing", async () => {
  const artifactsDir = makeArtifactsDir({
    [APPROVED_ISSUE_FILE_NAME]: null
  });

  await assert.rejects(
    () =>
      loadStagePromptInputs({
        FACTORY_MODE: "implement",
        FACTORY_ISSUE_NUMBER: "12",
        FACTORY_BRANCH: "factory/12-sample",
        FACTORY_ARTIFACTS_PATH: artifactsDir
      }),
    /Missing approved issue snapshot/
  );
});
