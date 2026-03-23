import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERVENTION_REQUEST_PATH,
  detectChangedRepoPaths,
  detectStageInterventionRequest,
  validateInterventionRequest
} from "../scripts/detect-stage-intervention-request.mjs";

function validRequest() {
  return {
    type: "question",
    questionKind: "ambiguity",
    summary: "Need a decision between two valid implementation directions",
    detail: "Both paths satisfy the approved plan, but they lead to different code.",
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
  };
}

test("validateInterventionRequest accepts a valid ambiguity request", () => {
  const request = validateInterventionRequest(validRequest());

  assert.equal(request.type, "question");
  assert.equal(request.questionKind, "ambiguity");
  assert.equal(request.options[0].instruction, "Implement the API-first path and ignore the UI-only alternative.");
});

test("validateInterventionRequest rejects malformed ambiguity requests", () => {
  assert.throws(
    () =>
      validateInterventionRequest({
        ...validRequest(),
        options: [
          {
            id: "api_first",
            label: "API-first path",
            effect: "resume_current_stage"
          },
          {
            id: "human_takeover",
            label: "Hand off to human-only handling",
            effect: "manual_only"
          }
        ]
      }),
    /must include instruction/
  );
});

test("detectChangedRepoPaths ignores the temp intervention request file", () => {
  const changed = detectChangedRepoPaths({
    gitStatus: () =>
      [
        " M .factory/tmp/intervention-request.json",
        " M scripts/build-stage-prompt.mjs",
        "?? .factory/tmp/extra.txt"
      ].join("\n")
  });

  assert.deepEqual(changed, ["scripts/build-stage-prompt.mjs"]);
});

test("detectStageInterventionRequest accepts a valid implement-stage ambiguity request", async () => {
  const outputs = {};
  let unlinkedPath = null;

  const request = await detectStageInterventionRequest({
    env: { FACTORY_MODE: "implement" },
    dependencies: {
      exists: (filePath) => filePath === INTERVENTION_REQUEST_PATH,
      readFile: () => JSON.stringify(validRequest()),
      unlinkFile: (filePath) => {
        unlinkedPath = filePath;
      },
      listChangedRepoPaths: () => [],
      setOutputs: (next) => Object.assign(outputs, next)
    }
  });

  assert.equal(request.questionKind, "ambiguity");
  assert.equal(unlinkedPath, INTERVENTION_REQUEST_PATH);
  assert.equal(outputs.intervention_requested, "true");
  assert.equal(JSON.parse(outputs.intervention_payload).recommendedOptionId, "api_first");
  assert.equal(outputs.failure_type, "");
});

test("detectStageInterventionRequest rejects requests with tracked repo changes", async () => {
  const outputs = {};
  let unlinkedPath = null;

  await assert.rejects(
    () =>
      detectStageInterventionRequest({
        env: { FACTORY_MODE: "implement" },
        dependencies: {
          exists: () => true,
          readFile: () => JSON.stringify(validRequest()),
          unlinkFile: (filePath) => {
            unlinkedPath = filePath;
          },
          listChangedRepoPaths: () => ["scripts/lib/factory-config.mjs"],
          setOutputs: (next) => Object.assign(outputs, next)
        }
      }),
    /must not include repo-tracked changes/
  );

  assert.equal(unlinkedPath, INTERVENTION_REQUEST_PATH);
  assert.equal(outputs.intervention_requested, "false");
  assert.equal(outputs.failure_type, "stage_setup");
  assert.match(outputs.failure_message, /Invalid implement-stage ambiguity request/);
});

test("detectStageInterventionRequest rejects ambiguity requests outside implement mode", async () => {
  const outputs = {};
  let unlinkedPath = null;

  await assert.rejects(
    () =>
      detectStageInterventionRequest({
        env: { FACTORY_MODE: "repair" },
        dependencies: {
          exists: () => true,
          unlinkFile: (filePath) => {
            unlinkedPath = filePath;
          },
          setOutputs: (next) => Object.assign(outputs, next)
        }
      }),
    /only supported for implement runs/
  );

  assert.equal(unlinkedPath, INTERVENTION_REQUEST_PATH);
  assert.equal(outputs.intervention_requested, "false");
  assert.equal(outputs.failure_type, "stage_setup");
});

test("detectStageInterventionRequest reports no request when the file is absent", async () => {
  const outputs = {};

  const request = await detectStageInterventionRequest({
    env: { FACTORY_MODE: "implement" },
    dependencies: {
      exists: () => false,
      setOutputs: (next) => Object.assign(outputs, next)
    }
  });

  assert.equal(request, null);
  assert.equal(outputs.intervention_requested, "false");
  assert.equal(outputs.intervention_payload, "");
  assert.equal(outputs.failure_type, "");
});
