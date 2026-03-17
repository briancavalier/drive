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
