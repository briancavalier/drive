import { PR_STATE_MARKER, DEFAULT_MAX_REPAIR_ATTEMPTS } from "./factory-config.mjs";

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
}) {
  const state = defaultPrMetadata({
    issueNumber,
    artifactsPath,
    ...metadata
  });
  const links = buildArtifactLinks({ repositoryUrl, branch, artifactsPath });

  return [
    "# Factory Run",
    "",
    `Linked issue: #${issueNumber}`,
    "",
    "## Status",
    `- Stage: ${state.status}`,
    `- CI: ${ciStatus}`,
    `- Repair attempts: ${state.repairAttempts}/${state.maxRepairAttempts}`,
    "",
    "## Artifacts",
    `- [spec.md](${links.spec})`,
    `- [plan.md](${links.plan})`,
    `- [acceptance-tests.md](${links.acceptanceTests})`,
    `- [repair-log.md](${links.repairLog})`,
    "",
    "## Operator Notes",
    "- Apply `factory:implement` to start coding after plan review.",
    "- Apply `factory:paused` to pause autonomous work.",
    "- Remove `factory:paused` and re-apply `factory:implement` to resume.",
    "",
    `<!-- ${PR_STATE_MARKER}`,
    JSON.stringify(state, null, 2),
    "-->"
  ].join("\n");
}
