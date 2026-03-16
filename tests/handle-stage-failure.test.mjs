import test from "node:test";
import assert from "node:assert/strict";
import { buildFailureComment, buildStateUpdate } from "../scripts/handle-stage-failure.mjs";
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

test("buildFailureComment prefixes blocked messages with emoji across failure types", () => {
  const cases = [
    {
      args: {
        action: "implement",
        failureType: FAILURE_TYPES.staleBranchConflict,
        retryAttempts: 1,
        failureMessage: ""
      }
    },
    {
      args: {
        action: "implement",
        failureType: FAILURE_TYPES.transientInfra,
        retryAttempts: 2,
        failureMessage: ""
      }
    },
    {
      args: {
        action: "implement",
        failureType: FAILURE_TYPES.configuration,
        retryAttempts: 0,
        failureMessage: "Check secrets."
      }
    },
    {
      args: {
        action: "implement",
        failureType: FAILURE_TYPES.contentOrLogic,
        retryAttempts: 0,
        failureMessage: ""
      }
    },
    {
      args: {
        action: "review",
        failureType: FAILURE_TYPES.contentOrLogic,
        retryAttempts: 0,
        failureMessage: ""
      }
    },
    {
      args: {
        action: "repair",
        failureType: FAILURE_TYPES.contentOrLogic,
        retryAttempts: 0,
        failureMessage: ""
      }
    }
  ];

  for (const { args } of cases) {
    const message = buildFailureComment(args);
    assert.ok(
      message.startsWith("⚠️ "),
      `Expected blocked comment to start with emoji, received: ${message}`
    );
  }
});
