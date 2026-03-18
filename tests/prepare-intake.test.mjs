import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_LABELS
} from "../scripts/lib/factory-config.mjs";
import { prepareIntake } from "../scripts/prepare-intake.mjs";

function withBasePayload(overrides = {}) {
  return {
    issue: {
      number: 101,
      title: "[factory] Sample issue",
      body: "",
      ...overrides.issue
    },
    sender: {
      login: "octocat",
      ...overrides.sender
    },
    repository: {
      default_branch: "main",
      ...overrides.repository
    },
    ...overrides
  };
}

test("prepareIntake applies the rejection label when the issue form is incomplete", async () => {
  const addLabelCalls = [];
  const removeLabelCalls = [];
  const commentCalls = [];
  const gitCalls = [];
  const outputs = [];

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload(),
        getCollaboratorPermissionImpl: async () => ({ permission: "write" }),
        addLabelsImpl: async (issueNumber, labels) => {
          addLabelCalls.push({ issueNumber, labels });
        },
        removeLabelImpl: async (issueNumber, label) => {
          removeLabelCalls.push({ issueNumber, label });
        },
        commentOnIssueImpl: async (issueNumber, body) => {
          commentCalls.push({ issueNumber, body });
        },
        renderIntakeRejectedCommentImpl: () => "intake rejected comment",
        setOutputsImpl: (next) => outputs.push(next),
        gitImpl: (args) => {
          gitCalls.push(args);
        },
        env: {}
      }),
    /Issue form is incomplete/
  );

  assert.deepEqual(gitCalls, []);
  assert.deepEqual(outputs, []);
  assert.deepEqual(addLabelCalls, [
    { issueNumber: 101, labels: [FACTORY_LABELS.intakeRejected] }
  ]);
  assert.deepEqual(removeLabelCalls, []);
  assert.deepEqual(commentCalls, [
    { issueNumber: 101, body: "intake rejected comment" }
  ]);
});

test("prepareIntake applies the rejection label when the requester lacks write access", async () => {
  const addLabelCalls = [];
  const removeLabelCalls = [];
  const gitCalls = [];

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload(),
        getCollaboratorPermissionImpl: async () => ({ permission: "read" }),
        addLabelsImpl: async (issueNumber, labels) => {
          addLabelCalls.push({ issueNumber, labels });
        },
        removeLabelImpl: async (issueNumber, label) => {
          removeLabelCalls.push({ issueNumber, label });
        },
        commentOnIssueImpl: async () => {
          throw new Error("commentOnIssue should not be called");
        },
        renderIntakeRejectedCommentImpl: () => "intake rejected comment",
        setOutputsImpl: () => {},
        gitImpl: (args) => {
          gitCalls.push(args);
        },
        env: {}
      }),
    /does not have write access/
  );

  assert.deepEqual(gitCalls, []);
  assert.deepEqual(addLabelCalls, [
    { issueNumber: 101, labels: [FACTORY_LABELS.intakeRejected] }
  ]);
  assert.deepEqual(removeLabelCalls, []);
});

test("prepareIntake removes the rejection label on a successful intake", async () => {
  const addLabelCalls = [];
  const removeLabelCalls = [];
  const gitCalls = [];
  const outputs = [];

  const issueBody = `
## Problem Statement
Describe the problem
## Goals
List goals
## Non-goals
List non-goals
## Constraints
List constraints
## Acceptance Criteria
List acceptance criteria
## Risk
List risks
## Affected Area
List affected areas
`.trim();

  await prepareIntake({
    payload: withBasePayload({
      issue: {
        number: 103,
        title: "[factory] Successful issue",
        body: issueBody
      }
    }),
    getCollaboratorPermissionImpl: async () => ({ permission: "write" }),
    addLabelsImpl: async (issueNumber, labels) => {
      addLabelCalls.push({ issueNumber, labels });
    },
    removeLabelImpl: async (issueNumber, label) => {
      removeLabelCalls.push({ issueNumber, label });
    },
    commentOnIssueImpl: async () => {
      throw new Error("commentOnIssue should not be called");
    },
    renderIntakeRejectedCommentImpl: () => "intake rejected comment",
    setOutputsImpl: (next) => outputs.push(next),
    gitImpl: (args) => {
      gitCalls.push(args);
    },
    env: {}
  });

  assert.deepEqual(addLabelCalls, []);
  assert.deepEqual(removeLabelCalls, [
    { issueNumber: 103, label: FACTORY_LABELS.intakeRejected }
  ]);
  assert.deepEqual(outputs, [
    {
      issue_number: 103,
      pr_number: "0",
      branch: "factory/103-successful-issue",
      artifacts_path: ".factory/runs/103",
      max_repair_attempts: `${DEFAULT_MAX_REPAIR_ATTEMPTS}`
    }
  ]);
  assert.deepEqual(gitCalls, [
    ["config", "user.name", "github-actions[bot]"],
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    ["fetch", "origin", "main"],
    ["checkout", "-B", "factory/103-successful-issue", "origin/main"],
    ["push", "origin", "HEAD:refs/heads/factory/103-successful-issue"]
  ]);
});
