import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FACTORY_CODEX_MODEL,
  DEFAULT_FACTORY_REVIEW_MODEL,
  FACTORY_COST_LABELS,
  FACTORY_LABELS,
  FACTORY_STAGE_MODES,
  FACTORY_STAGE_MODEL_VARIABLES,
  LABEL_DEFINITIONS,
  resolveFactoryStageModel,
  resolveFactoryStageModelInfo
} from "../scripts/lib/factory-config.mjs";

test("DEFAULT_FACTORY_REVIEW_MODEL falls back to gpt-5-mini", () => {
  assert.equal(DEFAULT_FACTORY_REVIEW_MODEL, "gpt-5-mini");
});

test("resolveFactoryStageModel prefers an explicit override", () => {
  const model = resolveFactoryStageModel({
    mode: FACTORY_STAGE_MODES.implement,
    overrideModel: "codex-custom-override",
    variables: {
      FACTORY_IMPLEMENT_MODEL: "codex-custom-stage",
      FACTORY_CODEX_MODEL: "codex-custom-shared"
    }
  });

  assert.equal(model, "codex-custom-override");
});

test("resolveFactoryStageModel prefers stage-specific models over shared codex model", () => {
  const model = resolveFactoryStageModel({
    mode: FACTORY_STAGE_MODES.repair,
    variables: {
      FACTORY_REPAIR_MODEL: "codex-repair-cheap",
      FACTORY_CODEX_MODEL: "codex-shared"
    }
  });

  assert.equal(model, "codex-repair-cheap");
});

test("resolveFactoryStageModel falls back to the shared codex model for plan, implement, and repair", () => {
  for (const mode of [
    FACTORY_STAGE_MODES.plan,
    FACTORY_STAGE_MODES.implement,
    FACTORY_STAGE_MODES.repair
  ]) {
    assert.equal(
      resolveFactoryStageModel({
        mode,
        variables: { FACTORY_CODEX_MODEL: "codex-shared" }
      }),
      "codex-shared"
    );
  }
});

test("resolveFactoryStageModel keeps review isolated from the shared codex fallback", () => {
  const model = resolveFactoryStageModel({
    mode: FACTORY_STAGE_MODES.review,
    variables: { FACTORY_CODEX_MODEL: "codex-shared" }
  });

  assert.equal(model, DEFAULT_FACTORY_REVIEW_MODEL);
});

test("resolveFactoryStageModel uses stage defaults when no overrides are provided", () => {
  assert.equal(
    resolveFactoryStageModel({ mode: FACTORY_STAGE_MODES.plan, variables: {} }),
    DEFAULT_FACTORY_CODEX_MODEL
  );
  assert.equal(
    resolveFactoryStageModel({ mode: FACTORY_STAGE_MODES.review, variables: {} }),
    DEFAULT_FACTORY_REVIEW_MODEL
  );
});

test("resolveFactoryStageModelInfo reports override metadata", () => {
  const info = resolveFactoryStageModelInfo({
    mode: FACTORY_STAGE_MODES.implement,
    overrideModel: "codex-override",
    variables: {}
  });

  assert.deepEqual(info, {
    model: "codex-override",
    source: "override",
    sourceVariable: "FACTORY_STAGE_MODEL_OVERRIDE"
  });
});

test("resolveFactoryStageModelInfo reports stage-specific metadata", () => {
  const info = resolveFactoryStageModelInfo({
    mode: FACTORY_STAGE_MODES.repair,
    variables: {
      [FACTORY_STAGE_MODEL_VARIABLES[FACTORY_STAGE_MODES.repair]]:
        "repair-specialist"
    }
  });

  assert.deepEqual(info, {
    model: "repair-specialist",
    source: "stage-variable",
    sourceVariable: FACTORY_STAGE_MODEL_VARIABLES[FACTORY_STAGE_MODES.repair]
  });
});

test("resolveFactoryStageModelInfo reports shared codex metadata", () => {
  const info = resolveFactoryStageModelInfo({
    mode: FACTORY_STAGE_MODES.plan,
    variables: {
      FACTORY_CODEX_MODEL: "codex-shared"
    }
  });

  assert.deepEqual(info, {
    model: "codex-shared",
    source: "shared-variable",
    sourceVariable: "FACTORY_CODEX_MODEL"
  });
});

test("resolveFactoryStageModelInfo reports default metadata with stage variable guidance", () => {
  const info = resolveFactoryStageModelInfo({
    mode: FACTORY_STAGE_MODES.review,
    variables: {}
  });

  assert.deepEqual(info, {
    model: DEFAULT_FACTORY_REVIEW_MODEL,
    source: "default",
    sourceVariable: FACTORY_STAGE_MODEL_VARIABLES[FACTORY_STAGE_MODES.review]
  });
});

test("resolveFactoryStageModelInfo defaults to stage-specific knob for non-review stages", () => {
  const info = resolveFactoryStageModelInfo({
    mode: FACTORY_STAGE_MODES.plan,
    variables: {}
  });

  assert.deepEqual(info, {
    model: DEFAULT_FACTORY_CODEX_MODEL,
    source: "default",
    sourceVariable: FACTORY_STAGE_MODEL_VARIABLES[FACTORY_STAGE_MODES.plan]
  });
});

test("label definitions include advisory cost labels", () => {
  const labels = LABEL_DEFINITIONS.map((definition) => definition.name);

  assert.ok(labels.includes(FACTORY_LABELS.selfModify));
  assert.ok(labels.includes(FACTORY_LABELS.costLow));
  assert.ok(labels.includes(FACTORY_LABELS.costMedium));
  assert.ok(labels.includes(FACTORY_LABELS.costHigh));
  assert.deepEqual([...FACTORY_COST_LABELS].sort(), [
    FACTORY_LABELS.costHigh,
    FACTORY_LABELS.costLow,
    FACTORY_LABELS.costMedium
  ]);
});

test("label definitions include the intake rejection label metadata", () => {
  const definition = LABEL_DEFINITIONS.find(
    (entry) => entry.name === FACTORY_LABELS.intakeRejected
  );

  assert.ok(definition, "expected intake rejection label definition");
  assert.equal(
    definition.description,
    "Factory intake was rejected; issue needs updates before planning can start."
  );
  assert.equal(definition.color, "D73A4A");
});

test("label definitions include the blocked label metadata", () => {
  const definition = LABEL_DEFINITIONS.find(
    (entry) => entry.name === FACTORY_LABELS.blocked
  );

  assert.ok(definition, "expected blocked label definition");
  assert.equal(
    definition.description,
    "Factory execution is blocked and waiting for human intervention to proceed."
  );
  assert.equal(definition.color, "D93F0B");
});

test("label definitions include the self-modify label metadata", () => {
  const definition = LABEL_DEFINITIONS.find(
    (entry) => entry.name === FACTORY_LABELS.selfModify
  );

  assert.ok(definition, "expected self-modify label definition");
  assert.equal(
    definition.description,
    "Allows a factory-managed PR to modify protected factory control-plane files"
  );
  assert.equal(definition.color, "B60205");
});
