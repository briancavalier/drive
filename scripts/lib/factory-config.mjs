export const FACTORY_LABELS = {
  start: "factory:start",
  managed: "factory:managed",
  planReady: "factory:plan-ready",
  implement: "factory:implement",
  blocked: "factory:blocked",
  paused: "factory:paused"
};

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
