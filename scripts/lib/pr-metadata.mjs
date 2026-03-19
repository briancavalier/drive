import {
  APPROVED_ISSUE_FILE_NAME,
  PR_STATE_MARKER,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_PR_STATUSES
} from "./factory-config.mjs";
import { renderPrBody as renderGithubPrBody } from "./github-messages.mjs";

export function defaultPrMetadata(overrides = {}) {
  return {
    issueNumber: null,
    artifactsPath: null,
    status: FACTORY_PR_STATUSES.planning,
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastFailureSignature: null,
    repeatedFailureCount: 0,
    lastReadySha: null,
    lastProcessedWorkflowRunId: null,
    lastFailureType: null,
    lastReviewArtifactFailure: null,
    transientRetryAttempts: 0,
    lastRefreshedSha: null,
    pendingReviewSha: null,
    costEstimateUsd: 0,
    costEstimateBand: "",
    costEstimateEmoji: "",
    costWarnUsd: 0,
    costHighUsd: 0,
    costPricingSource: "",
    lastEstimatedStage: null,
    lastEstimatedModel: null,
    lastStageCostEstimateUsd: 0,
    stageNoopAttempts: 0,
    stageSetupAttempts: 0,
    ...overrides
  };
}

export function extractPrMetadata(body) {
  const content = `${body || ""}`;
  const pattern = new RegExp(
    `<!--\\s*${PR_STATE_MARKER}\\s*([\\s\\S]*?)\\s*-->`,
    "m"
  );
  const match = content.match(pattern);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

export function buildArtifactLinks({ repositoryUrl, branch, artifactsPath }) {
  const base = `${repositoryUrl}/blob/${branch}/${artifactsPath}`;

  return {
    approvedIssue: `${base}/${APPROVED_ISSUE_FILE_NAME}`,
    spec: `${base}/spec.md`,
    plan: `${base}/plan.md`,
    acceptanceTests: `${base}/acceptance-tests.md`,
    repairLog: `${base}/repair-log.md`,
    costSummary: `${base}/cost-summary.json`,
    review: `${base}/review.md`,
    reviewJson: `${base}/review.json`
  };
}

export function buildPlanReadyPrMetadata({
  metadata = {},
  issueNumber,
  artifactsPath,
  preparedMaxRepairAttempts
}) {
  const nextMetadata = defaultPrMetadata({
    ...metadata,
    issueNumber,
    artifactsPath,
    status: FACTORY_PR_STATUSES.planReady
  });

  if (metadata.maxRepairAttempts == null && preparedMaxRepairAttempts != null) {
    nextMetadata.maxRepairAttempts = preparedMaxRepairAttempts;
  }

  return nextMetadata;
}

export function renderPrBody({
  issueNumber,
  branch,
  repositoryUrl,
  artifactsPath,
  metadata,
  ciStatus = "pending"
}, options = {}) {
  return renderGithubPrBody({
    issueNumber,
    branch,
    repositoryUrl,
    artifactsPath,
    metadata,
    ciStatus
  }, options);
}
