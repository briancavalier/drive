import { PR_STATE_MARKER, DEFAULT_MAX_REPAIR_ATTEMPTS } from "./factory-config.mjs";
import { renderPrBody as renderGithubPrBody } from "./github-messages.mjs";

export function defaultPrMetadata(overrides = {}) {
  return {
    issueNumber: null,
    artifactsPath: null,
    status: "planning",
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastFailureSignature: null,
    repeatedFailureCount: 0,
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
    spec: `${base}/spec.md`,
    plan: `${base}/plan.md`,
    acceptanceTests: `${base}/acceptance-tests.md`,
    repairLog: `${base}/repair-log.md`
  };
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
