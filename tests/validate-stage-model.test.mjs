import test from "node:test";
import assert from "node:assert/strict";
import { validateStageModel } from "../scripts/validate-stage-model.mjs";

function createResponse({
  ok,
  status,
  jsonBody,
  headers = { "content-type": "application/json" }
}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || headers[name] || null;
      }
    },
    async json() {
      if (jsonBody === undefined) {
        throw new Error("no json body");
      }

      return jsonBody;
    }
  };
}

function defaultEnv(overrides = {}) {
  return {
    FACTORY_STAGE_MODEL: "gpt-5-mini",
    FACTORY_STAGE_MODE: "review",
    FACTORY_STAGE_MODEL_SOURCE_VARIABLE: "FACTORY_REVIEW_MODEL",
    OPENAI_API_KEY: "sk-test",
    ...overrides
  };
}

test("validateStageModel succeeds when the model exists", async () => {
  const outputs = {};

  const result = await validateStageModel({
    env: defaultEnv({ FACTORY_STAGE_MODEL: "gpt-5-mini" }),
    fetchImpl: async () =>
      createResponse({
        ok: true,
        status: 200,
        headers: { "content-type": "application/json" }
      }),
    outputWriter: (data) => Object.assign(outputs, data),
    logger: { warn: () => {} }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "validated");
  assert.equal(outputs.validated, "true");
  assert.ok(!("failure_type" in outputs));
});

test("validateStageModel reports configuration failure for missing models", async () => {
  const outputs = {};

  const result = await validateStageModel({
    env: defaultEnv({ FACTORY_STAGE_MODEL: "does-not-exist" }),
    fetchImpl: async () =>
      createResponse({
        ok: false,
        status: 404,
        jsonBody: { error: { code: "model_not_found" } }
      }),
    outputWriter: (data) => Object.assign(outputs, data),
    logger: { warn: () => {} }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "configuration_failure");
  assert.equal(outputs.failure_type, "configuration");
  assert.equal(outputs.validated, "false");
  assert.match(
    outputs.failure_message,
    /Resolved review stage model "does-not-exist" is not available/
  );
  assert.match(outputs.failure_message, /FACTORY_REVIEW_MODEL/);
});

test("validateStageModel reports configuration failure for authorization errors", async () => {
  const outputs = {};

  const result = await validateStageModel({
    env: defaultEnv({ FACTORY_STAGE_MODEL: "gpt-5-mini" }),
    fetchImpl: async () =>
      createResponse({
        ok: false,
        status: 401,
        jsonBody: { error: { code: "invalid_api_key" } }
      }),
    outputWriter: (data) => Object.assign(outputs, data),
    logger: { warn: () => {} }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "configuration_failure");
  assert.equal(outputs.failure_type, "configuration");
  assert.match(outputs.failure_message, /authorization error/i);
  assert.match(outputs.failure_message, /OPENAI_API_KEY/);
});

test("validateStageModel skips on transient server errors", async () => {
  const outputs = {};
  let warned = false;

  const result = await validateStageModel({
    env: defaultEnv(),
    fetchImpl: async () =>
      createResponse({
        ok: false,
        status: 503,
        jsonBody: { error: { code: "service_unavailable" } }
      }),
    outputWriter: (data) => Object.assign(outputs, data),
    logger: { warn: () => (warned = true) }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "skipped");
  assert.equal(outputs.validated, "false");
  assert.ok(!("failure_type" in outputs));
  assert.ok(warned, "expected warning log");
});
