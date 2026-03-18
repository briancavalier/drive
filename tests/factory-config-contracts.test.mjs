import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { FACTORY_RESETTABLE_PR_STATUSES } from "../scripts/lib/factory-config.mjs";

function extractResetWorkflowStatusOptions(workflowText) {
  const start = workflowText.indexOf("\n      status:\n");
  const end = workflowText.indexOf("\n      convert_to_draft:\n", start);

  assert.notEqual(start, -1, "factory-reset-pr workflow must define a status input");
  assert.notEqual(end, -1, "factory-reset-pr workflow must define convert_to_draft after status");

  const statusBlock = workflowText.slice(start, end);

  return Array.from(statusBlock.matchAll(/^\s{10}-\s+([a-z_]+)\s*$/gm)).map(
    (match) => match[1]
  );
}

function readWorkflowText(fileName) {
  return fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", fileName),
    "utf8"
  );
}

function extractJobBlock(workflowText, jobName) {
  const start = workflowText.indexOf(`  ${jobName}:\n`);
  assert.notEqual(start, -1, `${jobName} job must exist in factory-pr-loop workflow`);

  const remainder = workflowText.slice(start + 1);
  const nextJobMatch = remainder.match(/\n  [a-z0-9-]+:\n/);
  const end = nextJobMatch ? start + 1 + nextJobMatch.index : workflowText.length;

  return workflowText.slice(start, end);
}

test("factory reset workflow status options stay in sync with shared config", () => {
  const workflowText = readWorkflowText("factory-reset-pr.yml");
  const options = extractResetWorkflowStatusOptions(workflowText);

  assert.deepEqual(options, FACTORY_RESETTABLE_PR_STATUSES);
});

test("factory PR loop concurrency prefers linked PR numbers for workflow_run events", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(
    workflowText,
    /github\.event\.workflow_run\.pull_requests\[0\]\.number/
  );
});

test("factory stage workflow creates the stage artifacts path before Codex runs", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /name:\s+Ensure artifacts path exists[\s\S]*mkdir -p "\$\{\{\s*inputs\.artifacts_path\s*\}\}"/
  );
});

test("factory stage workflow pins the Codex CLI to the last known good version", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(workflowText, /codex-version:\s*0\.114\.0/);
});

test("factory stage workflow resolves per-stage models before running Codex", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /name:\s+Resolve stage model[\s\S]*node scripts\/resolve-stage-model\.mjs/
  );
  assert.match(
    workflowText,
    /FACTORY_PLAN_MODEL:\s*\$\{\{\s*vars\.FACTORY_PLAN_MODEL \|\| ''\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_IMPLEMENT_MODEL:\s*\$\{\{\s*vars\.FACTORY_IMPLEMENT_MODEL \|\| ''\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_REPAIR_MODEL:\s*\$\{\{\s*vars\.FACTORY_REPAIR_MODEL \|\| ''\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_REVIEW_MODEL:\s*\$\{\{\s*vars\.FACTORY_REVIEW_MODEL \|\| ''\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_STAGE_MODEL_OVERRIDE:\s*\$\{\{\s*inputs\.model\s*\}\}/
  );
  assert.match(
    workflowText,
    /model:\s*\$\{\{\s*steps\.model\.outputs\.model\s*\}\}/
  );
});

test("factory PR loop failure jobs build diagnosis prompts and gate Codex advisories", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(
    workflowText,
    /name:\s+Build failure diagnosis prompt[\s\S]*node scripts\/build-failure-diagnosis-prompt\.mjs/
  );
  assert.match(workflowText, /FACTORY_FAILURE_PHASE:\s*stage/);
  assert.match(
    workflowText,
    /FACTORY_FAILURE_PHASE:\s*\$\{\{\s*needs\['process-review'\]\.outputs\.failure_phase \|\| 'review_delivery'\s*\}\}/
  );
  assert.match(workflowText, /model:\s*\$\{\{\s*vars\.FACTORY_FAILURE_DIAGNOSIS_MODEL \|\| 'codex-mini-latest'\s*\}\}/);
  assert.match(workflowText, /FACTORY_ENABLE_FAILURE_DIAGNOSIS:\s*\$\{\{\s*vars\.FACTORY_ENABLE_FAILURE_DIAGNOSIS \|\| 'true'\s*\}\}/);
  assert.match(workflowText, /configuration\|transient_infra\|stale_branch_conflict\|stale_stage_push/);
  assert.match(workflowText, /if:\s*steps\.diagnosis_gate\.outputs\.run_diagnosis == 'true'/);
  assert.match(workflowText, /prompt-file:\s*\$\{\{\s*steps\.diagnosis_prompt\.outputs\.prompt_path\s*\}\}/);
  assert.match(workflowText, /FACTORY_FAILURE_ADVISORY_PATH:\s*\$\{\{\s*steps\.diagnosis_prompt\.outputs\.advisory_path\s*\}\}/);
  assert.match(
    workflowText,
    /failure_type:\s*\$\{\{\s*steps\.process_review\.outputs\.failure_type\s*\}\}/
  );
  assert.match(
    workflowText,
    /failure_phase:\s*\$\{\{\s*steps\.process_review\.outputs\.failure_phase\s*\}\}/
  );
});

test("factory PR loop failure jobs keep Codex diagnosis best-effort and out of repo-tracked temp paths", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  const codexSteps = workflowText.match(/name:\s+Run Codex failure diagnosis[\s\S]*?codex-args:\s+--full-auto/g) || [];
  assert.equal(codexSteps.length, 2);
  for (const step of codexSteps) {
    assert.match(step, /if:\s*steps\.diagnosis_gate\.outputs\.run_diagnosis == 'true'/);
    assert.match(step, /continue-on-error:\s*true/);
  }

  assert.doesNotMatch(workflowText, /prompt-file:\s*\.factory\/tmp\//);
  assert.doesNotMatch(workflowText, /FACTORY_FAILURE_ADVISORY_PATH:\s*\.factory\/tmp\//);
});

test("factory PR loop failure jobs check out the failing branch before diagnosis", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const routeJob = extractJobBlock(workflowText, "route");
  const stageFailedJob = extractJobBlock(workflowText, "stage-failed");
  const reviewProcessingFailedJob = extractJobBlock(workflowText, "review-processing-failed");

  assert.doesNotMatch(routeJob, /needs\.route\.outputs\.branch/);
  assert.match(
    stageFailedJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.route\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
  assert.match(
    reviewProcessingFailedJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.route\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
});
