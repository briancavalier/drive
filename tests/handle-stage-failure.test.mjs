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

test("buildFailureComment prefixes transient infra failures with ⚠️", () => {
  const comment = buildFailureComment({
    action: "implement",
    failureType: FAILURE_TYPES.transientInfra,
    retryAttempts: 3,
    failureMessage: ""
  });

  assert.ok(
    comment.startsWith(
      "⚠️ Factory exhausted 3 transient retry attempt(s) for this stage and is now blocked."
    )
  );
});

test("buildFailureComment prefixes configuration failures with ⚠️ and keeps context", () => {
  const comment = buildFailureComment({
    action: "review",
    failureType: FAILURE_TYPES.configuration,
    retryAttempts: 0,
    failureMessage: "Review workflow tokens."
  });

  assert.ok(comment.startsWith("⚠️ Factory encountered a configuration error"));
  assert.match(comment, /Review workflow tokens\./);
});
