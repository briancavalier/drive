import test from "node:test";
import assert from "node:assert/strict";
import { routeIssueComment } from "../scripts/lib/event-router.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";

function managedPr(status, metadata = {}) {
  return {
    number: 22,
    body: renderPrBody({
      issueNumber: 22,
      branch: "factory/22-sample",
      repositoryUrl: "https://github.com/example/repo",
      artifactsPath: ".factory/runs/22",
      metadata: {
        issueNumber: 22,
        artifactsPath: ".factory/runs/22",
        status,
        repairAttempts: 0,
        maxRepairAttempts: 3,
        lastFailureSignature: null,
        repeatedFailureCount: 0,
        ...metadata
      }
    }),
    labels: [{ name: FACTORY_LABELS.managed }],
    head: {
      ref: "factory/22-sample",
      sha: "abc123",
      repo: {
        full_name: "example/repo",
        fork: false
      }
    },
    base: {
      repo: {
        full_name: "example/repo"
      }
    }
  };
}

function prCommandPayload(body, actor = "maintainer") {
  return {
    action: "created",
    repository: { full_name: "example/repo" },
    issue: {
      number: 22,
      pull_request: { url: "https://api.github.com/repos/example/repo/pulls/22" }
    },
    comment: {
      body,
      user: { login: actor }
    },
    sender: { login: actor }
  };
}

test("routeIssueComment routes trusted implement commands from plan-ready PRs", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory implement"), {
    getPullRequest: async () => managedPr("plan_ready"),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "implement");
  assert.equal(route.prNumber, 22);
});

test("routeIssueComment routes trusted resume commands only for resumable blocked PRs", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () => managedPr("blocked", { lastFailureType: "stage_setup" }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "implement");
});

test("routeIssueComment leaves unrecoverable blocked PRs unchanged on resume", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () => managedPr("blocked", { lastFailureType: "content_or_logic" }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "noop");
});

test("routeIssueComment routes pause and reset commands for trusted collaborators", async () => {
  const pauseRoute = await routeIssueComment(prCommandPayload("/factory pause"), {
    getPullRequest: async () => managedPr("implementing"),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });
  const resetRoute = await routeIssueComment(prCommandPayload("/factory reset"), {
    getPullRequest: async () => managedPr("blocked", { lastFailureType: "stage_setup" }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(pauseRoute.action, "pause");
  assert.equal(resetRoute.action, "reset");
});

test("routeIssueComment ignores untrusted command commenters", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory implement", "random-user"), {
    getPullRequest: async () => managedPr("plan_ready"),
    getCollaboratorPermission: async () => ({ permission: "read" })
  });

  assert.equal(route.action, "noop");
});

test("routeIssueComment routes issue start commands only on issues", async () => {
  const route = await routeIssueComment(
    {
      action: "created",
      repository: { full_name: "example/repo" },
      issue: { number: 9 },
      comment: {
        body: "/factory start",
        user: { login: "maintainer" }
      },
      sender: { login: "maintainer" }
    },
    {
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  );

  assert.equal(route.action, "start");
  assert.equal(route.issueNumber, 9);
});
