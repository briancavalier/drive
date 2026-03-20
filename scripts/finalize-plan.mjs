import path from "node:path";
import { fileURLToPath } from "node:url";
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
  removeLabel,
  updatePullRequest
} from "./lib/github.mjs";

export async function finalizePlan({
  env = process.env,
  getIssueImpl = getIssue,
  getPullRequestImpl = getPullRequest,
  findOpenPullRequestByHeadImpl = findOpenPullRequestByHead,
  createPullRequestImpl = createPullRequest,
  updatePullRequestImpl = updatePullRequest,
  addLabelsImpl = addLabels,
  removeLabelImpl = removeLabel,
  commentOnIssueImpl = commentOnIssue,
  loadExistingCostSummaryImpl = loadExistingCostSummary,
  buildCostMetadataFromSummaryImpl = buildCostMetadataFromSummary,
  buildCostLabelUpdateImpl = buildCostLabelUpdate,
  renderPlanReadyIssueCommentImpl = renderPlanReadyIssueComment,
  buildPlanReadyPrMetadataImpl = buildPlanReadyPrMetadata,
  defaultPrMetadataImpl = defaultPrMetadata,
  extractPrMetadataImpl = extractPrMetadata,
  renderPrBodyImpl = renderPrBody
} = {}) {
  const issueNumber = Number(env.FACTORY_ISSUE_NUMBER);
  const inputPrNumber = Number(env.FACTORY_PR_NUMBER);
  const branch = env.FACTORY_BRANCH;
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH;
  const preparedMaxRepairAttempts =
    Number(env.FACTORY_MAX_REPAIR_ATTEMPTS) || DEFAULT_MAX_REPAIR_ATTEMPTS;
  const defaultBranch = env.GITHUB_REF_NAME || "main";
  const issue = await getIssueImpl(issueNumber);
  const repositoryUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  const existingPullRequest =
    inputPrNumber > 0
      ? await getPullRequestImpl(inputPrNumber)
      : await findOpenPullRequestByHeadImpl(branch);
  const metadata = extractPrMetadataImpl(existingPullRequest?.body) || defaultPrMetadataImpl();
  const costSummary = loadExistingCostSummaryImpl(artifactsPath);
  const costMetadata = costSummary ? buildCostMetadataFromSummaryImpl(costSummary) : {};
  const title = `Factory: ${`${issue.title || ""}`.replace(/^\[factory\]\s*/i, "").trim() || issue.title}`;
  const planReadyMetadata = buildPlanReadyPrMetadataImpl({
    metadata: {
      ...metadata,
      ...costMetadata
    },
    issueNumber,
    artifactsPath,
    preparedMaxRepairAttempts
  });
  const initialLabels = existingPullRequest?.labels ?? [];
  const initialBody = renderPrBodyImpl({
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
    (await createPullRequestImpl({
      title,
      head: branch,
      base: defaultBranch,
      body: initialBody,
      draft: true
    }));

  const resolvedLabels = pullRequest.labels ?? initialLabels;
  const finalBody = renderPrBodyImpl({
    issueNumber,
    prNumber: pullRequest.number,
    branch,
    repositoryUrl,
    artifactsPath,
    metadata: planReadyMetadata,
    labels: resolvedLabels
  });

  await updatePullRequestImpl({ prNumber: pullRequest.number, body: finalBody });
  const nextCostLabel = costSummary ? buildCostLabelUpdateImpl(costSummary).addLabel : "";

  for (const label of FACTORY_COST_LABELS) {
    if (label !== nextCostLabel) {
      await removeLabelImpl(pullRequest.number, label);
    }
  }
  await addLabelsImpl(
    pullRequest.number,
    [FACTORY_LABELS.managed, FACTORY_LABELS.planReady, nextCostLabel].filter(Boolean)
  );
  await commentOnIssueImpl(
    issueNumber,
    renderPlanReadyIssueCommentImpl({
      prNumber: pullRequest.number
    })
  );
}

export async function main() {
  await finalizePlan();
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
