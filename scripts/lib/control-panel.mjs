import {
  FACTORY_COMMAND_CONTEXTS,
  FACTORY_COMMANDS,
  FACTORY_LABELS,
  FACTORY_PR_STATUSES,
  FACTORY_RESUMABLE_FAILURE_TYPES,
  FACTORY_SLASH_COMMANDS
} from "./factory-config.mjs";
import { formatEstimatedUsd } from "./cost-estimation.mjs";

const STATE_DISPLAY = Object.freeze({
  paused: { emoji: "⏸️", label: "Paused" },
  [FACTORY_PR_STATUSES.planReady]: { emoji: "👀", label: "Plan ready" },
  [FACTORY_PR_STATUSES.implementing]: { emoji: "🏗️", label: "Implementing" },
  [FACTORY_PR_STATUSES.repairing]: { emoji: "🛠️", label: "Repairing" },
  [FACTORY_PR_STATUSES.reviewing]: { emoji: "🔍", label: "Reviewing" },
  [FACTORY_PR_STATUSES.readyForReview]: { emoji: "✅", label: "Ready for review" },
  [FACTORY_PR_STATUSES.blocked]: { emoji: "⚠️", label: "Blocked" },
  [FACTORY_PR_STATUSES.planning]: { emoji: "📝", label: "Planning" }
});

const WAITING_ON = Object.freeze({
  paused: "operator",
  [FACTORY_PR_STATUSES.planReady]: "operator",
  [FACTORY_PR_STATUSES.planning]: "operator",
  [FACTORY_PR_STATUSES.implementing]: "agent",
  [FACTORY_PR_STATUSES.repairing]: "agent",
  [FACTORY_PR_STATUSES.reviewing]: "agent",
  [FACTORY_PR_STATUSES.readyForReview]: "human reviewer",
  [FACTORY_PR_STATUSES.blocked]: "operator"
});

const CI_STATUS_DISPLAY = Object.freeze({
  pending: { emoji: "⏳", label: "pending" },
  success: { emoji: "✅", label: "success" },
  failure: { emoji: "❌", label: "failure" }
});

const ACTION_DEFINITIONS = Object.freeze({
  startImplement: {
    id: "start_implement",
    label: `▶ Comment ${FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.implement]}`,
    kind: "mutation"
  },
  pause: {
    id: "pause",
    label: `⏸ Comment ${FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.pause]}`,
    kind: "mutation"
  },
  resume: {
    id: "resume",
    label: `▶ Comment ${FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.resume]}`,
    kind: "mutation"
  },
  reset: {
    id: "reset",
    label: `🧹 Comment ${FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.reset]}`,
    kind: "mutation"
  },
  pauseAutomation: {
    id: "pause",
    label: `⏸ Comment ${FACTORY_SLASH_COMMANDS[FACTORY_COMMAND_CONTEXTS.pullRequest][FACTORY_COMMANDS.pause]}`,
    kind: "mutation"
  },
  openLatestRun: {
    id: "open_latest_run",
    label: "🏃 Open latest run",
    kind: "link"
  },
  openPlanArtifacts: {
    id: "open_plan_artifacts",
    label: "📄 Open plan artifacts",
    kind: "link"
  },
  openDiagnostics: {
    id: "open_diagnostics",
    label: "🔎 Open diagnostics",
    kind: "link"
  },
  openArtifacts: {
    id: "open_artifacts",
    label: "📄 Open artifacts",
    kind: "link"
  },
  openReviewArtifacts: {
    id: "open_review_artifacts",
    label: "🧾 Open review artifacts",
    kind: "link"
  },
  openBranch: {
    id: "open_branch",
    label: "🌿 Open branch",
    kind: "link"
  },
  openFailureHistory: {
    id: "open_failure_history",
    label: "🧭 Open failure history",
    kind: "link"
  }
});

function normalizeLabelNames(labels = []) {
  return new Set(
    labels
      .map((label) => `${label?.name || ""}`.trim().toLowerCase())
      .filter(Boolean)
  );
}

function resolveState({ metadata = {}, labelNames }) {
  const status = `${metadata.status || ""}`.trim();
  const pausedFromMetadata = metadata.paused === true;
  const pausedFromLabel = labelNames.has(FACTORY_LABELS.paused.toLowerCase());

  if (pausedFromMetadata || pausedFromLabel) {
    return "paused";
  }

  return status || "unknown";
}

function resolveStateDisplay(stateKey) {
  const display = STATE_DISPLAY[stateKey];

  if (!display) {
    return {
      emoji: "",
      label: stateKey || "Unknown",
      text: stateKey || "Unknown"
    };
  }

  const text = display.emoji ? `${display.emoji} ${display.label}` : display.label;

  return {
    emoji: display.emoji,
    label: display.label,
    text
  };
}

function resolveWaitingOn(stateKey) {
  return WAITING_ON[stateKey] || "operator";
}

const STAGE_FALLBACK = Object.freeze({
  [FACTORY_PR_STATUSES.planReady]: "plan",
  [FACTORY_PR_STATUSES.implementing]: "plan",
  [FACTORY_PR_STATUSES.repairing]: "implement",
  [FACTORY_PR_STATUSES.reviewing]: "implement",
  [FACTORY_PR_STATUSES.readyForReview]: "review",
  [FACTORY_PR_STATUSES.blocked]: "implement",
  paused: "implement"
});

function resolveLastCompletedStage({ metadata = {}, stateKey }) {
  const normalized = `${metadata.lastCompletedStage || ""}`.trim();

  if (normalized) {
    return normalized;
  }

  if (stateKey === FACTORY_PR_STATUSES.blocked) {
    if (metadata.lastFailureType === "review_artifact_contract" || metadata.pendingReviewSha) {
      return "review";
    }

    if (metadata.lastFailureType === "plan_noop") {
      return "plan";
    }
  }

  return STAGE_FALLBACK[stateKey] || "";
}

function buildPullRequestUrl(repositoryUrl, prNumber) {
  const normalizedRepo = `${repositoryUrl || ""}`.trim();
  const numericPr = Number(prNumber);

  if (!normalizedRepo || !Number.isInteger(numericPr) || numericPr <= 0) {
    return "";
  }

  try {
    return new URL(`${normalizedRepo.replace(/\/$/, "")}/pull/${numericPr}`).toString();
  } catch {
    return "";
  }
}

function buildCommandAction(definition, context) {
  const { repositoryUrl, prNumber } = context;
  const url = buildPullRequestUrl(repositoryUrl, prNumber);

  if (!url) {
    return null;
  }

  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    url
  };
}

function buildLinkAction(definition, url) {
  if (!url) {
    return null;
  }

  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    url
  };
}

function canResumeBlockedRun(metadata = {}) {
  return (
    FACTORY_RESUMABLE_FAILURE_TYPES.includes(`${metadata.lastFailureType || ""}`.trim()) &&
    ["implement", "repair", "review"].includes(`${metadata.blockedAction || ""}`.trim())
  );
}

function canResumePausedRun(metadata = {}) {
  const status = `${metadata.status || ""}`.trim();

  return [
    FACTORY_PR_STATUSES.planReady,
    FACTORY_PR_STATUSES.implementing,
    FACTORY_PR_STATUSES.repairing,
    FACTORY_PR_STATUSES.reviewing
  ].includes(status);
}

function isRepairCapExceeded(metadata = {}) {
  const attempts = Number(metadata.repairAttempts || 0);
  const limit = Number(metadata.maxRepairAttempts || 0);
  const repeated = Number(metadata.repeatedFailureCount || 0);
  return (limit > 0 && attempts > limit) || repeated >= 2;
}

function hasSelfModifyGuardSignature(metadata = {}) {
  const signature = `${metadata.lastFailureSignature || ""}`.toLowerCase();

  return (
    signature.includes("factory:self-modify") ||
    signature.includes("self-modifying factory run") ||
    signature.includes("facto") && signature.includes("self modify")
  );
}

function buildBlockedReason({ metadata }) {
  const failureType = `${metadata.lastFailureType || ""}`.trim();

  if (isRepairCapExceeded(metadata)) {
    const attempts = Number(metadata.repairAttempts || 0);
    const limit = Number(metadata.maxRepairAttempts || 0);
    const attemptText =
      limit > 0 ? `${attempts}/${limit} repair attempts exhausted` : `${attempts} repair attempts exhausted`;

    return `Latest repair run exhausted automatic retries. (${attemptText})`;
  }

  if (failureType === "stage_noop") {
    const attempts = Number(metadata.stageNoopAttempts || 0);
    return attempts > 1
      ? "Latest stage run produced no committed changes after repeated attempts."
      : "Latest stage run produced no committed changes.";
  }

  if (failureType === "stage_setup") {
    if (hasSelfModifyGuardSignature(metadata)) {
      return "Self-modify guard blocked protected file changes until approved.";
    }

    return "Stage setup prerequisites failed before automation could run.";
  }

  if (failureType === "transient_infra") {
    const retries = Number(metadata.transientRetryAttempts || 0);
    return retries > 0
      ? `Run hit transient infrastructure issues after ${retries} automated retr${retries === 1 ? "y" : "ies"}.`
      : "Run hit transient infrastructure issues.";
  }

  if (failureType === "stale_branch_conflict") {
    return "Branch drift detected; merge conflict prevented the stage from completing.";
  }

  if (failureType === "review_artifact_contract") {
    const failure = metadata.lastReviewArtifactFailure;
    const detail = `${failure?.message || failure?.type || ""}`.trim();
    return detail
      ? `Review artifact contract failed: ${detail}`
      : "Review artifact contract failed validation.";
  }

  if (failureType === "content_or_logic") {
    return "Automation completed but produced failing output that needs human review.";
  }

  return "";
}

function buildReason({ stateKey, metadata }) {
  if (stateKey === "paused") {
    const pauseReason = `${metadata.pauseReason || ""}`.trim();

    if (pauseReason === "manual") {
      return "Automation manually paused by an operator.";
    }

    if (pauseReason) {
      return `Automation paused: ${pauseReason}`;
    }

    return "Automation paused.";
  }

  if (stateKey === FACTORY_PR_STATUSES.readyForReview && metadata.pendingReviewSha) {
    return `New commits detected at ${metadata.pendingReviewSha}; waiting for human review.`;
  }

  if (stateKey === FACTORY_PR_STATUSES.blocked) {
    return buildBlockedReason({ metadata });
  }

  return "";
}

function buildRecommendedNextStep({ stateKey, metadata }) {
  if (stateKey === "paused") {
    return "Resume automation when you're ready to continue this run.";
  }

  if (stateKey === FACTORY_PR_STATUSES.planReady) {
    return "Review the plan artifacts, then start implementation if they look good.";
  }

  if (stateKey === FACTORY_PR_STATUSES.implementing) {
    return "Automation is coding; monitor the latest run or pause if intervention is needed.";
  }

  if (stateKey === FACTORY_PR_STATUSES.repairing) {
    return "Automation is attempting repairs; review diagnostics if failures repeat.";
  }

  if (stateKey === FACTORY_PR_STATUSES.reviewing) {
    return "Automation is processing review artifacts; wait for the outcome.";
  }

  if (stateKey === FACTORY_PR_STATUSES.readyForReview) {
    return "Hand off to a human reviewer and collect the review approval.";
  }

  if (stateKey === FACTORY_PR_STATUSES.blocked) {
    const failureType = `${metadata.lastFailureType || ""}`.trim();

    if (isRepairCapExceeded(metadata)) {
      return "Escalate to a human reviewer or reset the run before trying again.";
    }

    if (failureType === "stage_noop") {
      return "Inspect stage diagnostics, then rerun or reset once the changes are ready.";
    }

    if (failureType === "stage_setup") {
      if (hasSelfModifyGuardSignature(metadata)) {
        return "Approve self-modify or reset the PR before rerunning the stage.";
      }

      return "Fix the setup prerequisites (tokens, permissions, etc.) and retry the stage.";
    }

    if (failureType === "transient_infra") {
      return "Retry the stage once infrastructure issues are cleared.";
    }

    if (failureType === "stale_branch_conflict") {
      return "Update the branch to resolve conflicts, then rerun the stage.";
    }

    if (failureType === "review_artifact_contract") {
      return "Correct the review artifacts and trigger another review stage.";
    }

    return "Review the failure context and decide whether to retry or reset.";
  }

  return "Monitor automation progress and intervene if needed.";
}

function buildActions({
  stateKey,
  metadata,
  context,
  artifactLinks,
  latestRunUrl
}) {
  const actions = [];
  const pushAction = (action) => {
    if (action) {
      actions.push(action);
    }
  };

  if (stateKey === FACTORY_PR_STATUSES.planReady) {
    pushAction(buildCommandAction(ACTION_DEFINITIONS.startImplement, context));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openPlanArtifacts, artifactLinks.plan));
    return actions;
  }

  if (stateKey === FACTORY_PR_STATUSES.implementing) {
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
    return actions;
  }

  if (stateKey === FACTORY_PR_STATUSES.repairing) {
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
    return actions;
  }

  if (stateKey === FACTORY_PR_STATUSES.reviewing) {
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
    return actions;
  }

  if (stateKey === FACTORY_PR_STATUSES.readyForReview) {
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openReviewArtifacts, artifactLinks.review || artifactLinks.reviewJson));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pauseAutomation, context));
    return actions;
  }

  if (stateKey === "paused") {
    if (canResumePausedRun(metadata)) {
      pushAction(buildCommandAction(ACTION_DEFINITIONS.resume, context));
    }
    pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
    return actions;
  }

  if (stateKey === FACTORY_PR_STATUSES.blocked) {
    const failureType = `${metadata.lastFailureType || ""}`.trim();

    if (isRepairCapExceeded(metadata)) {
      pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openFailureHistory, artifactLinks.repairLog));
      return actions;
    }

    if (failureType === "stage_noop") {
      pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openDiagnostics, artifactLinks.repairLog));
      return actions;
    }

    if (failureType === "stage_setup") {
      if (!hasSelfModifyGuardSignature(metadata) && canResumeBlockedRun(metadata)) {
        pushAction(buildCommandAction(ACTION_DEFINITIONS.resume, context));
      }
      pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
      return actions;
    }

    if (failureType === "transient_infra") {
      if (canResumeBlockedRun(metadata)) {
        pushAction(buildCommandAction(ACTION_DEFINITIONS.resume, context));
      }
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
      return actions;
    }

    if (failureType === "stale_branch_conflict") {
      const branchUrl =
        context.repositoryUrl && context.branch
          ? `${context.repositoryUrl.replace(/\/$/, "")}/tree/${context.branch}`
          : "";
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openBranch, branchUrl));
      if (canResumeBlockedRun(metadata)) {
        pushAction(buildCommandAction(ACTION_DEFINITIONS.resume, context));
      }
      pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      return actions;
    }

    if (failureType === "review_artifact_contract") {
      const reviewLink = artifactLinks.review || artifactLinks.reviewJson;
      pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
      pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
      pushAction(buildLinkAction(ACTION_DEFINITIONS.openArtifacts, reviewLink));
      return actions;
    }

    if (canResumeBlockedRun(metadata)) {
      pushAction(buildCommandAction(ACTION_DEFINITIONS.resume, context));
    }
    pushAction(buildCommandAction(ACTION_DEFINITIONS.reset, context));
    pushAction(buildCommandAction(ACTION_DEFINITIONS.pause, context));
    pushAction(buildLinkAction(ACTION_DEFINITIONS.openLatestRun, latestRunUrl));
    return actions;
  }

  return actions;
}

function resolveLatestRunUrl({ metadata = {}, repositoryUrl }) {
  const explicit = `${metadata.lastRunUrl || ""}`.trim();

  if (explicit) {
    return explicit;
  }

  const runId = `${metadata.lastRunId || ""}`.trim();

  if (!runId || !repositoryUrl) {
    return "";
}

  return `${repositoryUrl.replace(/\/$/, "")}/actions/runs/${runId}`;
}

function formatOwnerLabel(waitingOn) {
  const normalized = `${waitingOn || ""}`.trim();

  if (!normalized) {
    return "—";
  }

  return normalized[0].toUpperCase() + normalized.slice(1);
}

function formatStageValue(stage) {
  const normalized = `${stage || ""}`.trim();

  if (!normalized) {
    return "—";
  }

  return `\`${normalized}\``;
}

function formatCiStatus(ciStatus) {
  const normalized = `${ciStatus || ""}`.trim().toLowerCase();
  const display = CI_STATUS_DISPLAY[normalized];

  if (!display) {
    return normalized || "—";
  }

  return display.emoji ? `${display.emoji} ${display.label}` : display.label;
}

function formatRepairsDisplay(repairAttempts, maxRepairAttempts) {
  const attempts = Number(repairAttempts);
  const limit = Number(maxRepairAttempts);

  if (!Number.isFinite(attempts) || attempts < 0) {
    return "—";
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return "—";
  }

  return `${Math.max(0, attempts)}/${Math.max(0, limit)}`;
}

function formatCostDisplay(metadata = {}) {
  const amount = Number(metadata.costEstimateUsd);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "—";
  }

  const parts = [];
  const emoji = `${metadata.costEstimateEmoji || ""}`.trim();

  if (emoji) {
    parts.push(emoji);
  }

  const band = `${metadata.costEstimateBand || ""}`.trim() || "unknown";
  parts.push(`$${formatEstimatedUsd(amount)} total (${band})`);

  return parts.join(" ");
}

function formatEstimateDisplay(metadata = {}) {
  const amount = Number(metadata.lastStageCostEstimateUsd);
  const model = `${metadata.lastEstimatedModel || ""}`.trim();

  if (!Number.isFinite(amount) || amount <= 0 || !model) {
    return "—";
  }

  return `$${formatEstimatedUsd(amount)} via ${model}`;
}

function uniqueLinks(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const url = `${item?.url || ""}`.trim();

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    result.push({
      label: item.label || url,
      url
    });
  }

  return result;
}

function buildArtifactGroups(artifactLinks = {}) {
  const groups = [
    {
      key: "plan",
      label: "Plan",
      links: [
        { label: "approved-issue.md", url: artifactLinks.approvedIssue },
        { label: "spec.md", url: artifactLinks.spec },
        { label: "plan.md", url: artifactLinks.plan },
        { label: "acceptance-tests.md", url: artifactLinks.acceptanceTests }
      ]
    },
    {
      key: "execution",
      label: "Execution",
      links: [
        { label: "repair-log.md", url: artifactLinks.repairLog },
        { label: "cost-summary.json", url: artifactLinks.costSummary }
      ]
    },
    {
      key: "review",
      label: "Review",
      links: [
        { label: "review.md", url: artifactLinks.review },
        { label: "review.json", url: artifactLinks.reviewJson }
      ]
    }
  ];

  return groups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => `${link?.url || ""}`.trim())
    }))
    .filter((group) => group.links.length > 0);
}

function buildOpenLinks({ actions = [], artifactLinks = {} }) {
  const reviewLinks = [
    artifactLinks.review
      ? { label: "🧾 review.md", url: artifactLinks.review }
      : null,
    artifactLinks.reviewJson
      ? { label: "🧾 review.json", url: artifactLinks.reviewJson }
      : null
  ].filter(Boolean);
  const linkActions = actions
    .filter((action) => action?.kind === "link")
    .map((action) => ({
      label: action.label,
      url: action.url
    }));

  return uniqueLinks([...reviewLinks, ...linkActions]);
}

export function buildDashboard({
  metadata = {},
  labels = [],
  repositoryUrl = "",
  branch = "",
  prNumber,
  artifactLinks = {},
  ciStatus = "pending"
}) {
  const labelNames = normalizeLabelNames(labels);
  const stateKey = resolveState({ metadata, labelNames });
  const stateDisplay = resolveStateDisplay(stateKey);
  const waitingOn = resolveWaitingOn(stateKey);
  const lastCompletedStage = resolveLastCompletedStage({ metadata, stateKey });
  const reason = buildReason({ stateKey, metadata });
  const recommendedNextStep = buildRecommendedNextStep({ stateKey, metadata });
  const latestRunUrl = resolveLatestRunUrl({ metadata, repositoryUrl });
  const actions = buildActions({
    stateKey,
    metadata,
    context: { repositoryUrl, prNumber, branch },
    artifactLinks,
    latestRunUrl
  });
  const mutationActions = actions.filter((action) => action?.kind === "mutation");
  const openLinks = buildOpenLinks({ actions, artifactLinks });
  const artifactGroups = buildArtifactGroups(artifactLinks);
  const stateValue = reason ? `${stateDisplay.text} — ${reason}` : stateDisplay.text;

  return {
    state: stateKey,
    stateDisplay: stateDisplay.text,
    waitingOn,
    reason,
    recommendedNextStep,
    latestRun: latestRunUrl
      ? {
          label: ACTION_DEFINITIONS.openLatestRun.label,
          url: latestRunUrl
        }
      : null,
    rows: [
      {
        key: "state",
        label: "State",
        value: stateValue || "Unknown"
      },
      {
        key: "owner",
        label: "Owner",
        value: formatOwnerLabel(waitingOn)
      },
      {
        key: "stage",
        label: "Stage",
        value: formatStageValue(lastCompletedStage)
      },
      {
        key: "ci",
        label: "CI",
        value: formatCiStatus(ciStatus)
      },
      {
        key: "repairs",
        label: "Repairs",
        value: formatRepairsDisplay(metadata.repairAttempts, metadata.maxRepairAttempts)
      },
      {
        key: "cost",
        label: "Cost",
        value: formatCostDisplay(metadata)
      },
      {
        key: "estimate",
        label: "Estimate",
        value: formatEstimateDisplay(metadata)
      },
      {
        key: "next",
        label: "Next",
        value: recommendedNextStep || "Monitor automation progress and intervene if needed."
      }
    ],
    openLinks,
    actions: mutationActions,
    artifactGroups
  };
}
