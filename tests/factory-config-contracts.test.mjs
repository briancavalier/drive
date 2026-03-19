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

test("factory PR loop concurrency uses only event-safe identifiers", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(workflowText, /github\.event\.pull_request\.number/);
  assert.match(workflowText, /github\.event\.workflow_run\.head_branch/);
  assert.doesNotMatch(
    workflowText,
    /github\.event\.workflow_run\.pull_requests\[0\]\.number/
  );
});

test("factory PR loop stage caller grants reusable workflow write permissions", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const stageBlock = extractJobBlock(workflowText, "stage");

  assert.match(stageBlock, /permissions:\s*\n\s+contents:\s+write/);
  assert.match(stageBlock, /permissions:\s*\n(?:\s+[a-z-]+:\s+\w+\n)*\s+issues:\s+write/);
  assert.match(
    stageBlock,
    /permissions:\s*\n(?:\s+[a-z-]+:\s+\w+\n)*\s+pull-requests:\s+write/
  );
});

test("factory stage workflow creates the stage artifacts path before Codex runs", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /name:\s+Ensure artifacts path exists[\s\S]*mkdir -p "\$\{\{\s*inputs\.artifacts_path\s*\}\}"/
  );
});

test("factory stage workflow validates live PR context before building prompts", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");
  const validateIndex = workflowText.indexOf("name: Validate factory context");
  const buildIndex = workflowText.indexOf("name: Build stage prompt");

  assert.ok(validateIndex >= 0);
  assert.ok(buildIndex > validateIndex);
  assert.match(
    workflowText,
    /name:\s+Validate factory context[\s\S]*if:\s*inputs\.pr_number > 0[\s\S]*node scripts\/validate-factory-context\.mjs/
  );
  assert.match(
    workflowText,
    /name:\s+Validate factory context[\s\S]*FACTORY_PR_NUMBER:\s*\$\{\{\s*inputs\.pr_number\s*\}\}[\s\S]*FACTORY_ISSUE_NUMBER:\s*\$\{\{\s*inputs\.issue_number\s*\}\}[\s\S]*FACTORY_BRANCH:\s*\$\{\{\s*inputs\.branch\s*\}\}[\s\S]*FACTORY_ARTIFACTS_PATH:\s*\$\{\{\s*inputs\.artifacts_path\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Stop on factory context validation failure[\s\S]*if:\s*steps\.validate_context\.outcome == 'failure'/
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

test("factory stage workflow validates the resolved model before estimating cost", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /name:\s+Validate stage model[\s\S]*node scripts\/validate-stage-model\.mjs/
  );
  assert.match(
    workflowText,
    /FACTORY_STAGE_MODEL:\s*\$\{\{\s*steps\.model\.outputs\.model\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_STAGE_MODE:\s*\$\{\{\s*inputs\.mode\s*\}\}/
  );
  assert.match(
    workflowText,
    /FACTORY_STAGE_MODEL_SOURCE_VARIABLE:\s*\$\{\{\s*steps\.model\.outputs\.model_source_variable\s*\}\}/
  );
  assert.match(
    workflowText,
    /OPENAI_API_KEY:\s*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Stop on stage model validation failure[\s\S]*if:\s*steps\.model_preflight\.outcome == 'failure'/
  );
  assert.match(
    workflowText,
    /name:\s+Estimate stage cost[\s\S]*FACTORY_STAGE_MODEL:\s*\$\{\{\s*steps\.model\.outputs\.model\s*\}\}/
  );
});

test("factory stage workflow surfaces model validation failures ahead of downstream steps", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /failure_type:\s*\$\{\{\s*steps\.validate_context\.outputs\.failure_type \|\| steps\.model_preflight\.outputs\.failure_type \|\|/
  );
  assert.match(
    workflowText,
    /failure_message:\s*\$\{\{\s*steps\.validate_context\.outputs\.failure_message \|\| steps\.model_preflight\.outputs\.failure_message \|\|/
  );
});

test("factory stage workflow records estimated cost only after a successful push", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");
  const estimateIndex = workflowText.indexOf("name: Estimate stage cost");
  const codexIndex = workflowText.indexOf("name: Run Codex");
  const prepareIndex = workflowText.indexOf("name: Prepare stage output for push");
  const pushIndex = workflowText.indexOf("name: Push stage output");
  const recordIndex = workflowText.indexOf("name: Record cost estimate on pull request");

  assert.ok(estimateIndex >= 0);
  assert.ok(codexIndex > estimateIndex);
  assert.ok(prepareIndex > codexIndex);
  assert.ok(pushIndex > prepareIndex);
  assert.ok(recordIndex > pushIndex);

  assert.match(
    workflowText,
    /name:\s+Estimate stage cost[\s\S]*node scripts\/estimate-stage-cost\.mjs/
  );
  assert.match(workflowText, /FACTORY_COST_WARN_USD:\s*\$\{\{\s*vars\.FACTORY_COST_WARN_USD \|\| ''\s*\}\}/);
  assert.match(workflowText, /FACTORY_COST_HIGH_USD:\s*\$\{\{\s*vars\.FACTORY_COST_HIGH_USD \|\| ''\s*\}\}/);
  assert.match(
    workflowText,
    /name:\s+Prepare stage output for push[\s\S]*FACTORY_COST_SUMMARY_PATH:\s*\$\{\{\s*steps\.cost\.outputs\.cost_summary_path\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Record cost estimate on pull request[\s\S]*if:\s*inputs\.pr_number > 0 && steps\.push\.outcome == 'success'[\s\S]*FACTORY_ADD_LABELS:\s*\$\{\{\s*steps\.cost\.outputs\.cost_label_to_add\s*\}\}/
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
  assert.match(workflowText, /model:\s*\$\{\{\s*vars\.FACTORY_FAILURE_DIAGNOSIS_MODEL \|\| 'gpt-5-mini'\s*\}\}/);
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

test("factory intake finalize job checks out the planned factory branch before finalizing", () => {
  const workflowText = readWorkflowText("factory-intake.yml");
  const finalizeJob = extractJobBlock(workflowText, "finalize");

  assert.match(
    finalizeJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.prepare\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
  assert.match(
    finalizeJob,
    /name:\s+Finalize planning state[\s\S]*?run:\s+node scripts\/finalize-plan\.mjs/
  );
});
