import test from "node:test";
import assert from "node:assert/strict";
import { main as applyInterventionAnswer } from "../scripts/apply-intervention-answer.mjs";
import {
  defaultApprovalIntervention,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";
import os from "node:os";
import path from "node:path";

process.env.GITHUB_OUTPUT = path.join(os.tmpdir(), "apply-intervention-output.txt");

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
        labels: [],
        body: buildPullRequestBody({
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            stage: "implement",
            payload: {
              question: "Continue with self-modify authorization for the next resumed stage?",
              recommendedOptionId: "approve_once",
              applySelfModifyLabelOnApproval: true,
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
  assert.equal(execCall.env.FACTORY_PENDING_STAGE_DECISION, "__UNCHANGED__");
  assert.equal(execCall.env.FACTORY_BLOCKED_ACTION, "");
  assert.equal(execCall.env.FACTORY_PAUSED, "false");
  assert.equal(execCall.env.FACTORY_SELF_MODIFY_LABEL_ACTION, "add");
  assert.equal(execCall.env.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL, "true");
  assert.match(execCall.env.FACTORY_COMMENT, /Resolved factory question `int_q_123`/);
  assert.match(execCall.env.FACTORY_COMMENT, /Resuming `implement`\./);
  assert.match(execCall.env.FACTORY_COMMENT, /Approved after applying the label\./);
});

test("applyInterventionAnswer persists an ambiguity decision before resuming implement", async () => {
  let execCall = null;

  await applyInterventionAnswer(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_INTERVENTION_ID: "int_q_ambiguity",
      FACTORY_OPTION_ID: "api_first",
      FACTORY_RESUME_ACTION: "implement",
      GITHUB_ACTOR: "maintainer",
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      getPullRequest: async () => ({
        labels: [],
        body: buildPullRequestBody({
          intervention: {
            id: "int_q_ambiguity",
            type: "question",
            status: "open",
            stage: "implement",
            payload: {
              questionKind: "ambiguity",
              question: "Which implementation direction should the factory take?",
              recommendedOptionId: "api_first",
              options: [
                {
                  id: "api_first",
                  label: "API-first path",
                  effect: "resume_current_stage",
                  instruction: "Implement the API-first path and ignore the UI-only alternative."
                },
                {
                  id: "human_takeover",
                  label: "Hand off to human-only handling",
                  effect: "manual_only"
                }
              ]
            }
          }
        })
      }),
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  );

  assert.deepEqual(execCall.args, ["scripts/apply-pr-state.mjs"]);
  const decision = JSON.parse(execCall.env.FACTORY_PENDING_STAGE_DECISION);
  assert.equal(decision.sourceInterventionId, "int_q_ambiguity");
  assert.equal(decision.kind, "ambiguity");
  assert.equal(decision.selectedOptionId, "api_first");
  assert.equal(decision.selectedOptionLabel, "API-first path");
  assert.match(decision.instruction, /API-first path/);
  assert.equal(decision.answeredBy, "maintainer");
  assert.equal(execCall.env.FACTORY_STATUS, "implementing");
});

test("applyInterventionAnswer does not persist a pending decision for human takeover", async () => {
  let execCall = null;

  await applyInterventionAnswer(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_INTERVENTION_ID: "int_q_ambiguity",
      FACTORY_OPTION_ID: "human_takeover",
      FACTORY_RESUME_ACTION: "implement",
      GITHUB_ACTOR: "maintainer",
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      getPullRequest: async () => ({
        labels: [],
        body: buildPullRequestBody({
          intervention: {
            id: "int_q_ambiguity",
            type: "question",
            status: "open",
            stage: "implement",
            payload: {
              questionKind: "ambiguity",
              question: "Which implementation direction should the factory take?",
              recommendedOptionId: "api_first",
              options: [
                {
                  id: "api_first",
                  label: "API-first path",
                  effect: "resume_current_stage",
                  instruction: "Implement the API-first path and ignore the UI-only alternative."
                },
                {
                  id: "human_takeover",
                  label: "Hand off to human-only handling",
                  effect: "manual_only"
                }
              ]
            }
          }
        })
      }),
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  );

  assert.equal(execCall.env.FACTORY_PENDING_STAGE_DECISION, "__UNCHANGED__");
  assert.equal(execCall.env.FACTORY_STATUS, "blocked");
});

test("applyInterventionAnswer preserves an existing self-modify label on approval", async () => {
  let execCall = null;

  await applyInterventionAnswer(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_INTERVENTION_ID: "int_q_123",
      FACTORY_OPTION_ID: "approve_once",
      FACTORY_RESUME_ACTION: "implement",
      GITHUB_ACTOR: "maintainer",
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      getPullRequest: async () => ({
        labels: [{ name: "factory:self-modify" }],
        body: buildPullRequestBody({
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            stage: "implement",
            payload: {
              question: "Continue with self-modify authorization for the next resumed stage?",
              recommendedOptionId: "approve_once",
              applySelfModifyLabelOnApproval: true,
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
  assert.equal(execCall.env.FACTORY_SELF_MODIFY_LABEL_ACTION, "__UNCHANGED__");
  assert.equal(execCall.env.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL, "__UNCHANGED__");
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
        labels: [],
        body: buildPullRequestBody({
          intervention: defaultApprovalIntervention({
            id: "int_q_123",
            stage: "implement",
            payload: {
              question: "Continue with self-modify authorization for the next resumed stage?",
              recommendedOptionId: "approve_once",
              applySelfModifyLabelOnApproval: true,
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
  assert.equal(execCall.env.FACTORY_SELF_MODIFY_LABEL_ACTION, "__UNCHANGED__");
  assert.equal(execCall.env.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL, "__UNCHANGED__");
  assert.match(execCall.env.FACTORY_PAUSE_REASON, /Approval denied via \/factory answer/);
  assert.match(execCall.env.FACTORY_COMMENT, /remain blocked/i);
});
