import test from "node:test";
import assert from "node:assert/strict";
import { main as applyInterventionAnswer } from "../scripts/apply-intervention-answer.mjs";
import {
  defaultApprovalIntervention,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";

function buildPullRequestBody(metadata = {}) {
  return renderPrBody({
    issueNumber: 22,
    branch: "factory/22-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/22",
    metadata: {
      issueNumber: 22,
      artifactsPath: ".factory/runs/22",
      status: "blocked",
      blockedAction: "implement",
      repairAttempts: 0,
      maxRepairAttempts: 3,
      ...metadata
    }
  });
}

test("applyInterventionAnswer resolves approval and resumes the blocked action", async () => {
  let execCall = null;

  await applyInterventionAnswer(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_INTERVENTION_ID: "int_q_123",
      FACTORY_OPTION_ID: "approve_once",
      FACTORY_RESUME_ACTION: "implement",
      FACTORY_ANSWER_NOTE: "Approved after applying the label.",
      GITHUB_ACTOR: "maintainer",
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      getPullRequest: async () => ({
        body: buildPullRequestBody({
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            stage: "implement",
            payload: {
              question: "Continue after applying the label?",
              recommendedOptionId: "approve_once",
              options: [
                { id: "approve_once", label: "Approve once", effect: "resume_current_stage" },
                { id: "deny", label: "Do not approve", effect: "remain_blocked" }
              ]
            }
          })
        })
      }),
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  );

  assert.deepEqual(execCall.args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCall.env.FACTORY_STATUS, "implementing");
  assert.equal(execCall.env.FACTORY_INTERVENTION, "__CLEAR__");
  assert.equal(execCall.env.FACTORY_BLOCKED_ACTION, "");
  assert.equal(execCall.env.FACTORY_PAUSED, "false");
  assert.match(execCall.env.FACTORY_COMMENT, /Resolved factory question `int_q_123`/);
  assert.match(execCall.env.FACTORY_COMMENT, /Resuming `implement`\./);
  assert.match(execCall.env.FACTORY_COMMENT, /Approved after applying the label\./);
});

test("applyInterventionAnswer resolves denial without resuming", async () => {
  let execCall = null;

  await applyInterventionAnswer(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_INTERVENTION_ID: "int_q_123",
      FACTORY_OPTION_ID: "deny",
      FACTORY_RESUME_ACTION: "implement",
      GITHUB_ACTOR: "maintainer",
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      getPullRequest: async () => ({
        body: buildPullRequestBody({
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            stage: "implement",
            payload: {
              question: "Continue after applying the label?",
              recommendedOptionId: "approve_once",
              options: [
                { id: "approve_once", label: "Approve once", effect: "resume_current_stage" },
                { id: "deny", label: "Do not approve", effect: "remain_blocked" }
              ]
            }
          })
        })
      }),
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  );

  assert.deepEqual(execCall.args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCall.env.FACTORY_STATUS, "blocked");
  assert.equal(execCall.env.FACTORY_INTERVENTION, "__CLEAR__");
  assert.equal(execCall.env.FACTORY_PAUSED, "true");
  assert.match(execCall.env.FACTORY_PAUSE_REASON, /Approval denied via \/factory answer/);
  assert.match(execCall.env.FACTORY_COMMENT, /remain blocked/i);
});
