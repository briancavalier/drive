import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_LABELS,
  PR_STATE_MARKER
} from "./factory-config.mjs";
import { formatEstimatedUsd } from "./cost-estimation.mjs";
import { normalizeNewlines } from "./review-output.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES_ROOT = path.resolve(
  MODULE_DIR,
  "..",
  "templates",
  "github-messages"
);
const DEFAULT_OVERRIDE_ROOT = path.join(".factory", "messages");
export const MAX_REVIEW_BODY_CHARS = 60000;

const STAGE_STATUS_EMOJI = Object.freeze({
  planning: "📝",
  plan_ready: "👀",
  implementing: "🏗️",
  repairing: "🛠️",
  blocked: "⚠️",
  ready_for_review: "✅"
});

const CI_STATUS_EMOJI = Object.freeze({
  pending: "⏳",
  success: "✅",
  failure: "❌"
});

const MESSAGE_SPECS = Object.freeze({
  "pr-body": {
    fileName: "pr-body.md",
    requiredTokens: ["STATUS_SECTION", "ARTIFACTS_SECTION"]
  },
  "plan-ready-issue-comment": {
    fileName: "plan-ready-issue-comment.md",
    requiredTokens: []
  },
  "intake-rejected-comment": {
    fileName: "intake-rejected-comment.md",
    requiredTokens: []
  },
  "review-pass-comment": {
    fileName: "review-pass-comment.md",
    requiredTokens: []
  },
  "review-request-changes": {
    fileName: "review-request-changes.md",
    requiredTokens: []
  }
});

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function extractTemplateTokens(templateText) {
  return [...`${templateText || ""}`.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(
    (match) => match[1]
  );
}

function validateTemplate(templateText, allowedTokens, requiredTokens) {
  const tokens = extractTemplateTokens(templateText);
  const unknownTokens = [...new Set(tokens.filter((token) => !allowedTokens.has(token)))];
  const missingRequiredTokens = requiredTokens.filter(
    (token) => !tokens.includes(token)
  );

  return {
    unknownTokens,
    missingRequiredTokens,
    valid: unknownTokens.length === 0 && missingRequiredTokens.length === 0
  };
}

function renderTemplateText(templateText, variables) {
  let rendered = templateText;

  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replaceAll(`{{${key}}}`, `${value ?? ""}`);
  }

  return rendered;
}

function resolveTemplate({ messageId, variables, overridesRoot, defaultsRoot, logger }) {
  const spec = MESSAGE_SPECS[messageId];

  if (!spec) {
    throw new Error(`Unsupported GitHub message template id: ${messageId}`);
  }

  const defaultPath = path.join(defaultsRoot, spec.fileName);
  const defaultText = readFileIfExists(defaultPath);

  if (defaultText == null) {
    throw new Error(`Missing default GitHub message template at ${defaultPath}`);
  }

  const allowedTokens = new Set(Object.keys(variables));
  const defaultValidation = validateTemplate(
    defaultText,
    allowedTokens,
    spec.requiredTokens
  );

  if (!defaultValidation.valid) {
    throw new Error(
      `Default GitHub message template "${messageId}" is invalid`
    );
  }

  const overridePath = path.join(overridesRoot, spec.fileName);
  const overrideText = readFileIfExists(overridePath);

  if (overrideText == null) {
    return defaultText;
  }

  const overrideValidation = validateTemplate(
    overrideText,
    allowedTokens,
    spec.requiredTokens
  );

  if (overrideValidation.valid) {
    return overrideText;
  }

  const reasons = [];

  if (overrideValidation.unknownTokens.length) {
    reasons.push(
      `unknown tokens: ${overrideValidation.unknownTokens.join(", ")}`
    );
  }

  if (overrideValidation.missingRequiredTokens.length) {
    reasons.push(
      `missing required tokens: ${overrideValidation.missingRequiredTokens.join(", ")}`
    );
  }

  logger.warn(
    `Invalid GitHub message template "${messageId}" at ${overridePath}; ${reasons.join(
      "; "
    )}. Falling back to built-in default.`
  );

  return defaultText;
}

function renderMessage(messageId, variables, options = {}) {
  const templateText = resolveTemplate({
    messageId,
    variables,
    overridesRoot: options.overridesRoot || DEFAULT_OVERRIDE_ROOT,
    defaultsRoot: options.defaultsRoot || DEFAULT_TEMPLATES_ROOT,
    logger: options.logger || console
  });

  return renderTemplateText(templateText, variables).trim();
}

function buildArtifactLinks({ repositoryUrl, branch, artifactsPath }) {
  const base = `${repositoryUrl}/blob/${branch}/${artifactsPath}`;

  return {
    spec: `${base}/spec.md`,
    plan: `${base}/plan.md`,
    acceptanceTests: `${base}/acceptance-tests.md`,
    repairLog: `${base}/repair-log.md`,
    costSummary: `${base}/cost-summary.json`,
    review: `${base}/review.md`,
    reviewJson: `${base}/review.json`
  };
}

function defaultPrMetadata(overrides = {}) {
  return {
    issueNumber: null,
    artifactsPath: null,
    status: "planning",
    repairAttempts: 0,
    maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
    lastFailureSignature: null,
    repeatedFailureCount: 0,
    lastReadySha: null,
    lastProcessedWorkflowRunId: null,
    lastFailureType: null,
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
    ...overrides
  };
}

function formatWithEmoji(mapping, value, fallback = "") {
  const normalized = `${value ?? ""}`.trim();
  const resolved = normalized || fallback;

  if (!resolved) {
    return resolved;
  }

  const emoji = mapping[resolved];

  return emoji ? `${emoji} ${resolved}` : resolved;
}

function serializePrState(state) {
  return [
    `<!-- ${PR_STATE_MARKER}`,
    JSON.stringify(state, null, 2),
    "-->"
  ].join("\n");
}

export function renderPrBody(
  {
    issueNumber,
    branch,
    repositoryUrl,
    artifactsPath,
    metadata,
    ciStatus = "pending"
  },
  options = {}
) {
  const state = defaultPrMetadata({
    issueNumber,
    artifactsPath,
    ...metadata
  });
  const links = buildArtifactLinks({ repositoryUrl, branch, artifactsPath });
  const stageStatusDisplay = formatWithEmoji(STAGE_STATUS_EMOJI, state.status, "unknown");
  const ciStatusDisplay = formatWithEmoji(CI_STATUS_EMOJI, ciStatus, "pending");
  const hasCostEstimate = Number.isFinite(Number(state.costEstimateUsd)) && Number(state.costEstimateUsd) > 0;
  const estimatedCostLine = hasCostEstimate
    ? `- Estimated cost: ${state.costEstimateEmoji || ""} $${formatEstimatedUsd(state.costEstimateUsd)} total (${state.costEstimateBand || "unknown"})`
        .replace(":  ", ": ")
    : null;
  const latestStageCostLine =
    hasCostEstimate && state.lastEstimatedStage && state.lastEstimatedModel
      ? `- Latest stage estimate: $${formatEstimatedUsd(state.lastStageCostEstimateUsd)} using ${state.lastEstimatedModel}`
      : null;
  const variables = {
    ISSUE_NUMBER: String(issueNumber),
    BRANCH: branch,
    REPOSITORY_URL: repositoryUrl,
    ARTIFACTS_PATH: artifactsPath,
    STATUS: state.status || "unknown",
    CI_STATUS: ciStatus,
    REPAIR_ATTEMPTS: String(state.repairAttempts),
    MAX_REPAIR_ATTEMPTS: String(state.maxRepairAttempts),
    SPEC_URL: links.spec,
    PLAN_URL: links.plan,
    ACCEPTANCE_TESTS_URL: links.acceptanceTests,
    REPAIR_LOG_URL: links.repairLog,
    COST_SUMMARY_URL: links.costSummary,
    REVIEW_URL: links.review,
    REVIEW_JSON_URL: links.reviewJson,
    IMPLEMENT_LABEL: FACTORY_LABELS.implement,
    PAUSED_LABEL: FACTORY_LABELS.paused,
    LAST_FAILURE_TYPE: state.lastFailureType || "",
    TRANSIENT_RETRY_ATTEMPTS: String(state.transientRetryAttempts || 0),
    STATUS_SECTION: [
      "## Status",
      `- Stage: ${stageStatusDisplay}`,
      `- CI: ${ciStatusDisplay}`,
      `- Repair attempts: ${state.repairAttempts}/${state.maxRepairAttempts}`,
      estimatedCostLine,
      latestStageCostLine,
      state.lastFailureType ? `- Last failure type: ${state.lastFailureType}` : null,
      state.transientRetryAttempts
        ? `- Transient retries used: ${state.transientRetryAttempts}`
        : null
    ]
      .filter(Boolean)
      .join("\n"),
    ARTIFACTS_SECTION: [
      "## Artifacts",
      `- [spec.md](${links.spec})`,
      `- [plan.md](${links.plan})`,
      `- [acceptance-tests.md](${links.acceptanceTests})`,
      `- [repair-log.md](${links.repairLog})`,
      `- [cost-summary.json](${links.costSummary})`,
      `- [review.md](${links.review})`,
      `- [review.json](${links.reviewJson})`
    ].join("\n"),
    OPERATOR_NOTES_SECTION: [
      "## Operator Notes",
      `- ▶️ Apply \`${FACTORY_LABELS.implement}\` to start coding after plan review.`,
      `- ⏸️ Apply \`${FACTORY_LABELS.paused}\` to pause autonomous work.`,
      `- ▶️ Remove \`${FACTORY_LABELS.paused}\` and re-apply \`${FACTORY_LABELS.implement}\` to resume.`,
      "- 💸 Cost values are advisory estimates, not billed usage."
    ].join("\n")
  };
  const body = renderMessage("pr-body", variables, options);

  return `${body}\n\n${serializePrState(state)}`;
}

export function renderPlanReadyIssueComment(
  { prNumber, implementLabel = FACTORY_LABELS.implement },
  options = {}
) {
  return renderMessage(
    "plan-ready-issue-comment",
    {
      PR_NUMBER: String(prNumber),
      IMPLEMENT_LABEL: implementLabel
    },
    options
  );
}

export function renderIntakeRejectedComment(
  { missingFields },
  options = {}
) {
  return renderMessage(
    "intake-rejected-comment",
    {
      MISSING_FIELDS: missingFields
    },
    options
  );
}

const TRACEABILITY_HEADING_TOKENS = ["## 🧭 Traceability", "## Traceability"];

function normalizeReviewMarkdown(markdown) {
  return normalizeNewlines(`${markdown || ""}`).trim();
}

function findTraceabilityLineIndex(lines) {
  return lines.findIndex((line) =>
    TRACEABILITY_HEADING_TOKENS.some((token) => line.trimStart().startsWith(token))
  );
}

function trimCorePreservingIntro(text, limit) {
  if (limit <= 0) {
    return "";
  }

  if (text.length <= limit) {
    return text.trimEnd();
  }

  let slice = text.slice(0, limit);
  const firstNewline = slice.indexOf("\n");

  if (firstNewline === -1) {
    return slice.trimEnd();
  }

  const lastNewline = slice.lastIndexOf("\n");

  if (lastNewline > firstNewline) {
    slice = slice.slice(0, lastNewline);
  } else {
    slice = slice.slice(0, firstNewline + 1);
  }

  return slice.trimEnd();
}

export function buildReviewConversationBody({
  reviewMarkdown,
  artifactsPath,
  maxBodyChars = MAX_REVIEW_BODY_CHARS
}) {
  const normalized = normalizeReviewMarkdown(reviewMarkdown);
  const reviewMarkdownPath = path.join(artifactsPath, "review.md");
  const footer = `\n\n—\nArtifacts: \`${reviewMarkdownPath}\``;
  const fullBody = `${normalized}${footer}`;

  if (fullBody.length <= maxBodyChars) {
    return fullBody;
  }

  const truncationNote = `\n\n**Review truncated after traceability details. See \`${reviewMarkdownPath}\` for the full report.**`;
  const reserve = truncationNote.length + footer.length;
  const maxCoreLength = Math.max(0, maxBodyChars - reserve);
  const lines = normalized.split("\n");
  const traceabilityIndex = findTraceabilityLineIndex(lines);

  if (traceabilityIndex !== -1) {
    const beforeTraceability = lines.slice(0, traceabilityIndex).join("\n").replace(/\s+$/u, "");
    const headingLine = lines[traceabilityIndex];
    const needsSeparator = Boolean(beforeTraceability);
    let visibleSection = needsSeparator
      ? `${beforeTraceability}\n${headingLine}`
      : headingLine;

    if (visibleSection.length > maxCoreLength) {
      const maxBeforeLength = Math.max(
        0,
        maxCoreLength - headingLine.length - (needsSeparator ? 1 : 0)
      );
      const trimmedBefore = trimCorePreservingIntro(beforeTraceability, maxBeforeLength);
      visibleSection = trimmedBefore
        ? `${trimmedBefore}\n${headingLine}`
        : headingLine;
    }

    const candidate = `${visibleSection}${truncationNote}${footer}`.trimStart();

    if (candidate.length <= maxBodyChars) {
      return candidate;
    }
  }

  const trimmedFallbackCore = trimCorePreservingIntro(normalized, maxCoreLength);
  const fallback = `${trimmedFallbackCore}${truncationNote}${footer}`.trimStart();

  if (fallback.length <= maxBodyChars) {
    return fallback;
  }

  return fallback.slice(0, maxBodyChars);
}
