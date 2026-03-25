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
    }
  });
}

function malformedManagedPrBody() {
  return "<!-- factory-state {not-json} -->";
}

function rawManagedPrBody(metadata) {
  return `<!-- factory-state ${JSON.stringify(metadata)} -->`;
}

function managedLabels(extra = []) {
  return [{ name: FACTORY_LABELS.managed }, ...extra];
}

function sameRepoHead(overrides = {}) {
  return {
    ref: "factory/12-sample",
    sha: "live123",
    repo: {
      full_name: "example/repo",
      fork: false
    },
    ...overrides
  };
}

function sameRepoBase() {
  return {
    repo: {
      full_name: "example/repo"
    }
  };
}

function prIssueCommentPayload(command) {
  return {
    action: "created",
    repository: { full_name: "example/repo" },
    issue: {
      number: 33,
      pull_request: {
        url: "https://api.github.com/repos/example/repo/pulls/33"
      }
    },
    comment: {
      body: command,
      user: { login: "maintainer" }
    },
    sender: { login: "maintainer" }
  };
}

test("routeEvent uses live pull request state for implement comment commands", async () => {
  const payload = {
    ...prIssueCommentPayload("/factory implement")
  };

  const route = await routeEvent({
    eventName: "issue_comment",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody("implementing"),
        labels: managedLabels(),
        head: sameRepoHead(),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" }),
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent uses live pull request state and collaborator permission for review events", async () => {
  const payload = {
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 55,
      state: "changes_requested",
      body: "Please tighten the tests.",
      user: { login: "briancavalier" }
    },
    pull_request: {
      number: 33,
      body: managedPrBody("plan_ready"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: sameRepoBase()
    }
  };

  const route = await routeEvent({
    eventName: "pull_request_review",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody("implementing"),
        labels: managedLabels(),
        head: sameRepoHead(),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" }),
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "repair");
  assert.equal(route.reviewId, 55);
});

test("routeEvent returns rewrite action for merged pull_request events", async () => {
  const payload = {
    action: "closed",
    repository: { full_name: "example/repo" },
    pull_request: {
      number: 33,
      body: managedPrBody("reviewing"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: {
        ref: "main",
        repo: {
          full_name: "example/repo"
        }
      },
      merged: true
    }
  };

  const route = await routeEvent({ eventName: "pull_request", payload });

  assert.equal(route.action, "rewrite_artifact_links");
  assert.equal(route.artifactRef, "main");
  assert.equal(route.branch, "factory/12-sample");
});

test("routeEvent ignores untrusted review triggers", async () => {
  const payload = {
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 56,
      state: "changes_requested",
      user: { login: "random-user" }
    },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: sameRepoBase()
    }
  };

  const route = await routeEvent({
    eventName: "pull_request_review",
    payload,
    githubClient: {
      getPullRequest: async () => payload.pull_request,
      getCollaboratorPermission: async () => ({ permission: "read" }),
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent trusts automation review actors without collaborator lookup", async () => {
  let collaboratorLookups = 0;
  const payload = {
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 57,
      state: "changes_requested",
      user: { login: "github-actions[bot]" }
    },
    pull_request: {
      number: 33,
      body: managedPrBody("reviewing"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: sameRepoBase()
    }
  };

  const route = await routeEvent({
    eventName: "pull_request_review",
    payload,
    githubClient: {
      getPullRequest: async () => payload.pull_request,
      getCollaboratorPermission: async () => {
        collaboratorLookups += 1;
        return { permission: "read" };
      },
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "repair");
  assert.equal(collaboratorLookups, 0);
});

test("routeEvent downgrades implement to noop when live PR is fork-backed", async () => {
  const payload = prIssueCommentPayload("/factory implement");

  const route = await routeEvent({
    eventName: "issue_comment",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody(),
        labels: managedLabels(),
        head: sameRepoHead({
          repo: {
            full_name: "attacker/repo",
            fork: true
          }
        }),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent downgrades review to noop when live PR head repo mismatches", async () => {
  const payload = {
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 58,
      state: "changes_requested",
      user: { login: "maintainer" }
    },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: sameRepoBase()
    }
  };

  const route = await routeEvent({
    eventName: "pull_request_review",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody("implementing"),
        labels: managedLabels(),
        head: sameRepoHead({
          repo: {
            full_name: "other/repo",
            fork: false
          }
        }),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent downgrades implement to noop when live PR metadata is malformed", async () => {
  const payload = prIssueCommentPayload("/factory implement");

  const route = await routeEvent({
    eventName: "issue_comment",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: malformedManagedPrBody(),
        labels: managedLabels(),
        head: sameRepoHead(),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent downgrades review to noop when live PR artifacts path is non-canonical", async () => {
  const payload = {
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 59,
      state: "changes_requested",
      user: { login: "maintainer" }
    },
    pull_request: {
      number: 33,
      body: managedPrBody("implementing"),
      labels: managedLabels(),
      head: sameRepoHead(),
      base: sameRepoBase()
    }
  };

  const route = await routeEvent({
    eventName: "pull_request_review",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: rawManagedPrBody({
          issueNumber: 12,
          artifactsPath: ".factory/runs/999",
          status: "implementing",
          repairAttempts: 0,
          maxRepairAttempts: 3
        }),
        labels: managedLabels(),
        head: sameRepoHead(),
        base: sameRepoBase()
      }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  });

  assert.equal(route.action, "noop");
});

test("routeEvent downgrades workflow_run to noop when the workflow head SHA is stale", async () => {
  const payload = {
    workflow_run: {
      id: 77,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "stale123",
      repository: { full_name: "example/repo" },
      pull_requests: [{ number: 33 }]
    }
  };

  const route = await routeEvent({
    eventName: "workflow_run",
    payload,
    githubClient: {
      getPullRequest: async () => ({
        number: 33,
        body: managedPrBody("repairing"),
        labels: managedLabels(),
        head: sameRepoHead({
          sha: "live123"
        }),
        base: sameRepoBase()
      }),
      findOpenPullRequestByHead: async () => null
    }
  });

  assert.equal(route.action, "noop");
});
