import test from "node:test";
import assert from "node:assert/strict";
import { main as raiseRepairQuestion } from "../scripts/raise-repair-exhaustion-question.mjs";

test("raiseRepairExhaustionQuestion applies question intervention with blocked status", async () => {
  let execCall = null;
  const interventionPayload = JSON.stringify({
    id: "int_q_repair",
    type: "question",
    status: "open",
    stage: "repair",
    summary: "Autonomous repair exhausted after 3/3 attempts.",
    payload: {
      questionKind: "repair_exhaustion",
      question: "The factory can’t repair this branch autonomously. What should happen next?",
      recommendedOptionId: "retry_repair",
      options: [{ id: "retry_repair", label: "Retry repair", effect: "resume_current_stage" }],
      resumeContext: {
        repairAttempts: 4
      }
    }
  });

  await raiseRepairQuestion(
    {
      FACTORY_PR_NUMBER: "22",
      FACTORY_REPAIR_QUESTION_INTERVENTION: interventionPayload,
      FACTORY_REPAIR_QUESTION_COMMENT: "## Factory Question\nSummary: Autonomous repair exhausted after 3/3 attempts.",
      FACTORY_REPAIR_ATTEMPTS: "4",
      FACTORY_CI_RUN_ID: "777",
      FACTORY_GITHUB_TOKEN: "token",
      GITHUB_TOKEN: "gh-token",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    {
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  );

  assert.ok(execCall, "expected apply-pr-state invocation");
  assert.deepEqual(execCall.args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCall.env.FACTORY_STATUS, "blocked");
  assert.equal(execCall.env.FACTORY_BLOCKED_ACTION, "repair");
  assert.equal(execCall.env.FACTORY_INTERVENTION, interventionPayload);
  assert.equal(execCall.env.FACTORY_COMMENT, "## Factory Question\nSummary: Autonomous repair exhausted after 3/3 attempts.");
  assert.equal(execCall.env.FACTORY_REPAIR_ATTEMPTS, "4");
  assert.equal(execCall.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID, "777");
  assert.equal(
    execCall.env.FACTORY_LAST_RUN_URL,
    "https://github.com/example/repo/actions/runs/777"
  );
  assert.equal(execCall.env.FACTORY_CI_STATUS, "failure");
});
