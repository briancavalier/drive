import {
  APPROVED_ISSUE_FILE_NAME,
  PR_STATE_MARKER,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_PR_STATUSES,
  issueArtifactsPath
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
    blockedAction: null,
    lastReviewArtifactFailure: null,
    transientRetryAttempts: 0,
    lastRefreshedSha: null,
    pendingReviewSha: null,
    paused: false,
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

function normalizeIssueNumber(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function canonicalizePrMetadata(metadata = {}, issueNumber = metadata?.issueNumber) {
  const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
  const canonicalArtifactsPath = normalizedIssueNumber
    ? issueArtifactsPath(normalizedIssueNumber)
    : metadata.artifactsPath ?? null;

  return defaultPrMetadata({
    ...metadata,
    issueNumber: normalizedIssueNumber ?? metadata.issueNumber ?? null,
    artifactsPath: canonicalArtifactsPath
  });
}

export function buildPlanReadyPrMetadata({
  metadata = {},
  issueNumber,
  artifactsPath,
  preparedMaxRepairAttempts
}) {
  const nextMetadata = canonicalizePrMetadata(
    {
      ...metadata,
      status: FACTORY_PR_STATUSES.planReady
    },
    issueNumber
  );

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
  const nextMetadata = canonicalizePrMetadata(metadata, issueNumber);
  const resolvedIssueNumber = normalizeIssueNumber(issueNumber) ?? nextMetadata.issueNumber;
  const resolvedArtifactsPath = resolvedIssueNumber
    ? issueArtifactsPath(resolvedIssueNumber)
    : artifactsPath;

  return renderGithubPrBody({
    issueNumber: resolvedIssueNumber,
    branch,
    repositoryUrl,
    artifactsPath: resolvedArtifactsPath,
    metadata: nextMetadata,
    ciStatus
  }, options);
}
