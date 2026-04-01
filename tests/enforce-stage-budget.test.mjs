import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceStageBudget,
  extractPlannedPaths
} from "../scripts/enforce-stage-budget.mjs";

function makeFixtureDir({ summary, promptMeta, plan }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-budget-"));
  const artifactsPath = path.join(root, ".factory", "runs", "12");
  fs.mkdirSync(artifactsPath, { recursive: true });
  fs.mkdirSync(path.join(root, ".factory", "tmp"), { recursive: true });
  fs.writeFileSync(path.join(artifactsPath, "plan.md"), plan);
  fs.writeFileSync(
    path.join(root, ".factory", "tmp", "prompt-meta.json"),
    JSON.stringify(promptMeta, null, 2)
  );
  fs.writeFileSync(path.join(root, "cost-summary.json"), JSON.stringify(summary, null, 2));

  return {
    root,
    artifactsPath,
    costSummaryPath: path.join(root, "cost-summary.json"),
    promptMetaPath: path.join(root, ".factory", "tmp", "prompt-meta.json"),
    planPath: path.join(artifactsPath, "plan.md")
  };
}

function createSummary({ band = "medium", stageUsd = 0.4, totalUsd = 0.4 } = {}) {
  return {
    thresholds: {
      warnUsd: 0.25,
      highUsd: 1
    },
    current: {
      derivedCost: {
        band,
        stageUsd,
        totalEstimatedUsd: totalUsd
      }
    }
  };
}

function createPromptMeta({ truncated = [], omitted = [], budgetOverride = null } = {}) {
  return {
    truncatedSections: truncated,
    omittedSections: omitted,
    budgetOverride
  };
}

test("extractPlannedPaths finds repo paths and ignores run artifacts", () => {
  const paths = extractPlannedPaths(
    [
      "- Update `scripts/process-review.mjs` and `tests/process-review.test.mjs`.",
      "- Review artifacts stay in `.factory/runs/12/plan.md`."
    ].join("\n"),
    { artifactsPath: ".factory/runs/12" }
  );

  assert.deepEqual(paths, ["scripts/process-review.mjs", "tests/process-review.test.mjs"]);
});

test("enforceStageBudget observes non-implement stages without blocking", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "high", stageUsd: 1.4, totalUsd: 1.4 }),
    promptMeta: createPromptMeta({ truncated: ["problem"], omitted: ["factory-policy"] }),
    plan: "- Update `scripts/process-review.mjs`."
  });
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "plan",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "observe");
  assert.equal(outputs.budget_decision, "observe");
  assert.equal(outputs.budget_decision_detail, "observe");
  assert.equal(outputs.budget_override_consumed, undefined);
  assert.ok(!("failure_type" in outputs));
});

test("enforceStageBudget observes plan stages even before plan.md exists", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "medium", stageUsd: 0.2, totalUsd: 0.2 }),
    promptMeta: createPromptMeta({ truncated: ["issue-body"] }),
    plan: "- Placeholder"
  });
  const outputs = {};

  fs.rmSync(fixture.planPath);

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "plan",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "observe");
  assert.equal(outputs.budget_decision, "observe");
  assert.equal(outputs.planned_path_count, "0");
  assert.equal(outputs.control_plane_paths_detected, "false");
});

test("enforceStageBudget blocks high-cost implement runs", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "high", stageUsd: 1.4, totalUsd: 1.4 }),
    promptMeta: createPromptMeta(),
    plan: "- Update `src/app.ts`."
  });
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "implement",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "blocked");
  assert.equal(outputs.budget_decision, "block");
  assert.equal(outputs.budget_decision_detail, "hard_block");
  assert.equal(outputs.budget_override_consumed, "false");
  assert.equal(outputs.failure_type, "budget_guardrail");
  assert.match(outputs.failure_message, /Estimated implement cost is already in the high cost band/);
});

test("enforceStageBudget blocks truncated implement runs with broad control-plane plans", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "medium", stageUsd: 0.6, totalUsd: 0.6 }),
    promptMeta: createPromptMeta({ truncated: ["problem"], omitted: ["factory-policy"] }),
    plan: [
      "- Update `scripts/process-review.mjs`.",
      "- Update `scripts/lib/github-messages.mjs`.",
      "- Update `tests/process-review.test.mjs`.",
      "- Update `tests/github-messages.test.mjs`.",
      "- Update `.github/workflows/_factory-stage.yml`.",
      "- Update `.factory/prompts/review.md`."
    ].join("\n")
  });
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "implement",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 1);
  assert.equal(outputs.budget_decision_detail, "question_required");
  assert.equal(outputs.budget_override_consumed, "false");
  assert.equal(outputs.failure_type, "budget_guardrail");
  assert.equal(outputs.control_plane_paths_detected, "true");
  assert.match(outputs.failure_message, /Prompt context was truncated or omitted/);
});

test("enforceStageBudget allows medium-cost implement runs without broad-risk signals", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "medium", stageUsd: 0.6, totalUsd: 0.6 }),
    promptMeta: createPromptMeta(),
    plan: "- Update `src/components/Widget.tsx` and `tests/widget.test.ts`."
  });
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "implement",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "pass");
  assert.equal(outputs.budget_decision, "pass");
  assert.equal(outputs.budget_decision_detail, "pass");
  assert.equal(outputs.budget_override_consumed, "false");
  assert.ok(!("failure_type" in outputs));
});

test("enforceStageBudget allows a single approved budget override for question-required runs", () => {
  const fixture = makeFixtureDir({
    summary: createSummary({ band: "medium", stageUsd: 0.6, totalUsd: 0.6 }),
    promptMeta: createPromptMeta({
      truncated: ["problem"],
      omitted: ["factory-policy"],
      budgetOverride: {
        sourceInterventionId: "int_q_budget",
        kind: "question_required",
        approvedBy: "maintainer",
        approvedAt: "2026-04-01T00:00:00Z"
      }
    }),
    plan: [
      "- Update `scripts/process-review.mjs`.",
      "- Update `scripts/lib/github-messages.mjs`.",
      "- Update `tests/process-review.test.mjs`.",
      "- Update `tests/github-messages.test.mjs`.",
      "- Update `.github/workflows/_factory-stage.yml`.",
      "- Update `.factory/prompts/review.md`."
    ].join("\n")
  });
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "implement",
      FACTORY_ARTIFACTS_PATH: fixture.artifactsPath,
      FACTORY_COST_SUMMARY_PATH: fixture.costSummaryPath,
      FACTORY_PROMPT_META_PATH: fixture.promptMetaPath,
      FACTORY_PLAN_PATH: fixture.planPath
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "pass");
  assert.equal(outputs.budget_decision, "pass");
  assert.equal(outputs.budget_decision_detail, "pass");
  assert.equal(outputs.budget_override_consumed, "true");
});

test("enforceStageBudget surfaces configuration failures for missing inputs", () => {
  const outputs = {};

  const result = enforceStageBudget({
    env: {
      FACTORY_MODE: "implement",
      FACTORY_ARTIFACTS_PATH: "/tmp/missing",
      FACTORY_COST_SUMMARY_PATH: "/tmp/does-not-exist.json",
      FACTORY_PROMPT_META_PATH: "/tmp/missing-prompt-meta.json",
      FACTORY_PLAN_PATH: "/tmp/missing-plan.md"
    },
    outputWriter: (data) => Object.assign(outputs, data)
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "configuration_failure");
  assert.equal(outputs.budget_decision_detail, "error");
  assert.equal(outputs.failure_type, "configuration");
  assert.match(outputs.failure_message, /Unable to read/);
});
