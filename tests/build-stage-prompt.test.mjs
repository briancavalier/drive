import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStagePrompt,
  resolvePromptBudgets,
  writePromptArtifacts
} from "../scripts/build-stage-prompt.mjs";
import { defaultPrMetadata, renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { parseIssueForm } from "../scripts/lib/issue-form.mjs";
import { resolveReviewMethodology } from "../scripts/lib/review-methods.mjs";

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
      review: 12000,
      repair: 14000,
      hardMax: 14000
    }
  });

  assert.match(result.prompt, /Autonomous review stage/i);
  assert.match(result.prompt, new RegExp(methodology.instructions.trim().slice(0, 20)));
  assert.match(result.prompt, /Traceability/);
  assert.match(result.prompt, /requirement_checks/);
  assert.match(result.prompt, /partially_satisfied/);
  assert.deepEqual(result.meta.methodology, {
    name: "default",
    requested: "default",
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
      review: 12000,
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
      review: 12000,
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
