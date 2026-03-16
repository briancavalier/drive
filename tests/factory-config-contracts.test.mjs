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
