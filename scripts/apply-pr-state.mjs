import { FACTORY_LABELS } from "./lib/factory-config.mjs";
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

const prNumber = Number(process.env.FACTORY_PR_NUMBER);
const pullRequest = await getPullRequest(prNumber);
const metadata = extractPrMetadata(pullRequest.body) || {};
const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
const nextMetadata = {
  ...metadata,
  status: process.env.FACTORY_STATUS || metadata.status
};

if (process.env.FACTORY_REPAIR_ATTEMPTS !== undefined) {
  nextMetadata.repairAttempts = Number(process.env.FACTORY_REPAIR_ATTEMPTS);
}

if (
  process.env.FACTORY_LAST_FAILURE_SIGNATURE !== undefined &&
  process.env.FACTORY_LAST_FAILURE_SIGNATURE !== "__UNCHANGED__"
) {
  nextMetadata.lastFailureSignature =
    process.env.FACTORY_LAST_FAILURE_SIGNATURE || null;
}

if (process.env.FACTORY_REPEATED_FAILURE_COUNT !== undefined) {
  nextMetadata.repeatedFailureCount = Number(
    process.env.FACTORY_REPEATED_FAILURE_COUNT
  );
}

const body = renderPrBody({
  issueNumber: nextMetadata.issueNumber,
  branch: pullRequest.head.ref,
  repositoryUrl,
  artifactsPath: nextMetadata.artifactsPath,
  metadata: nextMetadata,
  ciStatus: process.env.FACTORY_CI_STATUS || "pending"
});

await updatePullRequest({ prNumber, body });

for (const label of csv(process.env.FACTORY_ADD_LABELS)) {
  await addLabels(prNumber, [label]);
}

for (const label of csv(process.env.FACTORY_REMOVE_LABELS)) {
  await removeLabel(prNumber, label);
}

if (parseBoolean(process.env.FACTORY_READY_FOR_REVIEW) && pullRequest.draft) {
  await markReadyForReview(pullRequest.node_id);
}

if (parseBoolean(process.env.FACTORY_CONVERT_TO_DRAFT) && !pullRequest.draft) {
  await convertPullRequestToDraft(pullRequest.node_id);
}

if (process.env.FACTORY_COMMENT) {
  await commentOnIssue(prNumber, process.env.FACTORY_COMMENT);
}

if (parseBoolean(process.env.FACTORY_CLEAR_IMPLEMENT_LABEL)) {
  await removeLabel(prNumber, FACTORY_LABELS.implement);
}
