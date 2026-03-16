import { promisify } from "node:util";
import { execFile } from "node:child_process";
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

function buildFailureComment({ action, failureType, retryAttempts, failureMessage }) {
  if (failureType === FAILURE_TYPES.staleBranchConflict) {
    return (
      "Factory could not merge `origin/main` into this factory branch automatically. " +
      "Resolve the merge conflict on the branch, then re-run the factory stage."
    );
  }

  if (failureType === FAILURE_TYPES.transientInfra) {
    return (
      `Factory exhausted ${retryAttempts} transient retry attempt(s) for this stage and is now blocked. ` +
      "Review the failed run for infrastructure details, then reset the PR to retry."
    );
  }

  if (failureType === FAILURE_TYPES.configuration) {
    return (
      "Factory encountered a configuration error and is blocked pending operator intervention. " +
      `${failureMessage || "Review the failed run for details."}`
    ).trim();
  }

  if (action === "implement") {
    return (
      "Factory implementation failed before producing a usable branch update. " +
      "Review the failed run and re-apply `factory:implement` after addressing the issue."
    );
  }

  if (action === "review") {
    return (
      "Factory review stage failed before producing a decision. " +
      "Investigate the review artifacts and re-trigger the workflow after addressing the issue."
    );
  }

  return (
    "Factory repair failed before producing a usable branch update. " +
    "Human intervention is required."
  );
}

function buildStateUpdate(action, failureType) {
  if (action === "implement" && failureType === FAILURE_TYPES.contentOrLogic) {
    return {
      status: "plan_ready",
      addLabels: "factory:plan-ready",
      removeLabels: "factory:implement,factory:blocked"
    };
  }

  return {
    status: "blocked",
    addLabels: "factory:blocked",
    removeLabels: "factory:implement"
  };
}

async function main(env = process.env) {
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

await main();
