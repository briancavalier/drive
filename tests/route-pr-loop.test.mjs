import test from "node:test";
import assert from "node:assert/strict";
import { routeEvent } from "../scripts/route-pr-loop.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";

function managedPrBody(status = "plan_ready") {
  return renderPrBody({
    issueNumber: 12,
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    metadata: {
      issueNumber: 12,
      artifactsPath: ".factory/runs/12",
      status,
      repairAttempts: 0,
      maxRepairAttempts: 3,
      lastFailureSignature: null,
      repeatedFailureCount: 0
    }
  });
}

function managedLabels(extra = []) {
  return [{ name: FACTORY_LABELS.managed }, ...extra];
}

test("routeEvent uses live pull request state for implement label events", async () => {
  const payload = {
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    pull_request: {
      number: 33,
      body: managedPrBody(),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: { ref: "factory/12-sample" }
    }
  };

  const route = await routeEvent({
    eventName: "pull_request",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody("implementing"),
        labels: managedLabels(),
        head: { ref: "factory/12-sample" }
      }),
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "noop");
});
