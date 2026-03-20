import test from "node:test";
import assert from "node:assert/strict";
import { buildControlPanel } from "../scripts/lib/control-panel.mjs";
import { defaultPrMetadata } from "../scripts/lib/pr-metadata.mjs";
import { FACTORY_LABELS, FACTORY_PR_STATUSES } from "../scripts/lib/factory-config.mjs";

const repositoryUrl = "https://github.com/example/repo";
const branch = "factory/7-sample";
const baseArtifacts = Object.freeze({
  approvedIssue: `${repositoryUrl}/blob/${branch}/.factory/runs/7/approved-issue.md`,
  spec: `${repositoryUrl}/blob/${branch}/.factory/runs/7/spec.md`,
  plan: `${repositoryUrl}/blob/${branch}/.factory/runs/7/plan.md`,
  acceptanceTests: `${repositoryUrl}/blob/${branch}/.factory/runs/7/acceptance-tests.md`,
  repairLog: `${repositoryUrl}/blob/${branch}/.factory/runs/7/repair-log.md`,
  costSummary: `${repositoryUrl}/blob/${branch}/.factory/runs/7/cost-summary.json`,
  review: `${repositoryUrl}/blob/${branch}/.factory/runs/7/review.md`,
  reviewJson: `${repositoryUrl}/blob/${branch}/.factory/runs/7/review.json`
});

function metadata(overrides = {}) {
  return defaultPrMetadata({
    issueNumber: 7,
    artifactsPath: ".factory/runs/7",
    ...overrides
  });
}

function actionLabels(panel) {
  return panel.actions.map((action) => action.label);
}

function actionIds(panel) {
  return panel.actions.map((action) => action.id);
}

test("paused overlay surfaces resume/reset actions and manual pause reason", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing,
      lastRunUrl: `${repositoryUrl}/actions/runs/901`,
      pauseReason: "manual"
    }),
    labels: [{ name: FACTORY_LABELS.paused }],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(panel.state, "paused");
  assert.equal(panel.waitingOn, "operator");
  assert.equal(panel.reason, "Automation manually paused via label.");
  assert.ok(actionIds(panel).includes("resume"), "expected Resume action");
  assert.ok(actionIds(panel).includes("reset"), "expected Reset PR action");
  assert.ok(actionIds(panel).includes("open_latest_run"), "expected latest run link");
  assert.ok(!actionIds(panel).includes("start_implement"), "agent-only actions should be suppressed");
});

test("blocked reasons map to subtype-specific guidance and actions", () => {
  const scenarios = [
    {
      name: "stage_noop",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_noop",
        stageNoopAttempts: 2,
        lastRunUrl: `${repositoryUrl}/actions/runs/111`
      }),
      expectedActionIds: ["retry", "reset", "pause", "open_diagnostics"],
      reason: /no committed changes/i
    },
    {
      name: "stage_setup",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_setup",
        lastRunUrl: `${repositoryUrl}/actions/runs/222`
      }),
      expectedActionIds: ["retry", "reset", "pause", "open_latest_run"],
      reason: /setup prerequisites failed/i
    },
    {
      name: "self_modify_guard",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_setup",
        lastFailureSignature:
          "stage setup prerequisites failed: factory stage output touches protected control-plane paths but the pull request is missing the factory:self-modify label."
      }),
      expectedActionIds: ["approve_self_modify", "reset", "pause"],
      reason: /self-modify guard/i
    },
    {
      name: "transient_infra",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "transient_infra",
        transientRetryAttempts: 2,
        lastRunUrl: `${repositoryUrl}/actions/runs/333`
      }),
      expectedActionIds: ["retry", "pause", "open_latest_run"],
      reason: /transient infrastructure/i
    },
    {
      name: "stale_branch_conflict",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stale_branch_conflict"
      }),
      expectedActionIds: ["open_branch", "reset", "pause"],
      reason: /merge conflict/i
    },
    {
      name: "review_artifact_contract",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "review_artifact_contract",
        lastReviewArtifactFailure: { type: "review_artifact_contract", message: "review.json missing" }
      }),
      expectedActionIds: ["retry_review", "reset", "pause", "open_artifacts"],
      reason: /review artifact contract/i
    },
    {
      name: "repair_exhausted",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "content_or_logic",
        repairAttempts: 4,
        maxRepairAttempts: 3,
        repeatedFailureCount: 2
      }),
      expectedActionIds: ["escalate", "reset", "pause", "open_failure_history"],
      reason: /exhausted automatic retries/i
    }
  ];

  for (const scenario of scenarios) {
    const panel = buildControlPanel({
      metadata: scenario.metadata,
      labels: [],
      repositoryUrl,
      branch,
      prNumber: 7,
      artifactLinks: baseArtifacts
    });

    assert.match(panel.reason || "", scenario.reason, `${scenario.name} reason mismatch`);
    assert.deepEqual(
      actionIds(panel),
      scenario.expectedActionIds,
      `${scenario.name} action ids mismatch`
    );
  }
});

test("ready_for_review state exposes review artifacts and pause automation actions", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.readyForReview,
      lastCompletedStage: "review",
      pendingReviewSha: "abc123"
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(panel.waitingOn, "human reviewer");
  assert.ok(panel.reason.includes("abc123"), "pending review SHA should be referenced");
  assert.deepEqual(actionIds(panel), ["open_review_artifacts", "pause"]);
  assert.ok(!actionIds(panel).includes("start_implement"));
  assert.ok(!actionIds(panel).includes("retry"));
});

test("latest run and artifact links surface when metadata is present", () => {
  const withUrl = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing,
      lastRunUrl: `${repositoryUrl}/actions/runs/444`
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.ok(withUrl.latestRun);
  assert.equal(withUrl.latestRun.url, `${repositoryUrl}/actions/runs/444`);

  const withIdOnly = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing,
      lastRunId: "555"
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.ok(withIdOnly.latestRun);
  assert.equal(withIdOnly.latestRun.url, `${repositoryUrl}/actions/runs/555`);

  const withoutRun = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.planReady
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(withoutRun.latestRun, null);
  const artifactLabels = withoutRun.artifacts.map((item) => item.label);
  assert.ok(artifactLabels.includes("📄 Plan"));
  assert.ok(artifactLabels.includes("📄 Acceptance tests"));
});

test("workflow action links include encoded workflow dispatch parameters", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.planReady
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  const startImplement = panel.actions.find((action) => action.id === "start_implement");
  const pause = panel.actions.find((action) => action.id === "pause");
  const planLink = panel.actions.find((action) => action.id === "open_plan_artifacts");

  assert.ok(startImplement);
  assert.ok(startImplement.url.includes("factory-control-action.yml"));
  assert.ok(startImplement.url.includes("action=start_implement"));
  assert.ok(startImplement.url.includes("pr_number=7"));

  assert.ok(pause);
  assert.ok(pause.url.includes("action=pause"));

  assert.ok(planLink);
  assert.equal(planLink.url, baseArtifacts.plan);
});
