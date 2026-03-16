import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  routePullRequestLabeled,
  routePullRequestReview,
  routeWorkflowRun
} from "../scripts/lib/event-router.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";

function managedPrBody(status = "plan_ready", repairAttempts = 0, overrides = {}) {
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
      repeatedFailureCount: 0,
      ...overrides
    }
  });
}

function managedLabels(extra = []) {
  return [{ name: FACTORY_LABELS.managed }, ...extra];
}

function makeOverrides(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-route-messages-"));

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }

  return dir;
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

test("routePullRequestLabeled ignores stale implement events when the label is no longer present", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled still parses metadata from custom PR body templates", () => {
  const overridesRoot = makeOverrides({
    "pr-body.md": [
      "# Custom",
      "",
      "{{ARTIFACTS_SECTION}}",
      "",
      "{{STATUS_SECTION}}"
    ].join("\n")
  });
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    pull_request: {
      number: 33,
      body: renderPrBody(
        {
          issueNumber: 12,
          branch: "factory/12-sample",
          repositoryUrl: "https://github.com/example/repo",
          artifactsPath: ".factory/runs/12",
          metadata: {
            issueNumber: 12,
            artifactsPath: ".factory/runs/12",
            status: "plan_ready",
            repairAttempts: 0,
            maxRepairAttempts: 3,
            lastFailureSignature: null,
            repeatedFailureCount: 0
          }
        },
        { overridesRoot }
      ),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "implement");
  assert.equal(result.issueNumber, 12);
  assert.equal(result.prNumber, 33);
});

test("routePullRequestLabeled retries implementation for managed PRs already marked implementing", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
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

test("routePullRequestReview also handles reviewing status", () => {
  const result = routePullRequestReview({
    action: "submitted",
    review: { id: 56, state: "CHANGES_REQUESTED" },
    pull_request: {
      number: 33,
      body: managedPrBody("reviewing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "repair");
  assert.equal(result.reviewId, 56);
});

test("routeWorkflowRun routes successful CI to review stage", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "abc123"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("repairing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun also reruns review for managed PRs already reviewing", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 177,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "def456"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("reviewing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun ignores CI completions for pending autonomous review commits", () => {
  const headSha = "abc123";
  const result = routeWorkflowRun({
    workflowRun: {
      id: 200,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: headSha
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("reviewing", 0, { pendingReviewSha: headSha }),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun still triggers review when CI head SHA differs from pending marker", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 201,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "def456"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("reviewing", 0, { pendingReviewSha: "abc123" }),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun ignores push-triggered CI runs for managed PR branches", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 78,
      name: "CI",
      conclusion: "success",
      event: "push",
      head_branch: "factory/12-sample",
      head_sha: "abc123"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("repairing"),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun ignores already-promoted green SHAs", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 79,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "abc123"
    },
    pullRequest: {
      number: 33,
      body: managedPrBody("repairing", 0, { lastReadySha: "abc123" }),
      labels: managedLabels(),
      head: { ref: "factory/12-sample" }
    }
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun blocks after exceeding repair limit", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "failure",
      event: "pull_request",
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
