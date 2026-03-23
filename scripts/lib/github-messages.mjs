import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_ISSUE_FILE_NAME,
  FACTORY_COMMAND_CONTEXTS,
  FACTORY_COMMANDS,
  FACTORY_LABELS,
  FACTORY_SLASH_COMMANDS,
  PR_STATE_MARKER
} from "./factory-config.mjs";
import { formatEstimatedUsd } from "./cost-estimation.mjs";
import { defaultPrMetadata } from "./pr-metadata-shape.mjs";
import { getQuestionOptions } from "./intervention-state.mjs";
import {
  normalizeNewlines,
  renderBlockingFindingsSummary,
  renderFullBlockingFindingsDetails,
  renderFullReviewDetails,
  renderTraceabilityDetails,
  renderUnmetRequirementChecksSummary
} from "./review-output.mjs";
import { buildControlPanel } from "./control-panel.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES_ROOT = path.resolve(
  MODULE_DIR,
  "..",
  "templates",
  "github-messages"
);
const DEFAULT_OVERRIDE_ROOT = path.join(".factory", "messages");
export const MAX_REVIEW_BODY_CHARS = 60000;

const CI_STATUS_EMOJI = Object.freeze({
  pending: "⏳",
  success: "✅",
  failure: "❌"
});

const DASHBOARD_STAGE_EMOJI = Object.freeze({
  plan: "📝",
  implement: "🏗️",
  review: "🔍"
});

const DASHBOARD_STAGE_STATUS_MAP = Object.freeze({
  planning: "plan",
  plan_ready: "plan",
  implementing: "implement",
  repairing: "implement",
  reviewing: "review",
  ready_for_review: "review"
});

const DASHBOARD_REDUNDANT_STAGE_STATES = new Set([
  "planning",
  "plan_ready",
  "implementing",
  "repairing",
  "reviewing",
  "ready_for_review"
]);

const WAITING_DESCRIPTORS = Object.freeze({
  operator: "🧑 Human action required",
  agent: "🤖 Automation running",
  "human reviewer": "🧑‍⚖️ Human review required"
});

const CI_STATUS_LABELS = Object.freeze({
  pending: "Pending",
  success: "Success",
  failure: "Failure"
});

const PR_SLASH_COMMANDS = Object.freeze({
  implement:
    FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.implement],
  answer:
    FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.answer],
  resume:
    FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.resume],
  pause:
    FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.pause],
  reset:
    FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.reset]
});

const OPTION_EFFECT_HINTS = Object.freeze({
  resume_current_stage: "Resumes automation",
  remain_blocked: "Keeps automation blocked",
  manual_only: "Manual takeover required"
});

function describeOptionEffect(effect = "") {
  const key = `${effect}`.trim();
  return key ? OPTION_EFFECT_HINTS[key] || null : null;
}

const ACTION_GUIDANCE = Object.freeze({
  start_implement: {
    commandKey: "implement",
    guidance: "Start implementation after plan approval."
  },
  pause: {
    commandKey: "pause",
    guidance: "Pause automation to hand off or intervene."
  },
  resume: {
    commandKey: "resume",
    guidance: "Resume automation from the current stage."
  },
  reset: {
    commandKey: "reset",
    guidance: "Reset to plan-ready before restarting."
  }
});

const MESSAGE_SPECS = Object.freeze({
  "pr-body": {
    fileName: "pr-body.md",
    requiredTokens: [
      "DASHBOARD_SECTION",
      "SUGGESTED_ACTIONS_SECTION",
      "ARTIFACTS_SECTION",
      "OPERATOR_NOTES_SECTION"
    ]
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

function serializePrState(state) {
  return [
    `<!-- ${PR_STATE_MARKER}`,
    JSON.stringify(state, null, 2),
    "-->"
  ].join("\n");
}

function resolveDashboardStage({ status, state, blockedAction, lastCompletedStage }) {
  const normalize = (value) => `${value || ""}`.trim().toLowerCase();
  const normalizedStatus = normalize(status);
  const normalizedState = normalize(state);
  const candidates = [normalizedState, normalizedStatus].filter(Boolean);
  const normalizeStage = (value) => {
    const candidate = normalize(value);
    return ["plan", "implement", "review"].includes(candidate) ? candidate : "";
  };

  if (!candidates.length) {
    return null;
  }

  for (const candidate of candidates) {
    if (candidate === "blocked") {
      const normalizedBlocked = normalizeStage(blockedAction);

      if (normalizedBlocked) {
        return normalizedBlocked;
      }

      const normalizedStage = normalizeStage(lastCompletedStage);

      if (normalizedStage) {
        return normalizedStage;
      }

      return null;
    }

    if (candidate === "paused") {
      const normalizedStage = normalizeStage(lastCompletedStage);

      if (normalizedStage) {
        return normalizedStage;
      }

      return null;
    }

    if (DASHBOARD_REDUNDANT_STAGE_STATES.has(candidate)) {
      return null;
    }

    const mappedStage = DASHBOARD_STAGE_STATUS_MAP[candidate];

    if (mappedStage) {
      return mappedStage;
    }
  }

  return null;
}

function formatDashboardStage(stageKey) {
  const normalized = `${stageKey || ""}`.trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  const emoji = DASHBOARD_STAGE_EMOJI[normalized] || "";
  const stageLabel = `\`${normalized}\``;

  return emoji ? `${emoji} ${stageLabel}` : stageLabel;
}

function formatWaitingDescriptor({ waitingOn, stateKey }) {
  const normalizedState = `${stateKey || ""}`.trim().toLowerCase();

  if (normalizedState === "paused") {
    return "⏸️ Automation paused";
  }

  const normalizedWaiting = `${waitingOn || ""}`.trim().toLowerCase();

  if (!normalizedWaiting) {
    return "";
  }

  const descriptor = WAITING_DESCRIPTORS[normalizedWaiting];

  if (descriptor) {
    return descriptor;
  }

  const fallbackLabel = normalizedWaiting.replace(/_/g, " ");

  return `🧭 Waiting on ${fallbackLabel || "status"}`;
}

function formatCiStatus(ciStatus) {
  const normalized = `${ciStatus || ""}`.trim().toLowerCase() || "pending";
  const emoji = CI_STATUS_EMOJI[normalized] || "";
  const label = CI_STATUS_LABELS[normalized] || (normalized[0]?.toUpperCase() || "") + normalized.slice(1);

  return emoji ? `${emoji} ${label}` : label;
}

function formatRepairsDisplay({ attempts, maxAttempts }) {
  const attemptValue = Number.isFinite(Number(attempts)) ? Number(attempts) : 0;
  const maxValue = Number.isFinite(Number(maxAttempts)) && Number(maxAttempts) > 0
    ? Number(maxAttempts)
    : "∞";

  return `\`${attemptValue} / ${maxValue}\``;
}

function formatCostLine({
  costEstimateUsd,
  costEstimateEmoji,
  lastStageCostEstimateUsd,
  lastEstimatedModel
}) {
  const totalEstimate = Number(costEstimateUsd);

  if (!Number.isFinite(totalEstimate) || totalEstimate < 0) {
    return "";
  }

  const totalSegment = `${costEstimateEmoji ? `${costEstimateEmoji} ` : ""}$${formatEstimatedUsd(totalEstimate)} total`;
  const stageEstimateValue = Number(lastStageCostEstimateUsd);
  let estimateSegment = "Estimate: —";

  if (
    Number.isFinite(stageEstimateValue) &&
    stageEstimateValue >= 0 &&
    `${lastEstimatedModel || ""}`.trim()
  ) {
    estimateSegment = `Estimate: $${formatEstimatedUsd(stageEstimateValue)} via ${lastEstimatedModel}`;
  }

  return `Cost: ${totalSegment} · ${estimateSegment}`;
}

function formatOpenLinksLine({ controlPanel, links }) {
  const segments = [];

  if (controlPanel?.latestRun?.url) {
    segments.push(`[Latest run](${controlPanel.latestRun.url})`);
  }

  if (links.review) {
    segments.push(`[Review summary](${links.review})`);
  }

  if (links.reviewJson) {
    segments.push(`[Review JSON](${links.reviewJson})`);
  }

  if (!segments.length) {
    return "";
  }

  return `**Open:** ${segments.join(" · ")}`;
}

function formatDashboardSummary({ controlPanel, metadata }) {
  if (!controlPanel) {
    return "";
  }

  const segments = [];
  const stateDisplay = controlPanel.stateDisplay || "Unknown";

  segments.push(`**${stateDisplay}**`);

  const stageKey = resolveDashboardStage({
    status: metadata.status,
    state: controlPanel.state,
    blockedAction: metadata.blockedAction,
    lastCompletedStage:
      controlPanel.lastCompletedStage || metadata.lastCompletedStage
  });
  const stageSegment = formatDashboardStage(stageKey);

  if (stageSegment) {
    segments.push(stageSegment);
  }

  const waitingDescriptor = formatWaitingDescriptor({
    waitingOn: controlPanel.waitingOn,
    stateKey: controlPanel.state
  });

  if (waitingDescriptor) {
    segments.push(waitingDescriptor);
  }

  return segments.join(" · ");
}

function buildDashboardSection({ controlPanel, metadata, ciStatus, links }) {
  const summaryLine = formatDashboardSummary({ controlPanel, metadata });
  const ciLine = `CI: ${formatCiStatus(ciStatus)} · Repairs: ${formatRepairsDisplay({
    attempts: metadata.repairAttempts,
    maxAttempts: metadata.maxRepairAttempts
  })}`;
  const costLine = formatCostLine(metadata);
  const openLine = formatOpenLinksLine({ controlPanel, links });

  return [summaryLine, ciLine, costLine, openLine].filter(Boolean).join("\n");
}

function buildSuggestedActionsSection({ controlPanel }) {
  const actions = controlPanel?.actions || [];
  const seenCommands = new Set();
  const suggestions = [];

  for (const action of actions) {
    if (action?.kind !== "mutation") {
      continue;
    }

    const guidance = ACTION_GUIDANCE[action.id];

    if (!guidance) {
      continue;
    }

    const command = PR_SLASH_COMMANDS[guidance.commandKey];

    if (!command || seenCommands.has(command)) {
      continue;
    }

    seenCommands.add(command);
    suggestions.push(`- \`${command}\` — ${guidance.guidance}`);
  }

  if (!suggestions.length) {
    return "";
  }

  return ["**Suggested next actions**", ...suggestions].join("\n");
}

function buildArtifactsSection(links = {}) {
  const planLinks = [];

  if (links.approvedIssue) {
    planLinks.push(`[Approved issue](${links.approvedIssue})`);
  }
  if (links.spec) {
    planLinks.push(`[Spec](${links.spec})`);
  }
  if (links.plan) {
    planLinks.push(`[Plan](${links.plan})`);
  }
  if (links.acceptanceTests) {
    planLinks.push(`[Acceptance tests](${links.acceptanceTests})`);
  }

  const runLinks = [];

  if (links.repairLog) {
    runLinks.push(`[Repair log](${links.repairLog})`);
  }
  if (links.costSummary) {
    runLinks.push(`[Cost summary](${links.costSummary})`);
  }

  const reviewLinks = [];

  if (links.review) {
    reviewLinks.push(`[Review summary](${links.review})`);
  }
  if (links.reviewJson) {
    reviewLinks.push(`[Review JSON](${links.reviewJson})`);
  }

  const lines = ["## Artifacts"];

  if (planLinks.length) {
    lines.push(`**Plan** ${planLinks.join(" · ")}`);
  }

  if (runLinks.length) {
    lines.push(`**Build** ${runLinks.join(" · ")}`);
  }

  if (reviewLinks.length) {
    lines.push(`**Review** ${reviewLinks.join(" · ")}`);
  }

  return lines.join("\n");
}

function buildOperatorNotesSection() {
  return [
    "## Operator Notes",
    "- Slash commands control the run.",
    "- Manual label fallbacks remain available.",
    "- Cost estimates are advisory heuristics."
  ].join("\n");
}

export function renderPrBody(
  {
    issueNumber,
    prNumber,
    branch,
    repositoryUrl,
    artifactsPath,
    metadata,
    ciStatus = "pending",
    labels = []
  },
  options = {}
) {
  const state = defaultPrMetadata({
    issueNumber,
    artifactsPath,
    ...metadata
  });
  const links = buildArtifactLinks({ repositoryUrl, branch, artifactsPath });
  const resolvedPrNumber = prNumber ?? issueNumber ?? null;
  const controlPanel = buildControlPanel({
    metadata: state,
    labels,
    repositoryUrl,
    branch,
    prNumber: resolvedPrNumber,
    artifactLinks: links
  });
  const dashboardSection = buildDashboardSection({
    controlPanel,
    metadata: state,
    ciStatus,
    links
  });
  const suggestedActionsSection = buildSuggestedActionsSection({ controlPanel });
  const artifactsSection = buildArtifactsSection(links);
  const operatorNotesSection = buildOperatorNotesSection();
  const variables = {
    ISSUE_NUMBER: String(issueNumber),
    PR_NUMBER: resolvedPrNumber != null ? String(resolvedPrNumber) : "",
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
    IMPLEMENT_COMMAND:
      FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.implement],
    RESUME_COMMAND:
      FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.resume],
    PAUSE_COMMAND:
      FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.pause],
    RESET_COMMAND:
      FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.reset],
    CONTROL_PANEL_SECTION: dashboardSection,
    STATUS_SECTION: "",
    ARTIFACTS_SECTION: artifactsSection,
    OPERATOR_NOTES_SECTION: operatorNotesSection,
    DASHBOARD_SECTION: dashboardSection,
    SUGGESTED_ACTIONS_SECTION: suggestedActionsSection
  };
  const body = renderMessage("pr-body", variables, options);

  return `${body}\n\n${serializePrState(state)}`;
}

export function renderPlanReadyIssueComment(
  {
    prNumber,
    implementCommand =
      FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.implement]
  },
  options = {}
) {
  return renderMessage(
    "plan-ready-issue-comment",
    {
      PR_NUMBER: String(prNumber),
      IMPLEMENT_COMMAND: implementCommand
    },
    options
  );
}

export function renderInterventionQuestionComment({ intervention }) {
  const options = getQuestionOptions(intervention);
  const recommendedOptionId = `${intervention.payload?.recommendedOptionId || ""}`.trim();
  const questionPrompt = `${intervention.payload?.question || ""}`.trim();
  const detail = normalizeNewlines(`${intervention.detail || ""}`).trim();
  const stage = `${intervention.stage || "unknown"}`.trim() || "unknown";
  const summary = `${intervention.summary || ""}`.trim();
  const runId = `${intervention.runId || ""}`.trim();
  const runUrl = `${intervention.runUrl || ""}`.trim();
  const metadata = JSON.stringify({
    id: intervention.id,
    type: intervention.type,
    version: intervention.payload?.version || 1,
    status: intervention.status,
    optionIds: options.map((option) => option.id)
  });
  const lines = [
    "## Factory Question",
    `**🧑 Human action required** · Stage: \`${stage}\``
  ];

  if (summary) {
    lines.push(`Summary: ${summary}`);
  }

  lines.push(`Question ID: \`${intervention.id}\``);

  if (recommendedOptionId) {
    lines.push(`Recommended: \`${recommendedOptionId}\``);
  }

  if (runUrl && runId) {
    lines.push(`Run: [GitHub Actions #${runId}](${runUrl})`);
  } else if (runUrl) {
    lines.push(`Run: [GitHub Actions run](${runUrl})`);
  } else if (runId) {
    lines.push(`Run: #${runId}`);
  }

  lines.push("", "### Answer With");

  if (questionPrompt) {
    lines.push("", `> _${questionPrompt}_`);
  }

  if (options.length) {
    lines.push("");
    for (const option of options) {
      const label = `${option.label || option.id}`.trim() || option.id;
      const effectHint = describeOptionEffect(option.effect);
      lines.push(effectHint ? `**${label}** — ${effectHint}` : `**${label}**`);
      lines.push("", "```text", `${PR_SLASH_COMMANDS.answer} ${intervention.id} ${option.id}`, "```", "");
    }
  } else {
    lines.push("", "_No answers available._", "");
  }

  if (detail) {
    if (lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push("<details>");
    lines.push("<summary>Why this needs attention</summary>");
    lines.push("");
    lines.push(detail);
    lines.push("</details>");
    lines.push("");
  }

  lines.push(`<!-- factory-question: ${metadata} -->`);

  return lines
    .filter((line, index, allLines) => !(line === "" && allLines[index - 1] === ""))
    .join("\n")
    .trim();
}

export function renderInterventionResolutionComment({
  interventionId,
  optionId,
  resumeAction = "",
  remainsBlocked = false
}) {
  const lines = [
    `Resolved factory question \`${interventionId}\` with answer \`${optionId}\`.`
  ];

  if (resumeAction) {
    lines.push(`Resuming \`${resumeAction}\`.`);
  } else if (remainsBlocked) {
    lines.push("Automation will remain blocked pending manual action.");
  }

  lines.push("");
  lines.push(
    `<!-- factory-resolution: ${JSON.stringify({
      interventionId,
      kind: "answered",
      optionId
    })} -->`
  );

  return lines.join("\n").trim();
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

const REVIEW_DECISION_CONFIG = Object.freeze({
  pass: {
    emoji: "✅",
    label: "PASS",
    templateId: "review-pass-comment"
  },
  request_changes: {
    emoji: "❌",
    label: "REQUEST_CHANGES",
    templateId: "review-request-changes"
  }
});

const OPTIONAL_REVIEW_DETAIL_TOKENS = Object.freeze([
  "FULL_REVIEW_DETAILS",
  "FULL_BLOCKING_FINDINGS_DETAILS",
  "TRACEABILITY_DETAILS"
]);

function normalizeReviewMarkdown(markdown) {
  return normalizeNewlines(`${markdown || ""}`).trim();
}

function formatReviewSummary(summary) {
  return normalizeNewlines(`${summary || ""}`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function countBlockingFindings(findings = []) {
  return ensureArray(findings).filter((finding) => finding.level === "blocking").length;
}

function resolveBlockingFindingsCount(review) {
  const declared = Number.parseInt(review?.blocking_findings_count, 10);

  if (Number.isFinite(declared)) {
    return declared;
  }

  return countBlockingFindings(review?.findings);
}

function countUnmetRequirementChecks(requirementChecks = []) {
  return ensureArray(requirementChecks).filter((check) =>
    ["partially_satisfied", "not_satisfied"].includes(check.status)
  ).length;
}

function buildReviewTemplateVariables({
  review,
  reviewMarkdown,
  artifactsPath,
  decisionConfig
}) {
  const requirementChecks = ensureArray(review?.requirement_checks);
  const findings = ensureArray(review?.findings);
  const normalizedMarkdown = normalizeReviewMarkdown(reviewMarkdown);
  const reviewMarkdownPath = path.join(artifactsPath, "review.md");
  const reviewJsonPath = path.join(artifactsPath, "review.json");
  const blockingFindingsCount = resolveBlockingFindingsCount(review);
  const unmetRequirementChecksCount = countUnmetRequirementChecks(requirementChecks);

  return {
    REVIEW_DECISION_EMOJI: decisionConfig.emoji,
    REVIEW_DECISION_LABEL: decisionConfig.label,
    REVIEW_METHOD: `${review?.methodology || ""}`.trim() || "default",
    REVIEW_SUMMARY: formatReviewSummary(review?.summary),
    BLOCKING_FINDINGS_COUNT: String(blockingFindingsCount),
    UNMET_REQUIREMENT_CHECKS_COUNT: String(unmetRequirementChecksCount),
    REVIEW_MARKDOWN_PATH: reviewMarkdownPath,
    REVIEW_JSON_PATH: reviewJsonPath,
    BLOCKING_FINDINGS_SUMMARY: renderBlockingFindingsSummary(findings),
    UNMET_REQUIREMENT_CHECKS_SUMMARY: renderUnmetRequirementChecksSummary(
      requirementChecks
    ),
    TRACEABILITY_DETAILS: renderTraceabilityDetails(requirementChecks),
    FULL_BLOCKING_FINDINGS_DETAILS: renderFullBlockingFindingsDetails(findings),
    FULL_REVIEW_DETAILS: renderFullReviewDetails(normalizedMarkdown),
    TRUNCATION_NOTICE: ""
  };
}

export function buildReviewConversationBody({
  review,
  reviewMarkdown,
  artifactsPath,
  maxBodyChars = MAX_REVIEW_BODY_CHARS,
  githubMessageOptions = {}
}) {
  const normalizedDecision = `${review?.decision || ""}`.trim().toLowerCase();
  const decisionConfig =
    REVIEW_DECISION_CONFIG[normalizedDecision];

  if (!decisionConfig) {
    throw new Error(`Unsupported review decision: ${review?.decision || "unknown"}`);
  }

  const variables = buildReviewTemplateVariables({
    review,
    reviewMarkdown,
    artifactsPath,
    decisionConfig
  });
  const render = (vars) =>
    renderMessage(decisionConfig.templateId, vars, githubMessageOptions);

  let body = render(variables);

  if (body.length <= maxBodyChars) {
    return body;
  }

  const truncationNotice = `**Review body truncated due to length. See \`${variables.REVIEW_MARKDOWN_PATH}\` for the full report.**`;

  for (const token of OPTIONAL_REVIEW_DETAIL_TOKENS) {
    if (variables[token]) {
      variables[token] = "";
      variables.TRUNCATION_NOTICE = truncationNotice;
      body = render(variables);

      if (body.length <= maxBodyChars) {
        return body;
      }
    }
  }

  const decisionLine = `**${variables.REVIEW_DECISION_EMOJI} ${variables.REVIEW_DECISION_LABEL}** · Method: \`${variables.REVIEW_METHOD}\``;
  const summaryLine = `Summary: ${variables.REVIEW_SUMMARY}`;
  const findingsLine = `**Findings:** Blocking ${variables.BLOCKING_FINDINGS_COUNT} · Requirement gaps ${variables.UNMET_REQUIREMENT_CHECKS_COUNT}`;
  const artifactsLine = `Artifacts: \`${variables.REVIEW_MARKDOWN_PATH}\` · \`${variables.REVIEW_JSON_PATH}\``;
  const baseLines = [
    "## Factory Review",
    "",
    decisionLine,
    summaryLine,
    findingsLine,
    artifactsLine
  ];
  const noteSection = `\n\n${truncationNotice}`;
  const composeWithNotice = (lines) =>
    `${lines.filter((line) => line != null).join("\n")}${noteSection}`;

  let candidate = composeWithNotice(baseLines);

  if (candidate.length <= maxBodyChars) {
    return candidate;
  }

  const summaryIndex = baseLines.indexOf(summaryLine);

  if (summaryIndex !== -1) {
    const linesWithoutSummaryText = [...baseLines];
    linesWithoutSummaryText[summaryIndex] = "Summary:";
    let baseWithoutSummaryText = composeWithNotice(linesWithoutSummaryText);
    let availableForSummaryText = maxBodyChars - baseWithoutSummaryText.length;

    if (availableForSummaryText < 0) {
      availableForSummaryText = 0;
    }

    if (availableForSummaryText > 0) {
      const prefix = "Summary:";
      const needsSpace = availableForSummaryText > prefix.length;
      const maxTextLength = needsSpace
        ? availableForSummaryText - (prefix.length + 1)
        : 0;
      let truncatedSummaryText = variables.REVIEW_SUMMARY.slice(0, Math.max(0, maxTextLength));

      if (variables.REVIEW_SUMMARY.length > maxTextLength && maxTextLength > 3) {
        truncatedSummaryText =
          `${truncatedSummaryText.slice(0, Math.max(0, maxTextLength - 3))}...`;
      } else if (variables.REVIEW_SUMMARY.length > maxTextLength && maxTextLength <= 3) {
        truncatedSummaryText = "";
      }

      linesWithoutSummaryText[summaryIndex] = truncatedSummaryText
        ? `${prefix} ${truncatedSummaryText}`
        : prefix;
    }

    candidate = composeWithNotice(linesWithoutSummaryText);

    if (candidate.length <= maxBodyChars) {
      return candidate;
    }

    linesWithoutSummaryText[summaryIndex] = null;
    candidate = composeWithNotice(linesWithoutSummaryText);

    if (candidate.length <= maxBodyChars) {
      return candidate;
    }

    const minimalLines = [
      "## Factory Review",
      decisionLine,
      findingsLine,
      artifactsLine
    ];
    candidate = composeWithNotice(minimalLines);

    if (candidate.length <= maxBodyChars) {
      return candidate;
    }

    const decisionOnlyLines = ["## Factory Review", decisionLine];
    candidate = composeWithNotice(decisionOnlyLines);

    if (candidate.length <= maxBodyChars) {
      return candidate;
    }

    const noteOnly = `${decisionOnlyLines.join("\n")}${noteSection}`;

    if (noteOnly.length <= maxBodyChars) {
      return noteOnly;
    }

    return noteOnly.slice(0, maxBodyChars);
  }

  const decisionOnly = ["## Factory Review", decisionLine];
  const decisionWithNotice = composeWithNotice(decisionOnly);

  if (decisionWithNotice.length <= maxBodyChars) {
    return decisionWithNotice;
  }

  return decisionWithNotice.slice(0, maxBodyChars);
}
