import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FACTORY_LABELS,
  assertFactoryPrStatus
} from "./lib/factory-config.mjs";
import { extractPrMetadata, renderPrBody } from "./lib/pr-metadata.mjs";
import {
  addLabels,
  commentOnIssue,
  convertPullRequestToDraft,
  getPullRequest,
  markReadyForReview,
  removeLabel,
  updatePullRequest
} from "./lib/github.mjs";

function csv(input) {
  return `${input || ""}`
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBoolean(input) {
  return `${input || ""}`.toLowerCase() === "true";
}

export function resolveNextStatus(metadataStatus, envStatus) {
  const requestedStatus = `${envStatus || ""}`.trim();

  if (requestedStatus) {
    return assertFactoryPrStatus(requestedStatus, "FACTORY_STATUS");
  }

  return assertFactoryPrStatus(metadataStatus, "existing PR metadata status");
}

export function applyTransientRetryAttempts(metadata, envValue) {
  const nextMetadata = {
    ...metadata
  };

  if (envValue !== undefined) {
    const transientRetryAttempts = `${envValue || ""}`.trim();

    if (transientRetryAttempts && transientRetryAttempts !== "__UNCHANGED__") {
      nextMetadata.transientRetryAttempts = Number(transientRetryAttempts);
    }
  }

  return nextMetadata;
}

export async function main(env = process.env) {
  const prNumber = Number(env.FACTORY_PR_NUMBER);
  const pullRequest = await getPullRequest(prNumber);
  const metadata = extractPrMetadata(pullRequest.body) || {};
  const repositoryUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  let nextMetadata = {
    ...metadata,
    status: resolveNextStatus(metadata.status, env.FACTORY_STATUS)
  };

  if (env.FACTORY_REPAIR_ATTEMPTS !== undefined) {
    nextMetadata.repairAttempts = Number(env.FACTORY_REPAIR_ATTEMPTS);
  }

  if (
    env.FACTORY_LAST_FAILURE_SIGNATURE !== undefined &&
    env.FACTORY_LAST_FAILURE_SIGNATURE !== "__UNCHANGED__"
  ) {
    nextMetadata.lastFailureSignature =
      env.FACTORY_LAST_FAILURE_SIGNATURE || null;
  }

  if (env.FACTORY_REPEATED_FAILURE_COUNT !== undefined) {
    nextMetadata.repeatedFailureCount = Number(
      env.FACTORY_REPEATED_FAILURE_COUNT
    );
  }

  if (env.FACTORY_LAST_READY_SHA !== undefined) {
    if (env.FACTORY_LAST_READY_SHA !== "__UNCHANGED__") {
      nextMetadata.lastReadySha = env.FACTORY_LAST_READY_SHA || null;
    }
  }

  if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== undefined) {
    if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== "__UNCHANGED__") {
      nextMetadata.lastProcessedWorkflowRunId =
        env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID || null;
    }
  }

  if (env.FACTORY_LAST_FAILURE_TYPE !== undefined) {
    if (env.FACTORY_LAST_FAILURE_TYPE !== "__UNCHANGED__") {
      nextMetadata.lastFailureType = env.FACTORY_LAST_FAILURE_TYPE || null;
    }
  }

  nextMetadata = applyTransientRetryAttempts(
    nextMetadata,
    env.FACTORY_TRANSIENT_RETRY_ATTEMPTS
  );

  if (env.FACTORY_LAST_REFRESHED_SHA !== undefined) {
    if (env.FACTORY_LAST_REFRESHED_SHA !== "__UNCHANGED__") {
      nextMetadata.lastRefreshedSha = env.FACTORY_LAST_REFRESHED_SHA || null;
    }
  }

  const body = renderPrBody({
    issueNumber: nextMetadata.issueNumber,
    branch: pullRequest.head.ref,
    repositoryUrl,
    artifactsPath: nextMetadata.artifactsPath,
    metadata: nextMetadata,
    ciStatus: env.FACTORY_CI_STATUS || "pending"
  });

  await updatePullRequest({ prNumber, body });

  for (const label of csv(env.FACTORY_ADD_LABELS)) {
    await addLabels(prNumber, [label]);
  }

  for (const label of csv(env.FACTORY_REMOVE_LABELS)) {
    await removeLabel(prNumber, label);
  }

  if (parseBoolean(env.FACTORY_READY_FOR_REVIEW) && pullRequest.draft) {
    await markReadyForReview(pullRequest.node_id);
  }

  if (parseBoolean(env.FACTORY_CONVERT_TO_DRAFT) && !pullRequest.draft) {
    await convertPullRequestToDraft(pullRequest.node_id);
  }

  if (env.FACTORY_COMMENT) {
    await commentOnIssue(prNumber, env.FACTORY_COMMENT);
  }

  if (parseBoolean(env.FACTORY_CLEAR_IMPLEMENT_LABEL)) {
    await removeLabel(prNumber, FACTORY_LABELS.implement);
  }
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
