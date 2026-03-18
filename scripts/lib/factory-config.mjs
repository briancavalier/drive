export const FACTORY_LABELS = {
  start: "factory:start",
  managed: "factory:managed",
  planReady: "factory:plan-ready",
  implement: "factory:implement",
  blocked: "factory:blocked",
  paused: "factory:paused",
  intakeRejected: "factory:intake-rejected",
  costLow: "factory:cost-low",
  costMedium: "factory:cost-medium",
  costHigh: "factory:cost-high"
};

export const FACTORY_STAGE_MODES = Object.freeze({
  plan: "plan",
  implement: "implement",
  repair: "repair",
  review: "review"
});

export const FACTORY_STAGE_MODE_VALUES = Object.freeze(
  Object.values(FACTORY_STAGE_MODES)
);

export const FACTORY_PR_STATUSES = Object.freeze({
  planning: "planning",
  planReady: "plan_ready",
  implementing: "implementing",
  repairing: "repairing",
  reviewing: "reviewing",
  readyForReview: "ready_for_review",
  blocked: "blocked"
});

export const FACTORY_PR_STATUS_VALUES = Object.freeze(
  Object.values(FACTORY_PR_STATUSES)
);

export const FACTORY_IMPLEMENT_TRIGGER_STATUSES = Object.freeze([
  FACTORY_PR_STATUSES.planReady,
  FACTORY_PR_STATUSES.implementing
]);

export const FACTORY_REVIEW_REPAIRABLE_STATUSES = Object.freeze([
  FACTORY_PR_STATUSES.implementing,
  FACTORY_PR_STATUSES.repairing,
  FACTORY_PR_STATUSES.reviewing,
  FACTORY_PR_STATUSES.readyForReview
]);

export const FACTORY_ACTIVE_CI_STATUSES = Object.freeze([
  FACTORY_PR_STATUSES.implementing,
  FACTORY_PR_STATUSES.repairing,
  FACTORY_PR_STATUSES.reviewing
]);

export const FACTORY_RESETTABLE_PR_STATUSES = Object.freeze([
  FACTORY_PR_STATUSES.planning,
  FACTORY_PR_STATUSES.planReady,
  FACTORY_PR_STATUSES.implementing,
  FACTORY_PR_STATUSES.repairing,
  FACTORY_PR_STATUSES.reviewing,
  FACTORY_PR_STATUSES.blocked,
  FACTORY_PR_STATUSES.readyForReview
]);

export const LABEL_DEFINITIONS = [
  {
    name: FACTORY_LABELS.start,
    color: "0E8A16",
    description: "Start a new autonomous factory run from a structured issue"
  },
  {
    name: FACTORY_LABELS.managed,
    color: "0052CC",
    description: "Marks a pull request as managed by the autonomous factory"
  },
  {
    name: FACTORY_LABELS.planReady,
    color: "5319E7",
    description: "Planning artifacts are ready for human review"
  },
  {
    name: FACTORY_LABELS.implement,
    color: "FBCA04",
    description: "Approve the plan and start implementation"
  },
  {
    name: FACTORY_LABELS.blocked,
    color: "D93F0B",
    description: "Factory execution is blocked and needs human attention"
  },
  {
    name: FACTORY_LABELS.paused,
    color: "BFD4F2",
    description: "Pause autonomous activity for this pull request"
  },
  {
    name: FACTORY_LABELS.intakeRejected,
    color: "D73A4A",
    description:
      "Factory intake was rejected; issue needs updates before planning can start."
  },
  {
    name: FACTORY_LABELS.costLow,
    color: "0E8A16",
    description: "Estimated factory cost is in the low advisory band"
  },
  {
    name: FACTORY_LABELS.costMedium,
    color: "FBCA04",
    description: "Estimated factory cost is in the medium advisory band"
  },
  {
    name: FACTORY_LABELS.costHigh,
    color: "D93F0B",
    description: "Estimated factory cost is in the high advisory band"
  }
];

export const PR_STATE_MARKER = "factory-state";
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;
export const DEFAULT_CI_WORKFLOW_NAME = "CI";
export const DEFAULT_FACTORY_CODEX_MODEL = "gpt-5-codex";
export const DEFAULT_FACTORY_REVIEW_MODEL = "gpt-5-mini";
export const FACTORY_STAGE_MODEL_VARIABLES = Object.freeze({
  [FACTORY_STAGE_MODES.plan]: "FACTORY_PLAN_MODEL",
  [FACTORY_STAGE_MODES.implement]: "FACTORY_IMPLEMENT_MODEL",
  [FACTORY_STAGE_MODES.repair]: "FACTORY_REPAIR_MODEL",
  [FACTORY_STAGE_MODES.review]: "FACTORY_REVIEW_MODEL"
});
export const DEFAULT_FACTORY_STAGE_MODELS = Object.freeze({
  [FACTORY_STAGE_MODES.plan]: DEFAULT_FACTORY_CODEX_MODEL,
  [FACTORY_STAGE_MODES.implement]: DEFAULT_FACTORY_CODEX_MODEL,
  [FACTORY_STAGE_MODES.repair]: DEFAULT_FACTORY_CODEX_MODEL,
  [FACTORY_STAGE_MODES.review]: DEFAULT_FACTORY_REVIEW_MODEL
});
export const FACTORY_COST_BANDS = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high"
});
export const FACTORY_COST_LABEL_BY_BAND = Object.freeze({
  [FACTORY_COST_BANDS.low]: FACTORY_LABELS.costLow,
  [FACTORY_COST_BANDS.medium]: FACTORY_LABELS.costMedium,
  [FACTORY_COST_BANDS.high]: FACTORY_LABELS.costHigh
});
export const FACTORY_COST_LABELS = Object.freeze(
  Object.values(FACTORY_COST_LABEL_BY_BAND)
);
export const DEFAULT_FACTORY_COST_WARN_USD = 0.25;
export const DEFAULT_FACTORY_COST_HIGH_USD = 1.0;
export const APPROVED_ISSUE_FILE_NAME = "approved-issue.md";

export function isFactoryBranch(branchName) {
  return typeof branchName === "string" && branchName.startsWith("factory/");
}

export function issueArtifactsPath(issueNumber) {
  return `.factory/runs/${issueNumber}`;
}

export function isFactoryStageMode(value) {
  return FACTORY_STAGE_MODE_VALUES.includes(`${value || ""}`.trim());
}

export function assertFactoryStageMode(value, context = "factory stage mode") {
  const normalized = `${value || ""}`.trim();

  if (!isFactoryStageMode(normalized)) {
    throw new Error(
      `Invalid ${context}: "${normalized || "(empty)"}". Expected one of ${FACTORY_STAGE_MODE_VALUES.join(", ")}`
    );
  }

  return normalized;
}

function normalizeModelName(value) {
  return `${value || ""}`.trim();
}

export function resolveFactoryStageModel({
  mode,
  overrideModel = "",
  variables = process.env
}) {
  const normalizedMode = assertFactoryStageMode(mode);
  const explicitOverride = normalizeModelName(overrideModel);

  if (explicitOverride) {
    return explicitOverride;
  }

  const stageVariableName = FACTORY_STAGE_MODEL_VARIABLES[normalizedMode];
  const stageVariableModel = normalizeModelName(variables?.[stageVariableName]);

  if (stageVariableModel) {
    return stageVariableModel;
  }

  if (normalizedMode !== FACTORY_STAGE_MODES.review) {
    const sharedCodexModel = normalizeModelName(variables?.FACTORY_CODEX_MODEL);

    if (sharedCodexModel) {
      return sharedCodexModel;
    }
  }

  return DEFAULT_FACTORY_STAGE_MODELS[normalizedMode];
}

export function isFactoryPrStatus(value) {
  return FACTORY_PR_STATUS_VALUES.includes(`${value || ""}`.trim());
}

export function assertFactoryPrStatus(value, context = "factory PR status") {
  const normalized = `${value || ""}`.trim();

  if (!isFactoryPrStatus(normalized)) {
    throw new Error(
      `Invalid ${context}: "${normalized || "(empty)"}". Expected one of ${FACTORY_PR_STATUS_VALUES.join(", ")}`
    );
  }

  return normalized;
}

export function labelForCostBand(band) {
  return FACTORY_COST_LABEL_BY_BAND[`${band || ""}`.trim()] || "";
}
