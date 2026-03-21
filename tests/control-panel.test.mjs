import test from "node:test";
import assert from "node:assert/strict";
import { buildControlPanel } from "../scripts/lib/control-panel.mjs";
import { defaultFailureIntervention, defaultPrMetadata } from "../scripts/lib/pr-metadata.mjs";
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
      paused: true,
      lastRunUrl: `${repositoryUrl}/actions/runs/901`,
      pauseReason: "manual"
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(panel.state, "paused");
  assert.equal(panel.waitingOn, "operator");
  assert.equal(panel.reason, "Automation manually paused by an operator.");
  assert.ok(actionIds(panel).includes("resume"), "expected Resume action");
  assert.ok(actionIds(panel).includes("reset"), "expected Reset PR action");
  assert.ok(actionIds(panel).includes("open_latest_run"), "expected latest run link");
  assert.ok(!actionIds(panel).includes("start_implement"), "agent-only actions should be suppressed");
  assert.equal(
    panel.actions.find((action) => action.id === "resume")?.label,
    "▶ Comment /factory resume"
  );
});

test("paused overlay still falls back to the projected paused label for older metadata", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.implementing
    }),
    labels: [{ name: FACTORY_LABELS.paused }],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(panel.state, "paused");
  assert.equal(panel.reason, "Automation paused.");
});

test("paused ready_for_review suppresses resume when no resume command is supported", () => {
  const panel = buildControlPanel({
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

  assert.equal(panel.state, "paused");
  assert.ok(!actionIds(panel).includes("resume"));
  assert.ok(actionIds(panel).includes("reset"));
  assert.ok(actionIds(panel).includes("open_latest_run"));
});

test("blocked reasons map to subtype-specific guidance and actions", () => {
  const scenarios = [
    {
      name: "stage_noop",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stage_noop",
        stageNoopAttempts: 2,
        lastRunUrl: `${repositoryUrl}/actions/runs/111`,
        intervention: defaultFailureIntervention({
          summary: "Factory stage completed without any repository updates.",
          payload: {
            failureType: "stage_noop",
            stageNoopAttempts: 2
          }
        })
      }),
      expectedActionIds: ["reset", "pause", "open_diagnostics"],
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
      expectedActionIds: ["resume", "reset", "pause", "open_latest_run"],
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
      expectedActionIds: ["reset", "pause"],
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
      expectedActionIds: ["resume", "pause", "open_latest_run"],
      reason: /transient infrastructure/i
    },
    {
      name: "stale_branch_conflict",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "stale_branch_conflict",
        blockedAction: "implement"
      }),
      expectedActionIds: ["open_branch", "resume", "reset", "pause"],
      reason: /merge conflict/i
    },
    {
      name: "review_artifact_contract",
      metadata: metadata({
        status: FACTORY_PR_STATUSES.blocked,
        lastFailureType: "review_artifact_contract",
        lastReviewArtifactFailure: { type: "review_artifact_contract", message: "review.json missing" }
      }),
      expectedActionIds: ["reset", "pause", "open_artifacts"],
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
      expectedActionIds: ["reset", "pause", "open_failure_history"],
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

test("blocked state falls back to legacy failure metadata when intervention is absent", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.blocked,
      lastFailureType: "transient_infra",
      blockedAction: "review",
      transientRetryAttempts: 2,
      lastRunUrl: `${repositoryUrl}/actions/runs/333`
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.match(panel.reason || "", /transient infrastructure/i);
  assert.deepEqual(actionIds(panel), ["resume", "pause", "open_latest_run"]);
});

test("blocked control panel uses intervention-only transient failure context", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.blocked,
      blockedAction: "review",
      intervention: defaultFailureIntervention({
        payload: {
          failureType: "transient_infra",
          transientRetryAttempts: 2
        }
      })
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.match(panel.reason || "", /after 2 automated retries/i);
  assert.deepEqual(actionIds(panel), ["resume", "pause"]);
});

test("blocked control panel resolves review stage from intervention-only review artifact failures", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.blocked,
      intervention: defaultFailureIntervention({
        payload: {
          failureType: "review_artifact_contract",
          reviewArtifactFailure: {
            type: "review_artifact_contract",
            message: "review.json missing"
          }
        }
      })
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.equal(panel.lastCompletedStage, "review");
  assert.deepEqual(actionIds(panel), ["reset", "pause", "open_artifacts"]);
});

test("blocked control panel treats intervention-only repeated failures as repair exhaustion", () => {
  const panel = buildControlPanel({
    metadata: metadata({
      status: FACTORY_PR_STATUSES.blocked,
      blockedAction: "repair",
      repairAttempts: 1,
      maxRepairAttempts: 3,
      intervention: defaultFailureIntervention({
        payload: {
          failureType: "content_or_logic",
          repeatedFailureCount: 2
        }
      })
    }),
    labels: [],
    repositoryUrl,
    branch,
    prNumber: 7,
    artifactLinks: baseArtifacts
  });

  assert.match(panel.reason || "", /exhausted automatic retries/i);
  assert.deepEqual(actionIds(panel), ["reset", "pause", "open_failure_history"]);
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

test("command actions link back to the pull request conversation", () => {
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
  assert.equal(startImplement.label, "▶ Comment /factory implement");
  assert.equal(startImplement.url, `${repositoryUrl}/pull/7`);

  assert.ok(pause);
  assert.equal(pause.label, "⏸ Comment /factory pause");
  assert.equal(pause.url, `${repositoryUrl}/pull/7`);

  assert.ok(planLink);
  assert.equal(planLink.url, baseArtifacts.plan);
});
