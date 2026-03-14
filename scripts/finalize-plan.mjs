import {
  FACTORY_LABELS,
  DEFAULT_MAX_REPAIR_ATTEMPTS
} from "./lib/factory-config.mjs";
import { extractPrMetadata, renderPrBody } from "./lib/pr-metadata.mjs";
import {
  addLabels,
  commentOnIssue,
  getPullRequest,
  removeLabel,
  updatePullRequest
} from "./lib/github.mjs";

const issueNumber = Number(process.env.FACTORY_ISSUE_NUMBER);
const prNumber = Number(process.env.FACTORY_PR_NUMBER);
const branch = process.env.FACTORY_BRANCH;
const artifactsPath = process.env.FACTORY_ARTIFACTS_PATH;

const pullRequest = await getPullRequest(prNumber);
const metadata = extractPrMetadata(pullRequest.body) || {};
const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
const body = renderPrBody({
  issueNumber,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata: {
    ...metadata,
    issueNumber,
    artifactsPath,
    status: "plan_ready",
    maxRepairAttempts:
      metadata.maxRepairAttempts || DEFAULT_MAX_REPAIR_ATTEMPTS
  }
});

await updatePullRequest({ prNumber, body });
await addLabels(prNumber, [FACTORY_LABELS.managed, FACTORY_LABELS.planReady]);
await removeLabel(issueNumber, FACTORY_LABELS.start);
await commentOnIssue(
  issueNumber,
  `Factory planning is ready in PR #${prNumber}. Review the draft PR and apply \`${FACTORY_LABELS.implement}\` to start coding.`
);
