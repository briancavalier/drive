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
const body = renderPrBody({
  issueNumber,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata: buildPlanReadyPrMetadata({
    metadata: {
      ...metadata,
      ...costMetadata
    },
    issueNumber,
    artifactsPath,
    preparedMaxRepairAttempts
  })
});
const pullRequest =
  existingPullRequest ||
  (await createPullRequest({
    title,
    head: branch,
    base: defaultBranch,
    body,
    draft: true
  }));

await updatePullRequest({ prNumber: pullRequest.number, body });
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
