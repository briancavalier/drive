import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildIntakeFailureComment,
  INTAKE_FAILURE_CODES,
  main as handleIntakeFailure,
  readIntakeFailure
} from "../scripts/handle-intake-failure.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";

test("readIntakeFailure returns null when no failure artifact exists", () => {
  const failure = readIntakeFailure(path.join(os.tmpdir(), "missing-intake-failure.json"));
  assert.equal(failure, null);
});

test("buildIntakeFailureComment explains the existing branch recovery path", () => {
  const comment = buildIntakeFailureComment({
    code: INTAKE_FAILURE_CODES.branchExists,
    branch: "factory/109-add-repair-exhaustion-decision-interventions"
  });

  assert.match(comment, /planning did not start/i);
  assert.match(comment, /factory\/109-add-repair-exhaustion-decision-interventions/);
  assert.match(comment, /\/factory start/);
  assert.doesNotMatch(comment, /non-fast-forward/i);
});

test("main comments and labels intake branch collisions", async () => {
  const failurePath = path.join(os.tmpdir(), `intake-failure-${process.pid}.json`);
  fs.writeFileSync(
    failurePath,
    `${JSON.stringify({
      code: INTAKE_FAILURE_CODES.branchExists,
      issueNumber: 109,
      branch: "factory/109-add-repair-exhaustion-decision-interventions",
      artifactsPath: ".factory/runs/109",
      nextAction:
        "Reuse or clean up the existing planning branch or PR before retrying /factory start."
    })}\n`
  );

  const addLabelCalls = [];
  const commentCalls = [];

  try {
    const result = await handleIntakeFailure(
      {
        FACTORY_INTAKE_FAILURE_PATH: failurePath
      },
      {
        githubClient: {
          addLabels: async (issueNumber, labels) => {
            addLabelCalls.push({ issueNumber, labels });
          },
          commentOnIssue: async (issueNumber, body) => {
            commentCalls.push({ issueNumber, body });
          }
        }
      }
    );

    assert.equal(result.handled, true);
    assert.deepEqual(addLabelCalls, [
      {
        issueNumber: 109,
        labels: [FACTORY_LABELS.intakeRejected]
      }
    ]);
    assert.equal(commentCalls.length, 1);
    assert.equal(commentCalls[0].issueNumber, 109);
    assert.match(commentCalls[0].body, /planning did not start/i);
    assert.match(
      commentCalls[0].body,
      /factory\/109-add-repair-exhaustion-decision-interventions/
    );
  } finally {
    fs.rmSync(failurePath, { force: true });
  }
});

test("main ignores unknown intake failures", async () => {
  const failurePath = path.join(os.tmpdir(), `intake-failure-unknown-${process.pid}.json`);
  fs.writeFileSync(failurePath, `${JSON.stringify({ code: "unknown_error" })}\n`);

  try {
    const result = await handleIntakeFailure(
      {
        FACTORY_INTAKE_FAILURE_PATH: failurePath
      },
      {
        githubClient: {
          addLabels: async () => {
            throw new Error("addLabels should not be called");
          },
          commentOnIssue: async () => {
            throw new Error("commentOnIssue should not be called");
          }
        }
      }
    );

    assert.equal(result.handled, false);
  } finally {
    fs.rmSync(failurePath, { force: true });
  }
});
