import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboard } from "../scripts/lib/control-panel.mjs";
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

function actionIds(dashboard) {
  return dashboard.actions.map((action) => action.id);
}

function openLinkLabels(dashboard) {
  return dashboard.openLinks.map((link) => link.label);
}

test("paused overlay surfaces resume/reset actions and manual pause reason", () => {
  const dashboard = buildDashboard({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing,
      paused: true,
      lastRunUrl: `${repositoryUrl}/actions/runs/901`,
      pauseReason: "manual"
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts,
    ciStatus: "pending"
  });

  assert.equal(dashboard.state, "paused");
  assert.equal(dashboard.waitingOn, "operator");
  assert.equal(dashboard.reason, "Automation manually paused by an operator.");
  assert.ok(actionIds(dashboard).includes("resume"), "expected Resume action");
  assert.ok(actionIds(dashboard).includes("reset"), "expected Reset PR action");
  assert.ok(
    openLinkLabels(dashboard).includes("🏃 Open latest run"),
    "expected latest run navigation link"
  );
  assert.ok(
    !actionIds(dashboard).includes("start_implement"),
    "agent-only actions should be suppressed"
  );
  assert.equal(
    dashboard.actions.find((action) => action.id === "resume")?.label,
    "▶ Comment /factory resume"
  );
});

test("paused overlay still falls back to the projected paused label for older metadata", () => {
  const dashboard = buildDashboard({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing
    }),
    labels: [{ name: FACTORY_LABELS.paused }],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(dashboard.state, "paused");
  assert.equal(dashboard.reason, "Automation paused.");
});

test("paused ready_for_review suppresses resume when no resume command is supported", () => {
  const dashboard = buildDashboard({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.readyForReview,
      paused: true,
      lastRunUrl: `${repositoryUrl}/actions/runs/902`
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(dashboard.state, "paused");
  assert.ok(!actionIds(dashboard).includes("resume"));
  assert.ok(actionIds(dashboard).includes("reset"));
  assert.ok(
    openLinkLabels(dashboard).includes("🏃 Open latest run"),
    "expected latest run navigation link"
  );
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
      expectedActions: ["reset", "pause"],
      requiredOpenLabels: ["🔎 Open diagnostics"],
      reason: /no committed changes/i
    },
    {
      name: "stage_setup",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_setup",
        blockedAction: "repair",
        lastRunUrl: `${repositoryUrl}/actions/runs/222`
      }),
      expectedActions: ["resume", "reset", "pause"],
      requiredOpenLabels: ["🏃 Open latest run"],
      reason: /setup prerequisites failed/i
    },
    {
      name: "self_modify_guard",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_setup",
        blockedAction: "repair",
        lastFailureSignature:
          "stage setup prerequisites failed: factory stage output touches protected control-plane paths but the pull request is missing the factory:self-modify label."
      }),
      expectedActions: ["reset", "pause"],
      requiredOpenLabels: [],
      reason: /self-modify guard/i
    },
    {
      name: "transient_infra",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "transient_infra",
        blockedAction: "review",
        transientRetryAttempts: 2,
        lastRunUrl: `${repositoryUrl}/actions/runs/333`
      }),
      expectedActions: ["resume", "pause"],
      requiredOpenLabels: ["🏃 Open latest run"],
      reason: /transient infrastructure/i
    },
    {
      name: "stale_branch_conflict",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stale_branch_conflict",
        blockedAction: "implement"
      }),
      expectedActions: ["resume", "reset", "pause"],
      requiredOpenLabels: ["🌿 Open branch"],
      reason: /merge conflict/i
    },
    {
      name: "review_artifact_contract",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "review_artifact_contract",
        lastReviewArtifactFailure: { type: "review_artifact_contract", message: "review.json missing" }
      }),
      expectedActions: ["reset", "pause"],
      requiredOpenLabels: ["🧾 review.md"],
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
      expectedActions: ["reset", "pause"],
      requiredOpenLabels: ["🧭 Open failure history"],
      reason: /exhausted automatic retries/i
    }
  ];

  for (const scenario of scenarios) {
    const dashboard = buildDashboard({
      metadata: scenario.metadata,
      labels: [],
      repositoryUrl,
      branch,
      prNumber: 7,
      artifactLinks: baseArtifacts
    });

    assert.match(dashboard.reason || "", scenario.reason, `${scenario.name} reason mismatch`);
    assert.deepEqual(
      actionIds(dashboard),
      scenario.expectedActions,
      `${scenario.name} action ids mismatch`
    );
    if (scenario.requiredOpenLabels.length) {
      const labels = openLinkLabels(dashboard);
      for (const label of scenario.requiredOpenLabels) {
        assert.ok(
          labels.includes(label),
          `${scenario.name} missing open link label "${label}"`
        );
      }
    }
  }
});

test("ready_for_review state exposes review artifacts and pause automation actions", () => {
  const dashboard = buildDashboard({
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

  assert.equal(dashboard.waitingOn, "human reviewer");
  assert.ok(dashboard.reason.includes("abc123"), "pending review SHA should be referenced");
  assert.deepEqual(actionIds(dashboard), ["pause"]);
  assert.ok(!actionIds(dashboard).includes("start_implement"));
  assert.ok(
    openLinkLabels(dashboard).includes("🧾 review.md"),
    "expected review summary link"
  );
});

test("latest run and artifact links surface when metadata is present", () => {
  const withUrl = buildDashboard({
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

  const withIdOnly = buildDashboard({
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

  const withoutRun = buildDashboard({
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
  const artifactLabels = withoutRun.artifactGroups.flatMap((group) =>
    group.links.map((item) => item.label)
  );
  assert.ok(artifactLabels.includes("plan.md"));
  assert.ok(artifactLabels.includes("acceptance-tests.md"));
});

test("command actions link back to the pull request conversation", () => {
  const dashboard = buildDashboard({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.planReady
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  const startImplement = dashboard.actions.find((action) => action.id === "start_implement");
  const pause = dashboard.actions.find((action) => action.id === "pause");
  assert.ok(startImplement);
  assert.equal(startImplement.label, "▶ Comment /factory implement");
  assert.equal(startImplement.url, `${repositoryUrl}/pull/7`);

  assert.ok(pause);
  assert.equal(pause.label, "⏸ Comment /factory pause");
  assert.equal(pause.url, `${repositoryUrl}/pull/7`);

  assert.ok(
    openLinkLabels(dashboard).includes("📄 Open plan artifacts"),
    "expected plan artifacts navigation link"
  );
});
