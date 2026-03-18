import crypto from "node:crypto";

export const FOLLOWUP_CATEGORIES = Object.freeze({
  controlPlane: "control_plane",
  artifactContract: "artifact_contract",
  configuration: "configuration"
});

export const INELIGIBLE_FAILURE_TYPES = new Set([
  "transient_infra",
  "stale_branch_conflict",
  "stale_stage_push",
  "stage_noop"
]);

export const ACTIONABLE_MESSAGE_PATTERNS = [
  {
    id: "missing_review_json",
    regex: /missing\s+review\.json/i,
    category: FOLLOWUP_CATEGORIES.artifactContract
  },
  {
    id: "canonical_traceability",
    regex: /canonical\s+traceability/i,
    category: FOLLOWUP_CATEGORIES.artifactContract
  },
  {
    id: "artifact_contract",
    regex: /artifact\s+contract/i,
    category: FOLLOWUP_CATEGORIES.artifactContract
  },
  {
    id: "missing_factory_env",
    regex: /\bFACTORY_[A-Z0-9_]+\b[^\n]*(?:missing|required|unset|not\s+set)/i,
    category: FOLLOWUP_CATEGORIES.configuration
  },
  {
    id: "stage_push_guardrail",
    regex: /stage\s+push\s+guardrail/i,
    category: FOLLOWUP_CATEGORIES.controlPlane
  }
];

export const FOLLOWUP_COMMENT_MARKER = "factory-followup-signature";

function normalizeText(value) {
  return `${value || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function findActionablePattern(message) {
  const normalized = `${message || ""}`;

  if (!normalized.trim()) {
    return null;
  }

  for (const pattern of ACTIONABLE_MESSAGE_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return pattern;
    }
  }

  return null;
}

export function classifyFollowup({
  failureType,
  phase,
  action,
  failureMessage,
  advisory
}) {
  if (INELIGIBLE_FAILURE_TYPES.has(failureType)) {
    return { actionable: false, reason: "ineligible_failure_type", category: null };
  }

  const advisoryScope = advisory?.scope || "";
  const advisoryConfidence = advisory?.confidence || "";

  if (
    (advisoryScope === "external" || advisoryScope === "pr_branch") &&
    advisoryConfidence === "low"
  ) {
    return { actionable: false, reason: "ineligible_advisory_scope_confidence", category: null };
  }

  if (
    advisory &&
    advisory.scope === FOLLOWUP_CATEGORIES.controlPlane &&
    (advisory.confidence === "medium" || advisory.confidence === "high")
  ) {
    return {
      actionable: true,
      reason: "control_plane_advisory_high_confidence",
      category: FOLLOWUP_CATEGORIES.controlPlane
    };
  }

  const advisoryText = advisory?.diagnosis || "";
  const patternSource = [failureMessage, advisoryText].find((text) => !!findActionablePattern(text));
  const matchedPattern = patternSource ? findActionablePattern(patternSource) : null;

  if (
    advisory &&
    advisory.scope === "unclear" &&
    advisory.confidence === "high" &&
    matchedPattern
  ) {
    return {
      actionable: true,
      reason: `high_confidence_unclear_advisory_${matchedPattern.id}`,
      category: matchedPattern.category
    };
  }

  if (matchedPattern) {
    return {
      actionable: true,
      reason: `pattern_${matchedPattern.id}`,
      category: matchedPattern.category
    };
  }

  if (failureType === "configuration") {
    return {
      actionable: true,
      reason: "configuration_failure_type",
      category: FOLLOWUP_CATEGORIES.configuration
    };
  }

  return { actionable: false, reason: "no_actionable_indicators", category: null };
}

export function buildFailureSignature({
  category,
  failureType,
  phase,
  failureMessage,
  advisory
}) {
  const normalizedMessage = normalizeText(failureMessage);
  const normalizedScope = normalizeText(advisory?.scope);
  const normalizedDiagnosis = normalizeText(advisory?.diagnosis);
  const payload = [
    normalizeText(category),
    normalizeText(failureType),
    normalizeText(phase),
    normalizedMessage,
    normalizedScope,
    normalizedDiagnosis
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

function truncateSummary(summary, length = 64) {
  const normalized = `${summary || ""}`.trim();

  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, length - 1)}…`;
}

function formatEvidenceLines({
  artifactsPath,
  runUrl,
  branch,
  advisory,
  repositoryUrl
}) {
  const evidence = [];

  if (runUrl) {
    evidence.push(`- Workflow run: ${runUrl}`);
  }

  if (branch) {
    evidence.push(`- Branch: \`${branch}\``);
  }

  if (artifactsPath) {
    if (repositoryUrl && branch) {
      const base = repositoryUrl.replace(/\/$/, "");
      evidence.push(`- Artifacts: ${base}/tree/${branch}/${artifactsPath}`);
    } else {
      evidence.push(`- Artifacts: \`${artifactsPath}\``);
    }
  }

  if (advisory?.diagnosis) {
    const words = advisory.diagnosis.trim().split(/\s+/).slice(0, 25);
    evidence.push(`- Advisory: "${words.join(" ")}${words.length === 25 ? "…" : ""}"`);
  }

  return evidence;
}

export function buildFollowupIssue({
  prNumber,
  runUrl,
  branch,
  artifactsPath,
  failureType,
  failureMessage,
  advisory,
  category,
  signature,
  ciRunId,
  repositoryUrl
}) {
  const shortSummary = truncateSummary(advisory?.diagnosis || failureMessage || "Unhandled failure");
  const title = `[Factory] Follow-up: ${shortSummary || "Pending investigation"}`;
  const evidence = formatEvidenceLines({
    artifactsPath,
    runUrl,
    branch,
    advisory,
    repositoryUrl
  });
  const body = [
    "## Problem statement",
    `- Blocked PR: #${prNumber || "N/A"}`,
    `- Failure type: \`${failureType || "unknown"}\``,
    `- Category: \`${category || "unspecified"}\``,
    runUrl ? `- Workflow run: ${runUrl}` : "- Workflow run: N/A",
    ciRunId ? `- Source CI run: ${ciRunId}` : null,
    "",
    "## Goals",
    "- Diagnose and remediate the factory/control-plane issue.",
    "- Add regression coverage or guardrails protecting this path.",
    "- Confirm the next staged run succeeds without manual intervention.",
    "",
    "## Non-goals",
    "- Branch-specific fixes on user code paths.",
    "- Addressing transient infrastructure instability unless reproducible.",
    "",
    "## Constraints",
    "- Preserve existing artifact contracts and control-plane expectations.",
    "- Operate within the autonomous factory GitHub-native workflows.",
    "",
    "## Acceptance criteria",
    "- Automated test or reproduction case demonstrates the failure.",
    "- Fix merged to mainline and validated by CI.",
    "- Factory rerun confirms the stage completes successfully.",
    "",
    "## Risk",
    "- Reoccurrence blocks factory automation and delays downstream delivery.",
    "",
    "## Affected area",
    "- CI / Automation",
    "",
    "## Evidence"
  ].filter((line) => line !== null);

  if (evidence.length === 0) {
    body.push("- N/A");
  } else {
    body.push(...evidence);
  }

  const metadata = {
    signature,
    source_pr: prNumber ? Number(prNumber) : null,
    source_run: ciRunId || null
  };

  body.push(
    "",
    `<!-- factory-followup-meta: ${JSON.stringify(metadata)} -->`
  );

  return { title, body: body.join("\n").trim() };
}

export async function findOpenFollowup({ signature, searchIssues }) {
  if (!signature) {
    return null;
  }

  if (typeof searchIssues !== "function") {
    throw new Error("searchIssues function is required");
  }

  const query = `state:open in:body "<!-- factory-followup-meta: {\\"signature\\":\\"${signature}\\"} -->"`;
  const results = await searchIssues({ query });
  const items = Array.isArray(results?.items) ? results.items : [];

  for (const issue of items) {
    if (typeof issue?.body === "string" && issue.body.includes(`"signature":"${signature}"`)) {
      return issue;
    }
  }

  return null;
}

export function buildFollowupCommentSection({ issueNumber, signature, created }) {
  const lines = [
    "---",
    "",
    "## Factory follow-up"
  ];

  if (issueNumber) {
    const disposition = created ? "opened" : "already tracked";
    lines.push(`Factory follow-up ${disposition} as #${issueNumber}.`);
  } else {
    lines.push("Factory follow-up is already tracked for this signature.");
  }

  lines.push("", `<!-- ${FOLLOWUP_COMMENT_MARKER}: ${signature} -->`);

  return lines.join("\n");
}
