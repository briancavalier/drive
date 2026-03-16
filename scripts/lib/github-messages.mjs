import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_LABELS,
  PR_STATE_MARKER
} from "./factory-config.mjs";
import {
  renderBlockingFindingsSummary,
  renderFullBlockingFindingsDetails,
  renderFullReviewDetails,
  renderTraceabilityDetails,
  renderUnmetRequirementChecksSummary
} from "./review-output.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES_ROOT = path.resolve(
  MODULE_DIR,
  "..",
  "templates",
  "github-messages"
);
const DEFAULT_OVERRIDE_ROOT = path.join(".factory", "messages");
const MAX_REVIEW_BODY_CHARS = 60000;

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
    ...overrides
  };
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
    REVIEW_URL: links.review,
    REVIEW_JSON_URL: links.reviewJson,
    IMPLEMENT_LABEL: FACTORY_LABELS.implement,
    PAUSED_LABEL: FACTORY_LABELS.paused,
    LAST_FAILURE_TYPE: state.lastFailureType || "",
    TRANSIENT_RETRY_ATTEMPTS: String(state.transientRetryAttempts || 0),
    STATUS_SECTION: [
      "## Status",
      `- Stage: ${state.status}`,
      `- CI: ${ciStatus}`,
      `- Repair attempts: ${state.repairAttempts}/${state.maxRepairAttempts}`,
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
      `- [review.md](${links.review})`,
      `- [review.json](${links.reviewJson})`
    ].join("\n"),
    OPERATOR_NOTES_SECTION: [
      "## Operator Notes",
      `- Apply \`${FACTORY_LABELS.implement}\` to start coding after plan review.`,
      `- Apply \`${FACTORY_LABELS.paused}\` to pause autonomous work.`,
      `- Remove \`${FACTORY_LABELS.paused}\` and re-apply \`${FACTORY_LABELS.implement}\` to resume.`
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

export function renderReviewPassComment(
  { methodology, summary, blockingFindingsCount, artifactsPath },
  options = {}
) {
  const reviewMarkdownPath = path.join(artifactsPath, "review.md");
  const blockingFindingsLine =
    Number(blockingFindingsCount) > 0
      ? `Blocking findings recorded: ${blockingFindingsCount}. See \`${reviewMarkdownPath}\` for details.`
      : "No blocking findings recorded.";

  return renderMessage(
    "review-pass-comment",
    {
      REVIEW_METHOD: methodology,
      REVIEW_SUMMARY: summary,
      BLOCKING_FINDINGS_COUNT: String(blockingFindingsCount),
      BLOCKING_FINDINGS_LINE: blockingFindingsLine,
      ARTIFACTS_PATH: artifactsPath,
      REVIEW_MARKDOWN_PATH: reviewMarkdownPath
    },
    options
  );
}

export function renderRequestChangesReviewBody(
  {
    methodology,
    summary,
    findings = [],
    requirementChecks = [],
    reviewMarkdown,
    artifactsPath,
    maxBodyChars = MAX_REVIEW_BODY_CHARS
  },
  options = {}
) {
  const reviewMarkdownPath = path.join(artifactsPath, "review.md");
  const reviewJsonPath = path.join(artifactsPath, "review.json");
  const body = `${renderMessage(
    "review-request-changes",
    {
      REVIEW_METHOD: methodology,
      REVIEW_SUMMARY: summary,
      BLOCKING_FINDINGS_SUMMARY: renderBlockingFindingsSummary(findings),
      UNMET_REQUIREMENT_CHECKS_SUMMARY: renderUnmetRequirementChecksSummary(requirementChecks),
      FULL_BLOCKING_FINDINGS_DETAILS: renderFullBlockingFindingsDetails(findings),
      TRACEABILITY_DETAILS: renderTraceabilityDetails(requirementChecks),
      FULL_REVIEW_DETAILS: renderFullReviewDetails(`${reviewMarkdown || ""}`.trim()),
      REVIEW_MARKDOWN: `${reviewMarkdown || ""}`.trim(),
      ARTIFACTS_PATH: artifactsPath,
      REVIEW_MARKDOWN_PATH: reviewMarkdownPath,
      REVIEW_JSON_PATH: reviewJsonPath
    },
    options
  )}\n`;

  if (body.length <= maxBodyChars) {
    return body;
  }

  return `${body.slice(0, maxBodyChars)}\n\n*(Review truncated. See \`${reviewMarkdownPath}\` for the full report.)*`;
}
