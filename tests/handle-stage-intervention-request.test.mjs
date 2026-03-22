import test from "node:test";
import assert from "node:assert/strict";
import { handleStageInterventionRequest } from "../scripts/handle-stage-intervention-request.mjs";
import {
  defaultFailureIntervention,
  defaultPrMetadata,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";

function buildPullRequestBody(metadata = {}) {
  return renderPrBody({
    issueNumber: 41,
    branch: "factory/41-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/41",
    metadata: defaultPrMetadata({
      issueNumber: 41,
      artifactsPath: ".factory/runs/41",
      status: "implementing",
      lastProcessedWorkflowRunId: "123456789",
      repairAttempts: 2,
      ...metadata
    })
  });
}

test("handleStageInterventionRequest blocks the PR with a canonical ambiguity question", async () => {
  let execCall = null;

  const intervention = await handleStageInterventionRequest({
    env: {
      FACTORY_PR_NUMBER: "41",
      FACTORY_STAGE_ACTION: "implement",
      FACTORY_INTERVENTION_REQUEST: JSON.stringify({
        type: "question",
        questionKind: "ambiguity",
        summary: "Need a decision between two valid implementation directions",
        detail: "Both paths satisfy the plan, but they lead to different code.",
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
      }),
      GITHUB_RUN_ID: "999",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    dependencies: {
      getPullRequest: async () => ({
        body: buildPullRequestBody({
          intervention: defaultFailureIntervention({
            payload: {
              failureType: "stage_noop",
              repeatedFailureCount: 1,
              failureSignature: "sig-123",
              stageNoopAttempts: 2,
              stageSetupAttempts: 3
            }
          })
        })
      }),
      execFileAsync: async (_cmd, args, options) => {
        execCall = { args, env: options.env };
      }
    }
  });

  assert.equal(intervention.type, "question");
  assert.equal(intervention.payload.questionKind, "ambiguity");
  assert.equal(intervention.payload.resumeContext.ciRunId, "123456789");
  assert.equal(intervention.payload.resumeContext.repairAttempts, 2);
  assert.equal(intervention.payload.resumeContext.repeatedFailureCount, 1);
  assert.equal(intervention.payload.resumeContext.failureSignature, "sig-123");

  assert.deepEqual(execCall.args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCall.env.FACTORY_STATUS, "blocked");
  assert.equal(execCall.env.FACTORY_BLOCKED_ACTION, "implement");
  assert.equal(execCall.env.FACTORY_PENDING_STAGE_DECISION, "__CLEAR__");
  assert.equal(execCall.env.FACTORY_SELF_MODIFY_LABEL_ACTION, "remove_if_auto_applied");
  assert.equal(execCall.env.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL, "false");
  assert.match(execCall.env.FACTORY_COMMENT, /^## Factory Question/m);
  assert.match(execCall.env.FACTORY_COMMENT, /\/factory answer .* api_first/);
  assert.equal(JSON.parse(execCall.env.FACTORY_INTERVENTION).payload.questionKind, "ambiguity");
});
