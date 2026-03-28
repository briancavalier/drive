import {
  APPROVED_ISSUE_FILE_NAME,
  PR_STATE_MARKER,
  FACTORY_PR_STATUSES,
  issueArtifactsPath
} from "./factory-config.mjs";
import { renderPrBody as renderGithubPrBody } from "./github-messages.mjs";
import {
  defaultApprovalIntervention,
  canonicalizeIntervention,
  canonicalizePrMetadataShape,
  defaultFailureIntervention,
  defaultQuestionIntervention,
  defaultPrMetadata as defaultPrMetadataShape
} from "./pr-metadata-shape.mjs";

export function defaultPrMetadata(overrides = {}) {
  return defaultPrMetadataShape(overrides);
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

export function buildArtifactLinks({ repositoryUrl, branch, artifactsPath, artifactRef }) {
  const normalizedArtifactRef = `${artifactRef ?? ""}`.trim();
  const ref = normalizedArtifactRef || branch;
  const base = `${repositoryUrl}/blob/${ref}/${artifactsPath}`;

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
  return canonicalizePrMetadataShape(metadata, issueNumber);
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

  if (!nextMetadata.lastCompletedStage) {
    nextMetadata.lastCompletedStage = "plan";
  }

  if (metadata.maxRepairAttempts == null && preparedMaxRepairAttempts != null) {
    nextMetadata.maxRepairAttempts = preparedMaxRepairAttempts;
  }

  return nextMetadata;
}

export function renderPrBody({
  issueNumber,
  prNumber,
  branch,
  repositoryUrl,
  artifactsPath,
  artifactRef,
  metadata,
  ciStatus = "pending",
  labels = []
}, options = {}) {
  const nextMetadata = canonicalizePrMetadata(
    {
      ...metadata,
      artifactRef: artifactRef !== undefined ? artifactRef : metadata?.artifactRef
    },
    issueNumber
  );
  const resolvedIssueNumber = normalizeIssueNumber(issueNumber) ?? nextMetadata.issueNumber;
  const resolvedArtifactsPath = resolvedIssueNumber
    ? issueArtifactsPath(resolvedIssueNumber)
    : artifactsPath;

  return renderGithubPrBody({
    issueNumber: resolvedIssueNumber,
    prNumber: prNumber ?? null,
    branch,
    repositoryUrl,
    artifactsPath: resolvedArtifactsPath,
    artifactRef: nextMetadata.artifactRef,
    metadata: nextMetadata,
    ciStatus,
    labels
  }, options);
}

export {
  canonicalizeIntervention,
  defaultApprovalIntervention,
  defaultFailureIntervention,
  defaultQuestionIntervention
};
