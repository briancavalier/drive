export const FACTORY_LABELS = {
  start: "factory:start",
  managed: "factory:managed",
  planReady: "factory:plan-ready",
  implement: "factory:implement",
  blocked: "factory:blocked",
  paused: "factory:paused"
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
  FACTORY_PR_STATUSES.repairing
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
  }
];

export const PR_STATE_MARKER = "factory-state";
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;
export const DEFAULT_CI_WORKFLOW_NAME = "CI";

export function isFactoryBranch(branchName) {
  return typeof branchName === "string" && branchName.startsWith("factory/");
}

export function issueArtifactsPath(issueNumber) {
  return `.factory/runs/${issueNumber}`;
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
