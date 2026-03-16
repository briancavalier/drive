import {
  FACTORY_LABELS,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_PR_STATUSES
} from "./lib/factory-config.mjs";
import { defaultPrMetadata, extractPrMetadata, renderPrBody } from "./lib/pr-metadata.mjs";
import {
  addLabels,
  commentOnIssue,
  createPullRequest,
  findOpenPullRequestByHead,
  getIssue,
  getPullRequest,
  removeLabel,
  updatePullRequest
} from "./lib/github.mjs";

const issueNumber = Number(process.env.FACTORY_ISSUE_NUMBER);
const inputPrNumber = Number(process.env.FACTORY_PR_NUMBER);
const branch = process.env.FACTORY_BRANCH;
const artifactsPath = process.env.FACTORY_ARTIFACTS_PATH;
const defaultBranch = process.env.GITHUB_REF_NAME || "main";
const issue = await getIssue(issueNumber);
const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
const existingPullRequest =
  inputPrNumber > 0
    ? await getPullRequest(inputPrNumber)
    : await findOpenPullRequestByHead(branch);
const metadata = extractPrMetadata(existingPullRequest?.body) || defaultPrMetadata();
const title = `Factory: ${`${issue.title || ""}`.replace(/^\[factory\]\s*/i, "").trim() || issue.title}`;
const body = renderPrBody({
  issueNumber,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata: {
    ...metadata,
    issueNumber,
    artifactsPath,
    status: FACTORY_PR_STATUSES.planReady,
    maxRepairAttempts:
      metadata.maxRepairAttempts || DEFAULT_MAX_REPAIR_ATTEMPTS
  }
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
await addLabels(pullRequest.number, [FACTORY_LABELS.managed, FACTORY_LABELS.planReady]);
await removeLabel(issueNumber, FACTORY_LABELS.start);
await commentOnIssue(
  issueNumber,
  `Factory planning is ready in PR #${pullRequest.number}. Review the draft PR and apply \`${FACTORY_LABELS.implement}\` to start coding.`
);
