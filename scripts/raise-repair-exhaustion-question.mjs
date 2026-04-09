import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function optionalEnv(name, env = process.env, fallback = "") {
  const value = env[name];

  if (value === undefined || value === null) {
    return fallback;
  }

  return `${value}`.trim();
}

export async function main(env = process.env, dependencies = {}) {
  const execFileAsync = dependencies.execFileAsync || promisify(execFile);
  const prNumber = requiredEnv("FACTORY_PR_NUMBER", env);
  const interventionPayload = requiredEnv("FACTORY_REPAIR_QUESTION_INTERVENTION", env);
  const questionComment = requiredEnv("FACTORY_REPAIR_QUESTION_COMMENT", env);
  const repairAttempts = optionalEnv("FACTORY_REPAIR_ATTEMPTS", env, "0");
  const ciRunId = optionalEnv("FACTORY_CI_RUN_ID", env);
  const lastRunUrl =
    ciRunId && env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${ciRunId}`
      : "";
  const childEnv = {
    FACTORY_GITHUB_TOKEN: env.FACTORY_GITHUB_TOKEN || "",
    GITHUB_TOKEN: env.GITHUB_TOKEN || "",
    FACTORY_PR_NUMBER: prNumber,
    FACTORY_STATUS: "blocked",
    FACTORY_BLOCKED_ACTION: "repair",
    FACTORY_INTERVENTION: interventionPayload,
    FACTORY_COMMENT: questionComment,
    FACTORY_REPAIR_ATTEMPTS: repairAttempts,
    FACTORY_PENDING_STAGE_DECISION: "__UNCHANGED__",
    FACTORY_BUDGET_OVERRIDE: "__UNCHANGED__",
    FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
    FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false",
    FACTORY_CI_STATUS: "failure"
  };

  if (ciRunId) {
    childEnv.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID = ciRunId;
    childEnv.FACTORY_LAST_RUN_ID = ciRunId;
    childEnv.FACTORY_LAST_RUN_URL = lastRunUrl;
  }

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: childEnv,
    stdio: "inherit"
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
