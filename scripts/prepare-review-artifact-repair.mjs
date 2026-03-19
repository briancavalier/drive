import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs as defaultSetOutputs } from "./lib/actions-output.mjs";
import { FAILURE_TYPES } from "./lib/failure-classification.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import { getPullRequest as defaultGetPullRequest } from "./lib/github.mjs";
import { nextRepairState } from "./lib/repair-state.mjs";

function requiredEnv(name, env) {
  const value = `${env?.[name] ?? ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function buildFailureSignature({ failureType, failurePhase, failureMessage }) {
  return `review_artifact:${failureType}:${failurePhase}:${failureMessage || ""}`;
}

export async function prepareReviewArtifactRepair({
  env = process.env,
  dependencies = {}
} = {}) {
  const prNumberRaw = requiredEnv("FACTORY_PR_NUMBER", env);
  const failureType = requiredEnv("FACTORY_FAILURE_TYPE", env);
  const failurePhase = `${env.FACTORY_FAILURE_PHASE || ""}`.trim() || "review";
  const failureMessage = `${env.FACTORY_FAILURE_MESSAGE || ""}`.trim();
  const prNumber = Number(prNumberRaw);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("FACTORY_PR_NUMBER must be a positive integer");
  }

  if (failureType !== FAILURE_TYPES.reviewArtifactContract) {
    throw new Error(
      `prepare-review-artifact-repair requires FACTORY_FAILURE_TYPE "${FAILURE_TYPES.reviewArtifactContract}"`
    );
  }

  const getPullRequest = dependencies.getPullRequest || defaultGetPullRequest;
  const setOutputs = dependencies.setOutputs || defaultSetOutputs;
  const pullRequest = await getPullRequest(prNumber);
  const metadata = extractPrMetadata(pullRequest?.body) || {};
  const signature = buildFailureSignature({ failureType, failurePhase, failureMessage });
  const repairState = nextRepairState(metadata, signature);
  const failureMetadata = {
    type: failureType,
    phase: failurePhase,
    message: failureMessage,
    capturedAt: new Date().toISOString()
  };

  setOutputs({
    repair_attempts: String(repairState.repairAttempts),
    repeated_failure_count: String(repairState.repeatedFailureCount),
    last_failure_signature: repairState.lastFailureSignature || "",
    blocked: repairState.blocked ? "true" : "false",
    failure_metadata: JSON.stringify(failureMetadata)
  });

  return {
    repairState,
    failureMetadata
  };
}

export async function main(env = process.env) {
  await prepareReviewArtifactRepair({ env });
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
