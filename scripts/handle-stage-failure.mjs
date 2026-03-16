import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import {
  FAILURE_TYPES,
  parseRetryLimit
} from "./lib/failure-classification.mjs";

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function buildFailureComment({
  action,
  failureType,
  retryAttempts,
  failureMessage
}) {
  let message;

  if (failureType === FAILURE_TYPES.staleBranchConflict) {
    message =
      "Factory could not merge `origin/main` into this factory branch automatically. " +
      "Resolve the merge conflict on the branch, then re-run the factory stage.";
  } else if (failureType === FAILURE_TYPES.transientInfra) {
    message =
      `Factory exhausted ${retryAttempts} transient retry attempt(s) for this stage and is now blocked. ` +
      "Review the failed run for infrastructure details, then reset the PR to retry.";
  } else if (failureType === FAILURE_TYPES.configuration) {
    message =
      "Factory encountered a configuration error and is blocked pending operator intervention. " +
      `${failureMessage || "Review the failed run for details."}`;
  } else if (action === "implement") {
    message =
      "Factory implementation failed before producing a usable branch update. " +
      "Review the failed run and re-apply `factory:implement` after addressing the issue.";
  } else if (action === "review") {
    message =
      "Factory review stage failed before producing a decision. " +
      "Investigate the review artifacts and re-trigger the workflow after addressing the issue.";
  } else {
    message =
      "Factory repair failed before producing a usable branch update. " +
      "Human intervention is required.";
  }

  return `⚠️ ${message.trim()}`;
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
  const failureType = env.FACTORY_FAILURE_TYPE || FAILURE_TYPES.contentOrLogic;
  const prNumber = requiredEnv("FACTORY_PR_NUMBER", env);
  const retryAttempts = parseRetryLimit(env.FACTORY_TRANSIENT_RETRY_ATTEMPTS, 0);
  const { status, addLabels, removeLabels } = buildStateUpdate(action, failureType);
  const failureMessage = `${env.FACTORY_FAILURE_MESSAGE || ""}`.trim();
  const comment = buildFailureComment({
    action,
    failureType,
    retryAttempts,
    failureMessage
  });

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: {
      ...env,
      FACTORY_PR_NUMBER: prNumber,
      FACTORY_STATUS: status,
      FACTORY_ADD_LABELS: addLabels,
      FACTORY_REMOVE_LABELS: removeLabels,
      FACTORY_LAST_FAILURE_TYPE: failureType,
      FACTORY_TRANSIENT_RETRY_ATTEMPTS: `${retryAttempts}`,
      FACTORY_COMMENT: comment,
      FACTORY_CI_STATUS: env.FACTORY_CI_STATUS || "pending"
    },
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
