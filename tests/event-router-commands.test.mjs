import test from "node:test";
import assert from "node:assert/strict";
import { routeIssueComment } from "../scripts/lib/event-router.mjs";
import {
  defaultApprovalIntervention,
  defaultFailureIntervention,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";
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
    getPullRequest: async () =>
      managedPr("blocked", {
        blockedAction: "implement",
        intervention: defaultFailureIntervention({
          payload: { failureType: "stage_setup" }
        })
      }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "implement");
});

test("routeIssueComment resumes paused implement, repair, and review runs to their underlying action", async () => {
  const implementRoute = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("implementing", { paused: true }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });
  const repairRoute = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("repairing", { paused: true }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });
  const reviewRoute = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("reviewing", { paused: true }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(implementRoute.action, "implement");
  assert.equal(repairRoute.action, "repair");
  assert.equal(reviewRoute.action, "review");
});

test("routeIssueComment resumes paused plan-ready PRs into implement", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("plan_ready", { paused: true }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "implement");
});

test("routeIssueComment leaves paused ready-for-review PRs unchanged on resume", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("ready_for_review", { paused: true }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "noop");
});

test("routeIssueComment resumes repair and review runs to their blocked action", async () => {
  const repairRoute = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("blocked", {
        blockedAction: "repair",
        intervention: defaultFailureIntervention({
          payload: { failureType: "stage_setup" }
        })
      }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });
  const reviewRoute = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("blocked", {
        blockedAction: "review",
        intervention: defaultFailureIntervention({
          payload: { failureType: "transient_infra" }
        })
      }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(repairRoute.action, "repair");
  assert.equal(reviewRoute.action, "review");
});

test("routeIssueComment leaves unrecoverable blocked PRs unchanged on resume", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("blocked", {
        blockedAction: "repair",
        intervention: defaultFailureIntervention({
          payload: { failureType: "content_or_logic" }
        })
      }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(route.action, "noop");
});

test("routeIssueComment leaves blocked PRs unchanged when blocked action is missing", async () => {
  const route = await routeIssueComment(prCommandPayload("/factory resume"), {
    getPullRequest: async () =>
      managedPr("blocked", {
        intervention: defaultFailureIntervention({
          payload: { failureType: "stage_setup" }
        })
      }),
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
    getPullRequest: async () =>
      managedPr("blocked", {
        intervention: defaultFailureIntervention({
          payload: { failureType: "stage_setup" }
        })
      }),
    getCollaboratorPermission: async () => ({ permission: "write" })
  });

  assert.equal(pauseRoute.action, "pause");
  assert.equal(resetRoute.action, "reset");
});

test("routeIssueComment routes valid intervention answers", async () => {
  const route = await routeIssueComment(
    prCommandPayload("/factory answer int_q_123 approve_once\n\nApproved after label."),
    {
      getPullRequest: async () =>
        managedPr("blocked", {
          blockedAction: "implement",
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            payload: {
              question: "Should the factory continue?",
              recommendedOptionId: "approve_once",
              options: [
                { id: "approve_once", label: "Approve once", effect: "resume_current_stage" },
                { id: "deny", label: "Do not approve", effect: "remain_blocked" }
              ],
              resumeContext: {
                ciRunId: "444",
                repairAttempts: 2,
                repeatedFailureCount: 1,
                failureSignature: "sig-123",
                stageNoopAttempts: 0,
                stageSetupAttempts: 1
              }
            }
          })
        }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  );

  assert.equal(route.action, "answer_intervention");
  assert.equal(route.interventionId, "int_q_123");
  assert.equal(route.optionId, "approve_once");
  assert.equal(route.answerNote, "Approved after label.");
  assert.equal(route.resumeAction, "implement");
  assert.equal(route.ciRunId, "444");
  assert.equal(route.repairState.repairAttempts, 2);
  assert.equal(route.repairState.repeatedFailureCount, 1);
  assert.equal(route.repairState.lastFailureSignature, "sig-123");
  assert.equal(route.stageSetupAttempts, 1);
});

test("routeIssueComment preserves review resume context for answered repair interventions", async () => {
  const route = await routeIssueComment(
    prCommandPayload("/factory answer int_q_123 approve_once"),
    {
      getPullRequest: async () =>
        managedPr("blocked", {
          blockedAction: "repair",
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            payload: {
              question: "Should the factory continue?",
              recommendedOptionId: "approve_once",
              options: [
                { id: "approve_once", label: "Approve once", effect: "resume_current_stage" }
              ],
              resumeContext: {
                reviewId: "55",
                repairAttempts: 1,
                repeatedFailureCount: 1,
                failureSignature: "review:55:requested changes"
              }
            }
          })
        }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  );

  assert.equal(route.action, "answer_intervention");
  assert.equal(route.resumeAction, "repair");
  assert.equal(route.reviewId, "55");
  assert.equal(route.repairState.repairAttempts, 1);
  assert.equal(route.repairState.lastFailureSignature, "review:55:requested changes");
});

test("routeIssueComment rejects invalid intervention answers", async () => {
  const route = await routeIssueComment(
    prCommandPayload("/factory answer int_q_999 approve_once"),
    {
      getPullRequest: async () =>
        managedPr("blocked", {
          blockedAction: "implement",
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            payload: {
              question: "Should the factory continue?",
              recommendedOptionId: "approve_once",
              options: [
                { id: "approve_once", label: "Approve once", effect: "resume_current_stage" }
              ]
            }
          })
        }),
      getCollaboratorPermission: async () => ({ permission: "write" })
    }
  );

  assert.equal(route.action, "noop");
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
