import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import { readFailureAdvisory } from "./lib/failure-diagnosis.mjs";
import { buildFailureComment } from "./lib/failure-comment.mjs";
import {
  FAILURE_TYPES,
  parseRetryLimit
} from "./lib/failure-classification.mjs";

export { buildFailureComment } from "./lib/failure-comment.mjs";

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function buildStateUpdate(action, failureType) {
  if (action === "implement" && failureType === FAILURE_TYPES.contentOrLogic) {
    return {
      status: FACTORY_PR_STATUSES.planReady,
      addLabels: "factory:plan-ready",
      removeLabels: "factory:implement,factory:blocked"
    };
  }

  return {
    status: FACTORY_PR_STATUSES.blocked,
    addLabels: "factory:blocked",
    removeLabels: "factory:implement"
  };
}

export async function main(env = process.env) {
  const execFileAsync = promisify(execFile);
  const action = requiredEnv("FACTORY_FAILED_ACTION", env);
  const phase = `${env.FACTORY_FAILURE_PHASE || "stage"}`.trim() || "stage";
  const failureType = env.FACTORY_FAILURE_TYPE || FAILURE_TYPES.contentOrLogic;
  const prNumber = requiredEnv("FACTORY_PR_NUMBER", env);
  const retryAttempts = parseRetryLimit(env.FACTORY_TRANSIENT_RETRY_ATTEMPTS, 0);
  const { status, addLabels, removeLabels } = buildStateUpdate(action, failureType);
  const failureMessage = `${env.FACTORY_FAILURE_MESSAGE || ""}`.trim();
  const repositoryUrl =
    env.FACTORY_REPOSITORY_URL ||
    (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
      : "");
  const advisory = readFailureAdvisory(env.FACTORY_FAILURE_ADVISORY_PATH, {
    logger: console
  });
  const comment = buildFailureComment({
    action,
    phase,
    failureType,
    retryAttempts,
    failureMessage,
    runUrl: env.FACTORY_RUN_URL || "",
    branch: env.FACTORY_BRANCH || "",
    repositoryUrl,
    artifactsPath: env.FACTORY_ARTIFACTS_PATH || "",
    ciRunId: env.FACTORY_CI_RUN_ID || "",
    advisory
  });
  const childEnv = {
    ...env,
    FACTORY_PR_NUMBER: prNumber,
    FACTORY_STATUS: status,
    FACTORY_ADD_LABELS: addLabels,
    FACTORY_REMOVE_LABELS: removeLabels,
    FACTORY_LAST_FAILURE_TYPE: failureType,
    FACTORY_TRANSIENT_RETRY_ATTEMPTS: `${retryAttempts}`,
    FACTORY_COMMENT: comment,
    FACTORY_CI_STATUS: env.FACTORY_CI_STATUS || "pending"
  };

  if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== undefined) {
    childEnv.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID =
      env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID;
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
