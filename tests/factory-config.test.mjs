import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FACTORY_CODEX_MODEL,
  DEFAULT_FACTORY_REVIEW_MODEL,
  FACTORY_STAGE_MODES,
  resolveFactoryStageModel
} from "../scripts/lib/factory-config.mjs";

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
