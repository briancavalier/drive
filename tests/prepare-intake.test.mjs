import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_ISSUE_FILE_NAME,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_LABELS
} from "../scripts/lib/factory-config.mjs";
import { INTAKE_FAILURE_CODES } from "../scripts/handle-intake-failure.mjs";
import { IntakeFailure, prepareIntake } from "../scripts/prepare-intake.mjs";

function withBasePayload(overrides = {}) {
  return {
    issue: {
      number: 101,
      title: "[factory] Sample issue",
      body: "",
      user: {
        login: "issue-author"
      },
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
        getCollaboratorPermissionImpl: async (login) => ({
          permission: login === "octocat" ? "read" : "write"
        }),
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

test("prepareIntake applies the rejection label when the issue author lacks write access", async () => {
  const addLabelCalls = [];
  const removeLabelCalls = [];
  const gitCalls = [];

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload(),
        getCollaboratorPermissionImpl: async (login) => ({
          permission: login === "issue-author" ? "read" : "write"
        }),
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
    /Issue author issue-author does not have write access/
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
  const mkdirCalls = [];
  const writeFileCalls = [];

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
    mkdirImpl: (target, options) => {
      mkdirCalls.push({ target, options });
    },
    writeFileImpl: (target, contents) => {
      writeFileCalls.push({ target, contents });
    },
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
    ["add", `.factory/runs/103/${APPROVED_ISSUE_FILE_NAME}`],
    ["commit", "-m", "factory(intake): snapshot approved request"],
    ["push", "origin", "HEAD:refs/heads/factory/103-successful-issue"]
  ]);
  assert.deepEqual(mkdirCalls, [
    {
      target: ".factory/runs/103",
      options: { recursive: true }
    }
  ]);
  assert.deepEqual(writeFileCalls, [
    {
      target: `.factory/runs/103/${APPROVED_ISSUE_FILE_NAME}`,
      contents: issueBody
    }
  ]);
});

test("prepareIntake blocks when the remote factory branch already exists", async () => {
  const addLabelCalls = [];
  const removeLabelCalls = [];
  const gitCalls = [];
  const outputs = [];
  const writeFileCalls = [];

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

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload({
          issue: {
            number: 109,
            title: "[Factory] Add repair exhaustion decision interventions",
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
        writeFileImpl: (target, contents) => {
          writeFileCalls.push({ target, contents });
        },
        gitImpl: (args) => {
          gitCalls.push(args);
        },
        branchExistsImpl: (branch) =>
          branch === "factory/109-add-repair-exhaustion-decision-interventions",
        env: {
          FACTORY_INTAKE_FAILURE_PATH: "/tmp/factory-intake-failure.json"
        }
      }),
    (error) => {
      assert.ok(error instanceof IntakeFailure);
      assert.equal(error.payload.code, INTAKE_FAILURE_CODES.branchExists);
      assert.equal(
        error.payload.branch,
        "factory/109-add-repair-exhaustion-decision-interventions"
      );
      return true;
    }
  );

  assert.deepEqual(removeLabelCalls, [
    { issueNumber: 109, label: FACTORY_LABELS.intakeRejected }
  ]);
  assert.deepEqual(addLabelCalls, [
    { issueNumber: 109, labels: [FACTORY_LABELS.intakeRejected] }
  ]);
  assert.deepEqual(gitCalls, [
    ["config", "user.name", "github-actions[bot]"],
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    ["fetch", "origin", "main"]
  ]);
  assert.deepEqual(outputs, [
    {
      intake_failure: JSON.stringify({
        code: INTAKE_FAILURE_CODES.branchExists,
        issueNumber: 109,
        branch: "factory/109-add-repair-exhaustion-decision-interventions",
        artifactsPath: ".factory/runs/109",
        nextAction:
          "Reuse or clean up the existing planning branch or PR before retrying /factory start."
      })
    }
  ]);
  assert.deepEqual(writeFileCalls, [
    {
      target: "/tmp/factory-intake-failure.json",
      contents: `${JSON.stringify({
        code: INTAKE_FAILURE_CODES.branchExists,
        issueNumber: 109,
        branch: "factory/109-add-repair-exhaustion-decision-interventions",
        artifactsPath: ".factory/runs/109",
        nextAction:
          "Reuse or clean up the existing planning branch or PR before retrying /factory start."
      })}\n`
    }
  ]);
});

test("prepareIntake uses a live origin check instead of local remote-tracking refs", async () => {
  const gitCalls = [];

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload({
          issue: {
            number: 110,
            title: "[factory] Existing remote branch",
            body: `
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
`.trim()
          }
        }),
        getCollaboratorPermissionImpl: async () => ({ permission: "write" }),
        addLabelsImpl: async () => {},
        removeLabelImpl: async () => {},
        commentOnIssueImpl: async () => {},
        renderIntakeRejectedCommentImpl: () => "intake rejected comment",
        setOutputsImpl: () => {},
        writeFileImpl: () => {},
        gitImpl: (args) => {
          gitCalls.push(args);
        },
        branchExistsImpl: (branch) => branch === "factory/110-existing-remote-branch",
        env: {}
      }),
    IntakeFailure
  );

  assert.deepEqual(gitCalls, [
    ["config", "user.name", "github-actions[bot]"],
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    ["fetch", "origin", "main"]
  ]);
});

test("prepareIntake converts push race collisions into the structured intake failure", async () => {
  const addLabelCalls = [];
  const outputs = [];
  const gitCalls = [];
  const writeFileCalls = [];

  await assert.rejects(
    () =>
      prepareIntake({
        payload: withBasePayload({
          issue: {
            number: 111,
            title: "[factory] Push race branch",
            body: `
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
`.trim()
          }
        }),
        getCollaboratorPermissionImpl: async () => ({ permission: "write" }),
        addLabelsImpl: async (issueNumber, labels) => {
          addLabelCalls.push({ issueNumber, labels });
        },
        removeLabelImpl: async () => {},
        commentOnIssueImpl: async () => {},
        renderIntakeRejectedCommentImpl: () => "intake rejected comment",
        setOutputsImpl: (next) => outputs.push(next),
        mkdirImpl: () => {},
        writeFileImpl: (target, contents) => {
          writeFileCalls.push({ target, contents });
        },
        gitImpl: (args) => {
          gitCalls.push(args);

          if (args[0] === "push") {
            const error = new Error("push rejected");
            error.stderr = "! [rejected] HEAD -> factory/111-push-race-branch (fetch first)\n";
            error.stdout =
              "error: failed to push some refs to 'https://github.com/example/repo'\n";
            throw error;
          }
        },
        branchExistsImpl: () => false,
        env: {
          FACTORY_INTAKE_FAILURE_PATH: "/tmp/factory-intake-failure-race.json"
        }
      }),
    (error) => {
      assert.ok(error instanceof IntakeFailure);
      assert.equal(error.payload.code, INTAKE_FAILURE_CODES.branchExists);
      assert.equal(error.payload.branch, "factory/111-push-race-branch");
      return true;
    }
  );

  assert.deepEqual(gitCalls, [
    ["config", "user.name", "github-actions[bot]"],
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    ["fetch", "origin", "main"],
    ["checkout", "-B", "factory/111-push-race-branch", "origin/main"],
    ["add", `.factory/runs/111/${APPROVED_ISSUE_FILE_NAME}`],
    ["commit", "-m", "factory(intake): snapshot approved request"],
    ["push", "origin", "HEAD:refs/heads/factory/111-push-race-branch"]
  ]);
  assert.deepEqual(addLabelCalls, [
    { issueNumber: 111, labels: [FACTORY_LABELS.intakeRejected] }
  ]);
  assert.deepEqual(outputs, [
    {
      intake_failure: JSON.stringify({
        code: INTAKE_FAILURE_CODES.branchExists,
        issueNumber: 111,
        branch: "factory/111-push-race-branch",
        artifactsPath: ".factory/runs/111",
        nextAction:
          "Reuse or clean up the existing planning branch or PR before retrying /factory start."
      })
    }
  ]);
  assert.deepEqual(writeFileCalls.at(-1), {
    target: "/tmp/factory-intake-failure-race.json",
    contents: `${JSON.stringify({
      code: INTAKE_FAILURE_CODES.branchExists,
      issueNumber: 111,
      branch: "factory/111-push-race-branch",
      artifactsPath: ".factory/runs/111",
      nextAction:
        "Reuse or clean up the existing planning branch or PR before retrying /factory start."
    })}\n`
  });
});
