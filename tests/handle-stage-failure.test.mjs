import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFailureComment,
  buildFailureIntervention,
  buildStateUpdate,
  main as handleFailure
} from "../scripts/handle-stage-failure.mjs";
import { FACTORY_PR_STATUSES } from "../scripts/lib/factory-config.mjs";
import { FAILURE_TYPES } from "../scripts/lib/failure-classification.mjs";

test("buildStateUpdate resets implement content failures to plan_ready via shared constants", () => {
  const result = buildStateUpdate("implement", FAILURE_TYPES.contentOrLogic);

  assert.equal(result.status, FACTORY_PR_STATUSES.planReady);
  assert.equal(result.addLabels, "factory:plan-ready");
  assert.equal(result.removeLabels, "factory:implement,factory:blocked");
});

test("buildStateUpdate blocks non-retriable failures via shared constants", () => {
  const result = buildStateUpdate("review", FAILURE_TYPES.configuration);

  assert.equal(result.status, FACTORY_PR_STATUSES.blocked);
  assert.equal(result.addLabels, "factory:blocked");
  assert.equal(result.removeLabels, "factory:implement");
});

test("buildStateUpdate blocks implement stage_noop after hitting retry limit", () => {
  const result = buildStateUpdate("implement", FAILURE_TYPES.stageNoop, { stageNoopAttempts: 2 });

  assert.equal(result.status, FACTORY_PR_STATUSES.blocked);
  assert.equal(result.addLabels, "factory:blocked");
  assert.equal(result.removeLabels, "factory:implement");
});

test("buildFailureComment prefixes transient infra failures with ⚠️", () => {
  const comment = buildFailureComment({
    action: "implement",
    failureType: FAILURE_TYPES.transientInfra,
    retryAttempts: 3,
    failureMessage: "",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    ciRunId: "456"
  });

  assert.ok(comment.startsWith("⚠️ Factory exhausted 3 transient retry attempt(s) and is now blocked."));
  assert.match(comment, /## Where to look/);
  assert.match(comment, /\[CI run 456\]/);
});

test("buildFailureComment prefixes configuration failures with ⚠️ and keeps context", () => {
  const comment = buildFailureComment({
    action: "review",
    failureType: FAILURE_TYPES.configuration,
    retryAttempts: 0,
    failureMessage: "Review workflow tokens.",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    ciRunId: "456"
  });

  assert.ok(comment.startsWith("⚠️ Factory encountered a configuration error"));
  assert.match(comment, /Review workflow tokens\./);
  assert.match(comment, /## Suggested recovery/);
});

test("buildFailureComment renders deterministic review recovery guidance without advisory input", () => {
  const comment = buildFailureComment({
    action: "review",
    failureType: FAILURE_TYPES.contentOrLogic,
    retryAttempts: 0,
    failureMessage: "review.md must include the canonical Traceability section derived from review.json",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/34-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/34",
    ciRunId: "456"
  });

  assert.match(comment, /Inspect the failing review-stage run and the durable review artifacts on the branch/);
  assert.doesNotMatch(comment, /## Codex diagnosis/);
});

test("buildFailureIntervention captures summary, detail, and payload", () => {
  const intervention = buildFailureIntervention({
    action: "implement",
    phase: "stage",
    failureType: FAILURE_TYPES.stageSetup,
    failureMessage: "Missing FACTORY_GITHUB_TOKEN\n\nStage diagnostics:\nworkflow: factory",
    retryAttempts: 0,
    repeatedFailureCount: 1,
    stageNoopAttempts: 0,
    stageSetupAttempts: 2,
    transientRetryAttempts: 0,
    failureSignature: "missing-token",
    runId: "123",
    runUrl: "https://github.com/example/repo/actions/runs/123"
  });

  assert.equal(intervention.type, "failure");
  assert.equal(intervention.stage, "implement");
  assert.match(intervention.summary, /setup prerequisites/i);
  assert.match(intervention.detail, /Stage diagnostics:/);
  assert.equal(intervention.payload.failureType, FAILURE_TYPES.stageSetup);
  assert.equal(intervention.payload.failureSignature, "missing-token");
  assert.equal(intervention.payload.stageSetupAttempts, 2);
});

test("main creates follow-up issue for actionable failure", async () => {
  let createdIssue = null;
  let execEnv = null;

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.configuration,
      FACTORY_FAILURE_MESSAGE: "Missing FACTORY_GITHUB_TOKEN",
      FACTORY_PR_NUMBER: "123",
      FACTORY_RUN_URL: "https://github.com/example/repo/actions/runs/1",
      FACTORY_BRANCH: "factory/123",
      FACTORY_ARTIFACTS_PATH: ".factory/runs/52",
      FACTORY_CI_RUN_ID: "999",
      FACTORY_REPOSITORY_URL: "https://github.com/example/repo",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      },
      githubClient: {
        searchIssues: async () => ({ items: [] }),
        createIssue: async (payload) => {
          createdIssue = payload;
          return { number: 456 };
        }
      }
    }
  );

  assert.ok(createdIssue, "expected issue payload");
  assert.match(createdIssue.body, /factory-followup-meta/);
  assert.ok(execEnv.FACTORY_COMMENT.includes("Factory follow-up opened as #456"), "comment should mention follow-up issue");
  assert.ok(execEnv.FACTORY_INTERVENTION, "expected failure intervention payload");
  assert.equal(JSON.parse(execEnv.FACTORY_INTERVENTION).payload.failureType, FAILURE_TYPES.configuration);
});

test("main increments stage_noop attempts and records retry guidance", async () => {
  let execEnv = null;

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.stageNoop,
      FACTORY_FAILURE_MESSAGE: "Stage run completed without preparing repository changes.\n\nStage diagnostics:\nbranch: factory/loop\nremote head: abc",
      FACTORY_PR_NUMBER: "456",
      FACTORY_BRANCH: "factory/loop",
      FACTORY_STAGE_NOOP_ATTEMPTS: "0",
      FACTORY_REPOSITORY_URL: "https://github.com/example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      }
    }
  );

  assert.ok(execEnv, "expected apply-pr-state invocation");
  assert.match(execEnv.FACTORY_COMMENT, /## Stage retry status/);
  assert.match(execEnv.FACTORY_COMMENT, /Factory will treat the next implement run as the last auto-retry/i);
  assert.equal(execEnv.FACTORY_STATUS, FACTORY_PR_STATUSES.planReady);
  assert.equal(JSON.parse(execEnv.FACTORY_INTERVENTION).payload.stageNoopAttempts, 1);
  assert.equal(JSON.parse(execEnv.FACTORY_INTERVENTION).blocking, false);
});

test("main blocks stage_noop failures after exhausting retries", async () => {
  let execEnv = null;

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.stageNoop,
      FACTORY_FAILURE_MESSAGE: "Stage run completed without preparing repository changes.\n\nStage diagnostics:\nbranch: factory/block\nremote head: def",
      FACTORY_PR_NUMBER: "789",
      FACTORY_BRANCH: "factory/block",
      FACTORY_STAGE_NOOP_ATTEMPTS: "1",
      FACTORY_REPOSITORY_URL: "https://github.com/example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      }
    }
  );

  assert.ok(execEnv, "expected apply-pr-state invocation");
  assert.match(execEnv.FACTORY_COMMENT, /Automated retries are now blocked/i);
  assert.equal(execEnv.FACTORY_STATUS, FACTORY_PR_STATUSES.blocked);
  assert.equal(JSON.parse(execEnv.FACTORY_INTERVENTION).payload.stageNoopAttempts, 2);
  assert.equal(JSON.parse(execEnv.FACTORY_INTERVENTION).blocking, true);
});

test("main skips creating follow-up when signature already tracked", async () => {
  let createCalls = 0;
  let execEnv = null;
  const followupModule = await import("../scripts/lib/failure-followup.mjs");

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.configuration,
      FACTORY_FAILURE_MESSAGE: "Missing review.json artifact",
      FACTORY_PR_NUMBER: "234",
      FACTORY_RUN_URL: "https://github.com/example/repo/actions/runs/2",
      FACTORY_BRANCH: "factory/234",
      FACTORY_ARTIFACTS_PATH: ".factory/runs/53",
      FACTORY_CI_RUN_ID: "1000",
      FACTORY_REPOSITORY_URL: "https://github.com/example/repo",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      },
      githubClient: {
        searchIssues: async () => ({
          items: [{ number: 321, body: '<!-- factory-followup-meta: {"signature":"deadbeef"} -->' }]
        }),
        createIssue: async () => {
          createCalls += 1;
          return { number: 999 };
        }
      },
      followup: {
        ...followupModule,
        buildFailureSignature: () => "deadbeef"
      }
    }
  );

  assert.equal(createCalls, 0, "createIssue should not be called for duplicates");
  assert.ok(
    execEnv.FACTORY_COMMENT.includes("Factory follow-up already tracked as #321"),
    "comment should mention existing follow-up"
  );
});

test("main leaves comment unchanged for ineligible failures", async () => {
  let execEnv = null;
  let createCalls = 0;

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.transientInfra,
      FACTORY_FAILURE_MESSAGE: "network hiccup",
      FACTORY_PR_NUMBER: "345",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      },
      githubClient: {
        searchIssues: async () => ({ items: [] }),
        createIssue: async () => {
          createCalls += 1;
          return { number: 1 };
        }
      }
    }
  );

  assert.ok(execEnv.FACTORY_COMMENT.includes("## Suggested recovery"));
  assert.ok(!execEnv.FACTORY_COMMENT.includes("Factory follow-up"), "comment should not mention follow-up");
  assert.equal(createCalls, 0);
});

test("main converts self-modify guard failures into approval interventions", async () => {
  let execEnv = null;
  let createCalls = 0;

  await handleFailure(
    {
      FACTORY_FAILED_ACTION: "implement",
      FACTORY_FAILURE_PHASE: "stage",
      FACTORY_FAILURE_TYPE: FAILURE_TYPES.stageSetup,
      FACTORY_FAILURE_MESSAGE:
        "Protected workflow files changed without the required factory:self-modify label.",
      FACTORY_PR_NUMBER: "456",
      GITHUB_RUN_ID: "12345",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      execFileAsync: async (_cmd, _args, options) => {
        execEnv = options.env;
      },
      githubClient: {
        searchIssues: async () => ({ items: [] }),
        createIssue: async () => {
          createCalls += 1;
          return { number: 999 };
        }
      }
    }
  );

  const intervention = JSON.parse(execEnv.FACTORY_INTERVENTION);

  assert.equal(createCalls, 0);
  assert.equal(intervention.type, "approval");
  assert.equal(intervention.stage, "implement");
  assert.equal(intervention.payload.questionKind, "approval");
  assert.equal(intervention.payload.resumeContext.ciRunId, null);
  assert.equal(intervention.payload.resumeContext.reviewId, null);
  assert.equal(intervention.payload.resumeContext.repairAttempts, 0);
  assert.equal(intervention.payload.resumeContext.repeatedFailureCount, 0);
  assert.equal(intervention.payload.resumeContext.stageSetupAttempts, 1);
  assert.deepEqual(
    intervention.payload.options.map((option) => option.id),
    ["approve_once", "deny", "human_takeover"]
  );
  assert.match(execEnv.FACTORY_COMMENT, /## Factory Question/);
  assert.match(execEnv.FACTORY_COMMENT, /\/factory answer .* approve_once/);
});
