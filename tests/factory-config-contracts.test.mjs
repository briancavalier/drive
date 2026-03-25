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

test("factory control-action reset clears canonical intervention state", () => {
  const workflowText = readWorkflowText("factory-control-action.yml");

  assert.match(
    workflowText,
    /name:\s+Reset factory PR[\s\S]*FACTORY_INTERVENTION:\s*"__CLEAR__"/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR[\s\S]*FACTORY_BLOCKED_ACTION:\s*""/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*remove_if_auto_applied/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.doesNotMatch(
    workflowText,
    /name:\s+Reset factory PR[\s\S]*FACTORY_(?:REPEATED_FAILURE_COUNT|LAST_FAILURE_SIGNATURE|LAST_FAILURE_TYPE|TRANSIENT_RETRY_ATTEMPTS|STAGE_NOOP_ATTEMPTS|STAGE_SETUP_ATTEMPTS):/
  );
});

test("factory control-action no longer exposes manual approve_self_modify dispatch", () => {
  const workflowText = readWorkflowText("factory-control-action.yml");

  assert.doesNotMatch(workflowText, /approve_self_modify/);
  assert.doesNotMatch(workflowText, /Approve self-modify/);
});

test("factory control-action escalate clears auto-applied self-modify authorization", () => {
  const workflowText = readWorkflowText("factory-control-action.yml");

  assert.match(
    workflowText,
    /name:\s+Escalate to human-only[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*remove_if_auto_applied/
  );
  assert.match(
    workflowText,
    /name:\s+Escalate to human-only[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Escalate to human-only[\s\S]*FACTORY_PENDING_STAGE_DECISION:\s*"__CLEAR__"/
  );
});

test("factory reset workflow clears canonical intervention state when repair state is reset", () => {
  const workflowText = readWorkflowText("factory-reset-pr.yml");

  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_INTERVENTION:\s*\$\{\{\s*inputs\.clear_repair_state && '__CLEAR__' \|\| '__UNCHANGED__'\s*\}\}/
  );
  assert.doesNotMatch(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_(?:REPEATED_FAILURE_COUNT|LAST_FAILURE_SIGNATURE|LAST_FAILURE_TYPE|TRANSIENT_RETRY_ATTEMPTS):/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*remove_if_auto_applied/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_PENDING_STAGE_DECISION:\s*\$\{\{\s*inputs\.clear_repair_state && '__CLEAR__' \|\| '__UNCHANGED__'\s*\}\}/
  );
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

test("factory PR loop uses intervention-named intermediate failure outputs", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(workflowText, /intervention_repeated_failure_count/);
  assert.match(workflowText, /intervention_failure_signature/);
  assert.match(workflowText, /FACTORY_INTERVENTION_REPEATED_FAILURE_COUNT/);
  assert.match(workflowText, /FACTORY_INTERVENTION_FAILURE_SIGNATURE/);
  assert.doesNotMatch(workflowText, /\brepeated_failure_count:\s*\$\{\{\s*steps\.route\.outputs\.repeated_failure_count/);
  assert.doesNotMatch(workflowText, /\blast_failure_signature:\s*\$\{\{\s*steps\.route\.outputs\.last_failure_signature/);
});

test("factory PR loop cleans up auto-applied self-modify authorization after stage transitions", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(
    workflowText,
    /name:\s+Record successful stage metadata[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*"remove_if_auto_applied"[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Record successful stage metadata[\s\S]*FACTORY_PENDING_STAGE_DECISION:\s*"__CLEAR__"/
  );
  assert.match(
    workflowText,
    /name:\s+Mark PR as blocked[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*"remove_if_auto_applied"[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Update PR metadata for review artifact repair[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*"remove_if_auto_applied"[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Record successful repair metadata[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*"remove_if_auto_applied"[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
});

test("factory PR loop reset clears auto-applied self-modify authorization", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_SELF_MODIFY_LABEL_ACTION:\s*"remove_if_auto_applied"[\s\S]*FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL:\s*"false"/
  );
  assert.match(
    workflowText,
    /name:\s+Reset factory PR state[\s\S]*FACTORY_PENDING_STAGE_DECISION:\s*"__CLEAR__"/
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

test("factory PR loop normalizes effective stage dispatch across direct and answered routes", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const resolveBlock = extractJobBlock(workflowText, "resolve-stage-dispatch");
  const stageBlock = extractJobBlock(workflowText, "stage");
  const stageSucceededBlock = extractJobBlock(workflowText, "stage-succeeded");
  const stageFailedBlock = extractJobBlock(workflowText, "stage-failed");
  const processReviewBlock = extractJobBlock(workflowText, "process-review");
  const reviewFailedBlock = extractJobBlock(workflowText, "review-processing-failed");

  assert.match(resolveBlock, /needs:\s*\n\s+- route\n\s+- answer-intervention/);
  assert.match(resolveBlock, /outputs:\s*\n\s+effective_action:\s*\$\{\{\s*steps\.resolve\.outputs\.effective_action\s*\}\}/);
  assert.match(resolveBlock, /effective_action="\$\{RESUME_ACTION:-\$\{ROUTE_ACTION:-\}\}"/);

  assert.match(stageBlock, /needs:\s*\n\s+- route\n\s+- mark-in-progress\n\s+- resolve-stage-dispatch/);
  assert.doesNotMatch(stageBlock, /needs:\s*[\s\S]*answer-intervention/);
  assert.match(stageBlock, /mode:\s*\$\{\{\s*needs\.resolve-stage-dispatch\.outputs\.effective_action\s*\}\}/);

  assert.match(stageSucceededBlock, /needs:\s*\n\s+- route\n\s+- stage\n\s+- resolve-stage-dispatch/);
  assert.doesNotMatch(stageSucceededBlock, /needs:\s*[\s\S]*answer-intervention/);
  assert.match(stageSucceededBlock, /FACTORY_LAST_COMPLETED_STAGE:\s*\$\{\{\s*needs\.resolve-stage-dispatch\.outputs\.effective_action == 'implement' && 'implement' \|\| 'repair'\s*\}\}/);

  assert.match(stageFailedBlock, /needs:\s*\n\s+- route\n\s+- stage\n\s+- resolve-stage-dispatch/);
  assert.doesNotMatch(stageFailedBlock, /needs:\s*[\s\S]*answer-intervention/);
  assert.match(stageFailedBlock, /FACTORY_FAILED_ACTION:\s*\$\{\{\s*needs\.resolve-stage-dispatch\.outputs\.effective_action\s*\}\}/);

  assert.match(processReviewBlock, /needs:\s*\n\s+- route\n\s+- stage\n\s+- resolve-stage-dispatch/);
  assert.doesNotMatch(processReviewBlock, /needs:\s*[\s\S]*mark-in-progress/);
  assert.doesNotMatch(processReviewBlock, /needs:\s*[\s\S]*answer-intervention/);
  assert.match(processReviewBlock, /needs\.resolve-stage-dispatch\.outputs\.effective_action == 'review'/);

  assert.match(reviewFailedBlock, /needs:\s*\n\s+- route\n\s+- process-review\n\s+- resolve-stage-dispatch/);
  assert.doesNotMatch(reviewFailedBlock, /needs:\s*[\s\S]*answer-intervention/);
  assert.match(reviewFailedBlock, /needs\.resolve-stage-dispatch\.outputs\.effective_action == 'review'/);
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

test("factory stage workflow gates the Codex CLI hybrid path by stage-specific flags", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /name:\s+Bootstrap Codex CLI hybrid[\s\S]*if:\s*\(inputs\.mode == 'plan' && vars\.FACTORY_ENABLE_CODEX_HYBRID_CANARY == 'true'\) \|\| \(inputs\.mode == 'implement' && vars\.FACTORY_ENABLE_CODEX_HYBRID_IMPLEMENT == 'true'\)[\s\S]*uses:\s+openai\/codex-action@v1/
  );
  assert.match(
    workflowText,
    /name:\s+Verify Codex CLI hybrid bootstrap[\s\S]*which codex[\s\S]*codex --version/
  );
  assert.match(
    workflowText,
    /name:\s+Execute Codex CLI hybrid[\s\S]*codex exec[\s\S]*--output-last-message[\s\S]*--full-auto[\s\S]*--sandbox workspace-write[\s\S]*--json/
  );
  assert.match(
    workflowText,
    /name:\s+Parse Codex CLI hybrid telemetry[\s\S]*node scripts\/parse-codex-json-telemetry\.mjs/
  );
  assert.match(
    workflowText,
    /name:\s+Upload Codex CLI hybrid artifacts[\s\S]*uses:\s+actions\/upload-artifact@v4[\s\S]*name:\s*codex-cli-telemetry-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.job\s*\}\}-\$\{\{\s*inputs\.mode\s*\}\}[\s\S]*\.factory\/tmp\/prompt\.md/
  );
  assert.match(
    workflowText,
    /name:\s+Bootstrap standard Codex execution[\s\S]*if:\s*\(inputs\.mode != 'plan' \|\| vars\.FACTORY_ENABLE_CODEX_HYBRID_CANARY != 'true'\) && \(inputs\.mode != 'implement' \|\| vars\.FACTORY_ENABLE_CODEX_HYBRID_IMPLEMENT != 'true'\)[\s\S]*uses:\s+openai\/codex-action@v1/
  );
  assert.match(
    workflowText,
    /name:\s+Stop on standard Codex bootstrap failure[\s\S]*steps\.codex_bootstrap_standard\.outcome == 'failure'/
  );
  assert.match(
    workflowText,
    /name:\s+Run Codex[\s\S]*if:\s*\(inputs\.mode != 'plan' \|\| vars\.FACTORY_ENABLE_CODEX_HYBRID_CANARY != 'true'\) && \(inputs\.mode != 'implement' \|\| vars\.FACTORY_ENABLE_CODEX_HYBRID_IMPLEMENT != 'true'\)[\s\S]*codex exec[\s\S]*--output-last-message[\s\S]*\.factory\/tmp\/prompt\.md[\s\S]*tee "\$codex_log"/
  );
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
    /failure_type:\s*\$\{\{\s*steps\.validate_context\.outputs\.failure_type \|\| steps\.model_preflight\.outputs\.failure_type \|\| steps\.refresh\.outputs\.failure_type \|\| steps\.codex_bootstrap_failure\.outputs\.failure_type \|\| steps\.codex_failure\.outputs\.failure_type \|\|/
  );
  assert.match(
    workflowText,
    /failure_message:\s*\$\{\{\s*steps\.validate_context\.outputs\.failure_message \|\| steps\.model_preflight\.outputs\.failure_message \|\| steps\.refresh\.outputs\.failure_message \|\| steps\.codex_bootstrap_failure\.outputs\.failure_message \|\| steps\.codex_failure\.outputs\.failure_message \|\|/
  );
});

test("factory stage workflow detects implement-stage intervention requests before push", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");

  assert.match(
    workflowText,
    /intervention_requested:\s*\n\s+description:\s+Indicates whether the stage requested a human intervention instead of producing output\.\s*\n\s+value:\s*\$\{\{\s*jobs\.run\.outputs\.intervention_requested\s*\}\}/
  );
  assert.match(
    workflowText,
    /intervention_payload:\s*\n\s+description:\s+Validated stage-authored intervention payload\.\s*\n\s+value:\s*\$\{\{\s*jobs\.run\.outputs\.intervention_payload\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Detect stage intervention request[\s\S]*node scripts\/detect-stage-intervention-request\.mjs/
  );
  assert.match(
    workflowText,
    /failure_type:\s*\$\{\{\s*steps\.validate_context\.outputs\.failure_type \|\| steps\.model_preflight\.outputs\.failure_type \|\| steps\.refresh\.outputs\.failure_type \|\| steps\.codex_bootstrap_failure\.outputs\.failure_type \|\| steps\.codex_failure\.outputs\.failure_type \|\| steps\.detect_intervention\.outputs\.failure_type \|\| steps\.prepare\.outputs\.failure_type \|\| steps\.push\.outputs\.failure_type\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Prepare stage output for push[\s\S]*if:\s*steps\.detect_intervention\.outputs\.intervention_requested != 'true'/
  );
  assert.match(
    workflowText,
    /name:\s+Push stage output[\s\S]*if:\s*steps\.detect_intervention\.outputs\.intervention_requested != 'true'/
  );
});

test("factory PR loop blocks implement PRs on stage intervention requests", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const stageSucceededBlock = extractJobBlock(workflowText, "stage-succeeded");
  const interventionBlock = extractJobBlock(workflowText, "block-on-stage-intervention");

  assert.match(stageSucceededBlock, /needs\.stage\.outputs\.intervention_requested != 'true'/);
  assert.match(interventionBlock, /needs\.stage\.outputs\.intervention_requested == 'true'/);
  assert.match(interventionBlock, /run: node scripts\/handle-stage-intervention-request\.mjs/);
  assert.match(
    interventionBlock,
    /FACTORY_INTERVENTION_REQUEST:\s*\$\{\{\s*needs\.stage\.outputs\.intervention_payload\s*\}\}/
  );
});

test("factory stage workflow records estimated cost only after a successful push", () => {
  const workflowText = readWorkflowText("_factory-stage.yml");
  const estimateIndex = workflowText.indexOf("name: Estimate stage cost");
  const hybridBootstrapIndex = workflowText.indexOf("name: Bootstrap Codex CLI hybrid");
  const hybridExecuteIndex = workflowText.indexOf("name: Execute Codex CLI hybrid");
  const codexIndex = workflowText.indexOf("name: Run Codex");
  const prepareIndex = workflowText.indexOf("name: Prepare stage output for push");
  const pushIndex = workflowText.indexOf("name: Push stage output");
  const actualIndex = workflowText.indexOf("name: Read actual stage telemetry for pull request");
  const recordIndex = workflowText.indexOf("name: Record cost estimate on pull request");

  assert.ok(estimateIndex >= 0);
  assert.ok(hybridBootstrapIndex > estimateIndex);
  assert.ok(hybridExecuteIndex > hybridBootstrapIndex);
  assert.ok(codexIndex > estimateIndex);
  assert.ok(prepareIndex > codexIndex);
  assert.ok(pushIndex > prepareIndex);
  assert.ok(actualIndex > pushIndex);
  assert.ok(recordIndex > pushIndex);

  assert.match(
    workflowText,
    /name:\s+Estimate stage cost[\s\S]*node scripts\/estimate-stage-cost\.mjs/
  );
  assert.match(workflowText, /FACTORY_COST_WARN_USD:\s*\$\{\{\s*vars\.FACTORY_COST_WARN_USD \|\| ''\s*\}\}/);
  assert.match(workflowText, /FACTORY_COST_HIGH_USD:\s*\$\{\{\s*vars\.FACTORY_COST_HIGH_USD \|\| ''\s*\}\}/);
  assert.match(
    workflowText,
    /name:\s+Prepare stage output for push[\s\S]*FACTORY_ENABLE_SELF_MODIFY:\s*\$\{\{\s*vars\.FACTORY_ENABLE_SELF_MODIFY \|\| ''\s*\}\}[\s\S]*FACTORY_COST_SUMMARY_PATH:\s*\$\{\{\s*steps\.cost\.outputs\.cost_summary_path\s*\}\}[\s\S]*FACTORY_STAGE_ACTUAL_USAGE_PATH:\s*\$\{\{\s*steps\.codex_json_telemetry\.outputs\.actual_usage_path\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Stop on Codex failure[\s\S]*steps\.codex\.outcome == 'failure'[\s\S]*inputs\.mode == 'implement' && vars\.FACTORY_ENABLE_CODEX_HYBRID_IMPLEMENT == 'true'/
  );
  assert.match(
    workflowText,
    /name:\s+Stop on Codex failure[\s\S]*node scripts\/extract-codex-failure\.mjs ".factory\/tmp\/codex-run\.log"[\s\S]*classifyFailure\(process\.argv\[1\] \|\| ""\)/
  );
  assert.match(
    workflowText,
    /name:\s+Read actual stage telemetry for pull request[\s\S]*run:\s*node scripts\/read-cost-summary-actuals\.mjs[\s\S]*FACTORY_ARTIFACTS_PATH:\s*\$\{\{\s*inputs\.artifacts_path\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Record cost estimate on pull request[\s\S]*if:\s*inputs\.pr_number > 0 && steps\.detect_intervention\.outputs\.intervention_requested != 'true' && steps\.push\.outcome == 'success'[\s\S]*FACTORY_ADD_LABELS:\s*\$\{\{\s*steps\.cost\.outputs\.cost_label_to_add\s*\}\}/
  );
  assert.match(
    workflowText,
    /name:\s+Record cost estimate on pull request[\s\S]*FACTORY_ACTUAL_API_SURFACE:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_api_surface\s*\}\}[\s\S]*FACTORY_ACTUAL_STAGE_COST_USD:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_stage_cost_usd\s*\}\}[\s\S]*FACTORY_ACTUAL_INPUT_TOKENS:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_input_tokens\s*\}\}[\s\S]*FACTORY_ACTUAL_CACHED_INPUT_TOKENS:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_cached_input_tokens\s*\}\}[\s\S]*FACTORY_ACTUAL_OUTPUT_TOKENS:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_output_tokens\s*\}\}[\s\S]*FACTORY_ACTUAL_REASONING_TOKENS:\s*\$\{\{\s*steps\.actual_cost\.outputs\.actual_reasoning_tokens\s*\}\}/
  );
  assert.match(workflowText, /name:\s+Budget preflight hook[\s\S]*Budget enforcement hook not configured/);
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
  assert.match(
    workflowText,
    /name:\s+Handle classified stage failure[\s\S]*FACTORY_REVIEW_ID:\s*\$\{\{\s*needs\.route\.outputs\.review_id\s*\}\}/
  );
});

test("factory PR loop failure jobs keep Codex diagnosis best-effort and out of repo-tracked temp paths", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");

  const codexSteps = workflowText.match(/name:\s+Run Codex failure diagnosis[\s\S]*?codex-args:\s+--full-auto/g) || [];
  assert.equal(codexSteps.length, 3);
  for (const step of codexSteps) {
    assert.match(step, /if:\s*steps\.diagnosis_gate\.outputs\.run_diagnosis == 'true'/);
    assert.match(step, /continue-on-error:\s*true/);
  }

  assert.doesNotMatch(workflowText, /prompt-file:\s*\.factory\/tmp\//);
  assert.doesNotMatch(workflowText, /FACTORY_FAILURE_ADVISORY_PATH:\s*\.factory\/tmp\//);
  const preflightHooks = workflowText.match(/name:\s+Budget preflight hook/g) || [];
  assert.equal(preflightHooks.length, 3);
});

test("factory PR loop failure jobs check out the failing branch before diagnosis", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const routeJob = extractJobBlock(workflowText, "route");
  const stageFailedJob = extractJobBlock(workflowText, "stage-failed");
  const reviewProcessingFailedJob = extractJobBlock(workflowText, "review-processing-failed");
  const reviewArtifactRepairFailedJob = extractJobBlock(workflowText, "review-artifact-repair-failed");

  assert.doesNotMatch(routeJob, /needs\.route\.outputs\.branch/);
  assert.match(
    stageFailedJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.route\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
  assert.match(
    reviewProcessingFailedJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.route\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
  assert.match(
    reviewArtifactRepairFailedJob,
    /name:\s+Checkout repository[\s\S]*?uses:\s+actions\/checkout@v4[\s\S]*?ref:\s*\$\{\{\s*needs\.route\.outputs\.branch\s*\}\}[\s\S]*?fetch-depth:\s*0/
  );
});

test("review failure jobs configure git identity and keep telemetry persistence best-effort", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const reviewProcessingFailedJob = extractJobBlock(workflowText, "review-processing-failed");
  const reviewArtifactRepairFailedJob = extractJobBlock(workflowText, "review-artifact-repair-failed");

  assert.match(reviewProcessingFailedJob, /permissions:\s*[\s\S]*contents:\s*write/);
  assert.match(reviewArtifactRepairFailedJob, /permissions:\s*[\s\S]*contents:\s*write/);
  assert.match(reviewProcessingFailedJob, /name:\s+Configure git identity/);
  assert.match(reviewArtifactRepairFailedJob, /name:\s+Configure git identity/);
  assert.match(reviewProcessingFailedJob, /name:\s+Commit usage events[\s\S]*continue-on-error:\s*true/);
  assert.match(reviewProcessingFailedJob, /name:\s+Push usage events[\s\S]*continue-on-error:\s*true/);
  assert.match(reviewArtifactRepairFailedJob, /name:\s+Commit usage events[\s\S]*continue-on-error:\s*true/);
  assert.match(reviewArtifactRepairFailedJob, /name:\s+Push usage events[\s\S]*continue-on-error:\s*true/);
});

test("review artifact repair jobs mirror stage success and failure handling", () => {
  const workflowText = readWorkflowText("factory-pr-loop.yml");
  const repairSucceededJob = extractJobBlock(workflowText, "review-artifact-repair-succeeded");
  const repairFailedJob = extractJobBlock(workflowText, "review-artifact-repair-failed");

  assert.match(
    repairSucceededJob,
    /FACTORY_INTERVENTION:\s*"__CLEAR__"/
  );
  assert.match(
    repairFailedJob,
    /FACTORY_FAILED_ACTION:\s*repair/
  );
  assert.match(
    repairFailedJob,
    /FACTORY_FAILURE_TYPE:\s*\$\{\{\s*needs\.review-artifact-repair\.outputs\.failure_type \|\| 'content_or_logic'\s*\}\}/
  );
  assert.match(
    repairFailedJob,
    /FACTORY_REPAIR_ATTEMPTS:\s*\$\{\{\s*needs\.review-processing-failed\.outputs\.repair_attempts\s*\}\}/
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

test("usage calibration workflow supports manual and weekly triggers and opens replacement PRs", () => {
  const workflowText = readWorkflowText("factory-update-usage-calibration.yml");

  assert.match(workflowText, /workflow_dispatch:/);
  assert.match(workflowText, /schedule:\s*\n\s*-\s+cron:\s*"0 15 \* \* 1"/);
  assert.match(
    workflowText,
    /permissions:\s*\n\s+contents:\s+write\n\s+pull-requests:\s+write/
  );
  assert.match(
    workflowText,
    /name:\s+Regenerate usage calibration[\s\S]*run:\s+node scripts\/calibrate-usage-estimates\.mjs/
  );
  assert.match(
    workflowText,
    /name:\s+Detect calibration diff[\s\S]*git diff --quiet -- \.factory\/usage-calibration\.json/
  );
  assert.match(
    workflowText,
    /name:\s+Stop when calibration is unchanged[\s\S]*Usage calibration unchanged; no PR created\./
  );
  assert.match(
    workflowText,
    /name:\s+Prepare calibration branch[\s\S]*automation\/usage-calibration-\$\(date -u \+%Y%m%d-%H%M%S\)/
  );
  assert.match(
    workflowText,
    /name:\s+Commit calibration update[\s\S]*git add \.factory\/usage-calibration\.json[\s\S]*git commit -m "factory: update usage calibration"/
  );
  assert.match(
    workflowText,
    /name:\s+Open calibration pull request[\s\S]*run:\s+node scripts\/manage-usage-calibration-pr\.mjs/
  );
});
