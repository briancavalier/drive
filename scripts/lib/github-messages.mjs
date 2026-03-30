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
  renderCanonicalTraceabilityMarkdown,
  renderDetailsBlock,
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
  "intake-branch-exists-comment": {
    fileName: "intake-branch-exists-comment.md",
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

function buildArtifactLinks({ repositoryUrl, branch, artifactsPath, artifactRef }) {
  const normalizedRef = `${artifactRef ?? ""}`.trim();
  const ref = normalizedRef || branch;
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

function formatTokenCompact(value) {
  if (value == null || `${value}`.trim() === "") {
    return "";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return "";
  }

  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  }

  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return `${Math.round(amount)}`;
}

function formatCostLine({
  costEstimateUsd,
  costEstimateEmoji,
  lastStageCostEstimateUsd,
  lastEstimatedModel,
  actualStageCostUsd,
  actualInputTokens,
  actualCachedInputTokens,
  actualOutputTokens,
  actualReasoningTokens,
  actualApiSurface
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

  const hasActualCostField =
    actualStageCostUsd != null && `${actualStageCostUsd}`.trim() !== "";
  const actualCostValue = hasActualCostField ? Number(actualStageCostUsd) : Number.NaN;
  const hasActualCost = Number.isFinite(actualCostValue) && actualCostValue >= 0;
  const inputDisplay = formatTokenCompact(actualInputTokens);
  const cachedDisplay = formatTokenCompact(actualCachedInputTokens);
  const outputDisplay = formatTokenCompact(actualOutputTokens);
  const reasoningDisplay = formatTokenCompact(actualReasoningTokens);
  const tokenSegments = [];

  if (inputDisplay) {
    tokenSegments.push(`${inputDisplay} in`);
  }
  if (cachedDisplay) {
    tokenSegments.push(`${cachedDisplay} cached`);
  }
  if (outputDisplay) {
    tokenSegments.push(`${outputDisplay} out`);
  }
  if (reasoningDisplay) {
    tokenSegments.push(`${reasoningDisplay} reasoning`);
  }

  let actualSegment = "";

  if (hasActualCost) {
    actualSegment = `Actual: $${formatEstimatedUsd(actualCostValue)} this stage`;
    if (tokenSegments.length) {
      actualSegment = `${actualSegment} (${tokenSegments.join(" / ")})`;
    }
    if (`${actualApiSurface || ""}`.trim()) {
      actualSegment = `${actualSegment} via ${actualApiSurface}`;
    }
  }

  return `Cost: ${[totalSegment, estimateSegment, actualSegment]
    .filter(Boolean)
    .join(" · ")}`;
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
    artifactRef,
    metadata,
    ciStatus = "pending",
    labels = []
  },
  options = {}
) {
  const state = defaultPrMetadata({
    issueNumber,
    artifactsPath,
    artifactRef,
    ...metadata
  });
  const links = buildArtifactLinks({
    repositoryUrl,
    branch,
    artifactsPath,
    artifactRef: state.artifactRef
  });
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

export function renderIntakeBranchExistsComment(
  { branch, retryCommand },
  options = {}
) {
  return renderMessage(
    "intake-branch-exists-comment",
    {
      BRANCH: branch,
      RETRY_COMMAND: retryCommand
    },
    options
  );
}

const TRACEABILITY_ANCHOR_PATTERNS = Object.freeze([
  "<summary>🧭 Traceability</summary>",
  "<summary>Traceability</summary>",
  "## 🧭 Traceability",
  "## Traceability"
]);

function normalizeReviewMarkdown(markdown) {
  return normalizeNewlines(`${markdown || ""}`).trim();
}

function findTraceabilityLineIndex(lines) {
  return lines.findIndex((line) => {
    const normalized = line.trim();

    return TRACEABILITY_ANCHOR_PATTERNS.some((token) => normalized.includes(token));
  });
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

const NARRATIVE_SECTION_SUMMARIES = Object.freeze({
  summary: "📝 Summary",
  blocking: "🚨 Blocking Findings",
  nonBlocking: "⚠️ Non-Blocking Notes"
});

const DECISION_OR_METHOD_PATTERN = /^\s*(decision|methodology)\s*:/i;

function normalizeNarrativeHeading(line) {
  const match = /^#{2,6}\s+(.*)$/.exec(line.trim());

  if (!match) {
    return null;
  }

  let label = match[1].trim();
  label = label.replace(/^[^A-Za-z0-9]+/u, "");
  label = label.replace(/[-_]/g, " ");
  label = label.replace(/nonblocking/gi, "non blocking");
  label = label.replace(/blockingnotes/gi, "blocking notes");
  label = label.replace(/nonblockingnotes/gi, "non blocking notes");

  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function resolveNarrativeSectionKey(heading) {
  const normalized = normalizeNarrativeHeading(heading);

  if (!normalized) {
    return null;
  }

  if (["summary", "review summary", "review notes"].includes(normalized)) {
    return "summary";
  }

  if (["blocking findings", "blocking finding", "blocking notes"].includes(normalized)) {
    return "blocking";
  }

  if (
    [
      "non blocking notes",
      "non blocking findings",
      "non blocking review notes",
      "nonblocking notes"
    ].includes(normalized)
  ) {
    return "nonBlocking";
  }

  return null;
}

function parseReviewNarrativeSections(markdown) {
  const normalizedMarkdown = normalizeReviewMarkdown(markdown);

  if (!normalizedMarkdown) {
    return {
      summary: "",
      blocking: "",
      nonBlocking: ""
    };
  }

  const lines = normalizedMarkdown.split("\n");
  const sections = {
    summary: [],
    blocking: [],
    nonBlocking: []
  };
  let activeKey = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      TRACEABILITY_ANCHOR_PATTERNS.some((token) => token && trimmed.includes(token))
    ) {
      break;
    }

    const sectionKey = resolveNarrativeSectionKey(line);

    if (sectionKey) {
      activeKey = sectionKey;
      sections[sectionKey] = [];
      continue;
    }

    if (!activeKey) {
      continue;
    }

    if (DECISION_OR_METHOD_PATTERN.test(trimmed)) {
      continue;
    }

    sections[activeKey].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()])
  );
}

function formatFindingSummaryLine(finding = {}) {
  const title = finding.title ? `**${finding.title}**` : "**Finding**";
  const scope = finding.scope ? ` (${finding.scope})` : "";
  const details = finding.details ? ` -- ${finding.details}` : "";
  const recommendation = finding.recommendation
    ? ` Recommendation: ${finding.recommendation}`
    : "";

  return `- ${title}${scope}${details}${recommendation}`.trim();
}

function renderBlockingFindingsFallback(findings = []) {
  const blockingFindings = findings.filter(
    (finding) => `${finding?.level || ""}`.trim().toLowerCase() === "blocking"
  );

  if (!blockingFindings.length) {
    return "No blocking findings.";
  }

  return blockingFindings.map((finding) => formatFindingSummaryLine(finding)).join("\n");
}

function renderNonBlockingNotesFallback(findings = []) {
  const nonBlockingFindings = findings.filter(
    (finding) => `${finding?.level || ""}`.trim().toLowerCase() === "non_blocking"
  );

  if (!nonBlockingFindings.length) {
    return "_None._";
  }

  return nonBlockingFindings.map((finding) => formatFindingSummaryLine(finding)).join("\n");
}

function resolveSummaryFallback(review = {}) {
  const summary = `${review?.summary || ""}`.trim();

  return summary || "_No summary provided._";
}

function buildNarrativeDetailsSections({ review, reviewMarkdown }) {
  const parsed = parseReviewNarrativeSections(reviewMarkdown);
  const summaryContent = parsed.summary || resolveSummaryFallback(review);
  const blockingContent = parsed.blocking || renderBlockingFindingsFallback(review.findings);
  const nonBlockingContent =
    parsed.nonBlocking || renderNonBlockingNotesFallback(review.findings);

  return {
    summary: renderDetailsBlock(
      NARRATIVE_SECTION_SUMMARIES.summary,
      summaryContent,
      { open: true }
    ),
    blocking: renderDetailsBlock(
      NARRATIVE_SECTION_SUMMARIES.blocking,
      blockingContent,
      { open: true }
    ),
    nonBlocking: renderDetailsBlock(
      NARRATIVE_SECTION_SUMMARIES.nonBlocking,
      nonBlockingContent,
      { open: true }
    )
  };
}

function buildCuratedReviewMarkdown({ review, reviewMarkdown }) {
  const narrativeSections = buildNarrativeDetailsSections({ review, reviewMarkdown });
  const traceability = renderCanonicalTraceabilityMarkdown(
    review.requirement_checks
  ).trim();
  const segments = [
    narrativeSections.summary,
    narrativeSections.blocking,
    narrativeSections.nonBlocking,
    traceability
  ].filter((segment) => `${segment || ""}`.trim());

  return segments.join("\n\n").trim();
}

const REVIEW_DECISION_DISPLAY = Object.freeze({
  pass: { icon: "✅", label: "PASS" },
  request_changes: { icon: "❌", label: "REQUEST_CHANGES" }
});

function resolveReviewDecisionLine({ decision, methodology } = {}) {
  const normalizedDecision = `${decision || ""}`.trim().toLowerCase();
  const display = REVIEW_DECISION_DISPLAY[normalizedDecision] || {
    icon: "",
    label: normalizedDecision ? normalizedDecision.toUpperCase() : "UNKNOWN"
  };
  const methodDisplay = (methodology || "").trim() || "unknown";
  const iconPrefix = display.icon ? `${display.icon} ` : "";

  return `**${iconPrefix}${display.label}** · Method: \`${methodDisplay}\``;
}

function countRequirementGaps(requirementChecks = []) {
  return requirementChecks.filter((check) =>
    ["partially_satisfied", "not_satisfied"].includes(
      `${check?.status || ""}`.trim().toLowerCase()
    )
  ).length;
}

function buildArtifactsLine({ links, artifactsPath }) {
  const reviewMarkdownPath = path.posix.join(artifactsPath, "review.md");
  const reviewJsonPath = path.posix.join(artifactsPath, "review.json");
  const reviewDisplay = links.review
    ? `[Review summary](${links.review})`
    : `\`${reviewMarkdownPath}\``;
  const reviewJsonDisplay = links.reviewJson
    ? `[Review JSON](${links.reviewJson})`
    : `\`${reviewJsonPath}\``;

  return `${reviewDisplay} · ${reviewJsonDisplay}`;
}

function buildFactoryReviewHeader({ review, links, artifactsPath }) {
  const lines = [
    "## Factory Review",
    resolveReviewDecisionLine(review),
    "",
    `**Findings:** Blocking ${review.blocking_findings_count} · Requirement gaps ${countRequirementGaps(review.requirement_checks)}`,
    ...(Array.isArray(review.reviewers_run) && review.reviewers_run.length
      ? [`**Reviewers:** ${review.reviewers_run.map((entry) => entry.name).join(", ")}`]
      : []),
    `**Artifacts:** ${buildArtifactsLine({ links, artifactsPath })}`,
    "",
    "### Requirement Gaps",
    renderUnmetRequirementChecksSummary(review.requirement_checks)
  ];

  return lines
    .filter((line, index, allLines) => !(line === "" && allLines[index - 1] === ""))
    .join("\n")
    .trim();
}

function resolveReviewReference({ links, artifactsPath }) {
  if (links.review) {
    return `[review.md](${links.review})`;
  }

  const reviewMarkdownPath = path.posix.join(artifactsPath, "review.md");
  return `\`${reviewMarkdownPath}\``;
}

function buildTruncatedReviewSection({
  normalizedReviewMarkdown,
  header,
  maxBodyChars,
  links,
  artifactsPath
}) {
  const headerSegment = `${header}\n\n`;
  const truncationNote = `\n\n**Review truncated after traceability details. See ${resolveReviewReference({
    links,
    artifactsPath
  })} for the full report.**`;
  const reserve = truncationNote.length;
  const maxCoreLength = Math.max(0, maxBodyChars - headerSegment.length - reserve);

  const lines = normalizedReviewMarkdown.split("\n");
  const traceabilityIndex = findTraceabilityLineIndex(lines);
  const hasAnchor = traceabilityIndex !== -1;
  const detailsStartIndex =
    hasAnchor && traceabilityIndex > 0 && lines[traceabilityIndex - 1].trim() === "<details>"
      ? traceabilityIndex - 1
      : traceabilityIndex;
  const narrativeLines = hasAnchor ? lines.slice(0, detailsStartIndex) : lines;
  const narrativeOriginal = narrativeLines.join("\n").trimEnd();

  const canonicalOpenLine =
    hasAnchor && detailsStartIndex < lines.length ? lines[detailsStartIndex] : "<details>";
  const anchorLine = hasAnchor ? lines[traceabilityIndex] : "";
  const canonicalCloseLine =
    hasAnchor && lines.length > 0 ? lines[lines.length - 1] : "</details>";

  const canonicalFull = hasAnchor
    ? lines.slice(detailsStartIndex).join("\n").trim()
    : "";
  const canonicalMinimal = anchorLine
    ? [canonicalOpenLine, anchorLine, "", canonicalCloseLine].join("\n")
    : "";

  if (maxCoreLength <= 0) {
    if (canonicalMinimal) {
      const headerLimit = Math.max(0, maxBodyChars - canonicalMinimal.length - reserve);
      const headerTextLimit = Math.max(0, headerLimit - 2);
      const trimmedHeaderText = trimCorePreservingIntro(header, headerTextLimit);
      const trimmedHeaderSegment = trimmedHeaderText ? `${trimmedHeaderText}\n\n` : "";
      const anchorBody = `${trimmedHeaderSegment}${canonicalMinimal}${truncationNote}`.trimStart();

      if (anchorBody.length <= maxBodyChars) {
        return anchorBody;
      }

      const anchorOnlyBody = `${canonicalMinimal}${truncationNote}`.trimStart();

      if (anchorOnlyBody.length <= maxBodyChars) {
        return anchorOnlyBody;
      }

      return anchorOnlyBody.slice(0, maxBodyChars);
    }

    const trimmedHeader = trimCorePreservingIntro(header, maxBodyChars);
    const withNote = `${trimmedHeader}${truncationNote}`.trimStart();

    if (withNote.length <= maxBodyChars) {
      return withNote;
    }

    return withNote.slice(0, maxBodyChars);
  }

  let narrativePart = narrativeOriginal;
  let canonicalPart = canonicalFull;

  const buildSection = () => {
    const parts = [];

    if (narrativePart) {
      parts.push(narrativePart);
    }

    if (canonicalPart) {
      parts.push(canonicalPart);
    }

    return parts.join("\n\n");
  };

  let visibleSection = buildSection();

  if (visibleSection.length > maxCoreLength) {
    const separatorLength = narrativePart && canonicalPart ? 2 : 0;
    const canonicalLength = canonicalPart.length;
    const availableNarrative = Math.max(0, maxCoreLength - canonicalLength - separatorLength);
    narrativePart = trimCorePreservingIntro(narrativeOriginal, availableNarrative);
    visibleSection = buildSection();
  }

  if (visibleSection.length > maxCoreLength && canonicalMinimal) {
    canonicalPart = canonicalMinimal;
    const separatorLength = narrativePart && canonicalPart ? 2 : 0;
    const canonicalLength = canonicalPart.length;
    const availableNarrative = Math.max(0, maxCoreLength - canonicalLength - separatorLength);
    narrativePart = trimCorePreservingIntro(narrativeOriginal, availableNarrative);
    visibleSection = buildSection();
  }

  if (visibleSection.length > maxCoreLength && canonicalPart) {
    narrativePart = "";
    visibleSection = buildSection();
  }

  if (!visibleSection && canonicalPart) {
    visibleSection = canonicalPart;
  }

  const sectionCore = `${headerSegment}${visibleSection}`.replace(/\s+$/u, "");
  const truncatedBody = `${sectionCore}${truncationNote}`.trimStart();

  if (truncatedBody.length <= maxBodyChars) {
    return truncatedBody;
  }

  if (canonicalPart) {
    const headerLimit = Math.max(0, maxBodyChars - canonicalPart.length - reserve);
    const headerTextLimit = Math.max(0, headerLimit - 2);
    const trimmedHeaderText = trimCorePreservingIntro(header, headerTextLimit);
    const trimmedHeaderSegment = trimmedHeaderText ? `${trimmedHeaderText}\n\n` : "";
    const headerTrimmedBody = `${trimmedHeaderSegment}${canonicalPart}${truncationNote}`.trimStart();

    if (headerTrimmedBody.length <= maxBodyChars) {
      return headerTrimmedBody;
    }

    const anchorOnlyBody = `${canonicalPart}${truncationNote}`.trimStart();

    if (anchorOnlyBody.length <= maxBodyChars) {
      return anchorOnlyBody;
    }

    return anchorOnlyBody.slice(0, maxBodyChars);
  }

  const fallbackCore = trimCorePreservingIntro(normalizedReviewMarkdown, maxCoreLength);
  const fallbackSection = `${headerSegment}${fallbackCore}`.replace(/\s+$/u, "");
  const fallbackWithNote = `${fallbackSection}${truncationNote}`.trimStart();

  if (fallbackWithNote.length <= maxBodyChars) {
    return fallbackWithNote;
  }

  return fallbackWithNote.slice(0, maxBodyChars);
}

export function buildReviewConversationBody({
  review,
  reviewMarkdown,
  artifactsPath,
  repositoryUrl = "",
  branch = "",
  maxBodyChars = MAX_REVIEW_BODY_CHARS
}) {
  const curatedReviewMarkdown = buildCuratedReviewMarkdown({ review, reviewMarkdown });
  const normalizedReviewMarkdown = normalizeReviewMarkdown(curatedReviewMarkdown);
  const links = buildArtifactLinks({ repositoryUrl, branch, artifactsPath });
  const header = buildFactoryReviewHeader({ review, links, artifactsPath });
  const sections = [header];

  if (normalizedReviewMarkdown) {
    sections.push(normalizedReviewMarkdown);
  }

  const fullBody = sections.join("\n\n").trim();

  if (fullBody.length <= maxBodyChars) {
    return fullBody;
  }

  return buildTruncatedReviewSection({
    normalizedReviewMarkdown,
    header,
    maxBodyChars,
    links,
    artifactsPath
  });
}
