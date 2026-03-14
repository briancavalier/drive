import test from "node:test";
import assert from "node:assert/strict";
import {
  routePullRequestLabeled,
  routePullRequestReview,
  routeWorkflowRun
} from "../scripts/lib/event-router.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";

function managedPrBody(status = "plan_ready", repairAttempts = 0) {
  return renderPrBody({
    issueNumber: 12,
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    metadata: {
      issueNumber: 12,
      artifactsPath: ".factory/runs/12",
      status,
      repairAttempts,
      maxRepairAttempts: 3,
      lastFailureSignature: null,
      repeatedFailureCount: 0
    }
  });
}

function managedLabels(extra = []) {
  return [{ name: FACTORY_LABELS.managed }, ...extra];
}

test("routePullRequestLabeled starts implementation for approved managed PRs", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    pull_request: {
      number: 33,
      body: managedPrBody(),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "implement");
  assert.equal(result.issueNumber, 12);
  assert.equal(result.prNumber, 33);
});

test("routePullRequestReview triggers repair on changes requested", () => {
  const result = routePullRequestReview({
    action: "submitted",
    review: { id: 55, state: "changes_requested", body: "Please tighten the tests." },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "repair");
  assert.equal(result.reviewId, 55);
  assert.equal(result.repairState.repairAttempts, 1);
});

test("routeWorkflowRun marks successful CI as ready", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "success",
      head_branch: "factory/12-sample"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("repairing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "ci-success");
});

test("routeWorkflowRun blocks after exceeding repair limit", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "failure",
      head_branch: "factory/12-sample"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("repairing", 3),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "blocked");
});
