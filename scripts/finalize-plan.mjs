import {
  FACTORY_LABELS,
  FACTORY_COST_LABELS,
  DEFAULT_MAX_REPAIR_ATTEMPTS
} from "./lib/factory-config.mjs";
import {
  buildCostLabelUpdate,
  buildCostMetadataFromSummary,
  loadExistingCostSummary
} from "./lib/cost-estimation.mjs";
import { renderPlanReadyIssueComment } from "./lib/github-messages.mjs";
import {
  buildPlanReadyPrMetadata,
  defaultPrMetadata,
  extractPrMetadata,
  renderPrBody
} from "./lib/pr-metadata.mjs";
import {
  addLabels,
  commentOnIssue,
  createPullRequest,
  findOpenPullRequestByHead,
  getIssue,
  getPullRequest,
  updatePullRequest
} from "./lib/github.mjs";

const issueNumber = Number(process.env.FACTORY_ISSUE_NUMBER);
const inputPrNumber = Number(process.env.FACTORY_PR_NUMBER);
const branch = process.env.FACTORY_BRANCH;
const artifactsPath = process.env.FACTORY_ARTIFACTS_PATH;
const preparedMaxRepairAttempts =
  Number(process.env.FACTORY_MAX_REPAIR_ATTEMPTS) || DEFAULT_MAX_REPAIR_ATTEMPTS;
const defaultBranch = process.env.GITHUB_REF_NAME || "main";
const issue = await getIssue(issueNumber);
const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
const existingPullRequest =
  inputPrNumber > 0
    ? await getPullRequest(inputPrNumber)
    : await findOpenPullRequestByHead(branch);
const metadata = extractPrMetadata(existingPullRequest?.body) || defaultPrMetadata();
const costSummary = loadExistingCostSummary(artifactsPath);
const costMetadata = costSummary ? buildCostMetadataFromSummary(costSummary) : {};
const title = `Factory: ${`${issue.title || ""}`.replace(/^\[factory\]\s*/i, "").trim() || issue.title}`;
const planReadyMetadata = buildPlanReadyPrMetadata({
  metadata: {
    ...metadata,
    ...costMetadata
  },
  issueNumber,
  artifactsPath,
  preparedMaxRepairAttempts
});
const initialLabels = existingPullRequest?.labels ?? [];
const initialBody = renderPrBody({
  issueNumber,
  prNumber: existingPullRequest?.number ?? null,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata: planReadyMetadata,
  labels: initialLabels
});
const pullRequest =
  existingPullRequest ||
  (await createPullRequest({
    title,
    head: branch,
    base: defaultBranch,
    body: initialBody,
    draft: true
  }));

const resolvedLabels = pullRequest.labels ?? initialLabels;
const finalBody = renderPrBody({
  issueNumber,
  prNumber: pullRequest.number,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata: planReadyMetadata,
  labels: resolvedLabels
});

await updatePullRequest({ prNumber: pullRequest.number, body: finalBody });
const nextCostLabel = costSummary ? buildCostLabelUpdate(costSummary).addLabel : "";

for (const label of FACTORY_COST_LABELS) {
  if (label !== nextCostLabel) {
    await removeLabel(pullRequest.number, label);
  }
}

await addLabels(
  pullRequest.number,
  [FACTORY_LABELS.managed, FACTORY_LABELS.planReady, nextCostLabel].filter(Boolean)
);
await commentOnIssue(
  issueNumber,
  renderPlanReadyIssueComment({
    prNumber: pullRequest.number
  })
);
