import { setOutputs } from "./lib/actions-output.mjs";
import { assertFactoryStageMode } from "./lib/factory-config.mjs";
import { fileURLToPath } from "node:url";

const MODEL_ENDPOINT_BASE = "https://api.openai.com/v1/models";

function buildModelUnavailableMessage({ mode, model, sourceVariable }) {
  const modeLabel = `${mode} stage model`;
  const adjustmentHint = sourceVariable
    ? `Update ${sourceVariable} to point at a supported model.`
    : "Update the stage model configuration to point at a supported model.";

  return `Resolved ${modeLabel} "${model}" is not available. ${adjustmentHint}`;
}

function buildAuthorizationFailureMessage({ mode, model }) {
  const modeLabel = `${mode} stage model`;

  return `Unable to validate ${modeLabel} "${model}" due to an OpenAI authorization error. Confirm OPENAI_API_KEY grants access to this model.`;
}

function writeOutputs(outputs, writer) {
  writer({
    ...outputs,
    validated: outputs.validated ?? "false"
  });
}

export async function validateStageModel({
  env = process.env,
  fetchImpl = global.fetch,
  outputWriter = setOutputs,
  logger = console
} = {}) {
  const model = `${env.FACTORY_STAGE_MODEL || ""}`.trim();
  const modeInput = `${env.FACTORY_STAGE_MODE || ""}`.trim();
  const sourceVariable = `${env.FACTORY_STAGE_MODEL_SOURCE_VARIABLE || ""}`.trim();
  const apiKey = `${env.OPENAI_API_KEY || ""}`.trim();

  const bailWithConfigurationFailure = (message) => {
    writeOutputs(
      {
        failure_type: "configuration",
        failure_message: message,
        validated: "false"
      },
      outputWriter
    );

    return { exitCode: 1, status: "configuration_failure", message };
  };

  if (!model) {
    return bailWithConfigurationFailure(
      "FACTORY_STAGE_MODEL is required to validate the stage model configuration."
    );
  }

  if (!modeInput) {
    return bailWithConfigurationFailure(
      "FACTORY_STAGE_MODE is required to validate the stage model configuration."
    );
  }

  if (!apiKey) {
    return bailWithConfigurationFailure(
      "OPENAI_API_KEY is required to validate the stage model configuration."
    );
  }

  let mode;

  try {
    mode = assertFactoryStageMode(modeInput);
  } catch (error) {
    return bailWithConfigurationFailure(error.message);
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("validateStageModel requires a fetch implementation");
  }

  const url = `${MODEL_ENDPOINT_BASE}/${encodeURIComponent(model)}`;

  let response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    logger.warn(
      `Skipping stage model validation due to request failure: ${error.message || error}`
    );

    writeOutputs({ validated: "false" }, outputWriter);

    return { exitCode: 0, status: "skipped" };
  }

  const contentType = response.headers?.get?.("content-type") || "";
  const isJson = contentType.includes("application/json");
  let responseBody;

  if (!response.ok && isJson && typeof response.json === "function") {
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }
  }

  const rawErrorCode =
    responseBody?.error?.code || responseBody?.error?.type || "";
  const normalizedErrorCode = `${rawErrorCode || ""}`.toLowerCase();

  if (response.ok) {
    writeOutputs({ validated: "true" }, outputWriter);

    return { exitCode: 0, status: "validated" };
  }

  if (
    response.status === 404 ||
    normalizedErrorCode === "model_not_found" ||
    normalizedErrorCode === "model_not_found_in_subscription"
  ) {
    return bailWithConfigurationFailure(
      buildModelUnavailableMessage({ mode, model, sourceVariable })
    );
  }

  if (response.status === 401 || response.status === 403) {
    return bailWithConfigurationFailure(
      buildAuthorizationFailureMessage({ mode, model })
    );
  }

  if (response.status >= 500 || response.status === 429) {
    logger.warn(
      `Skipping stage model validation due to upstream error (${response.status}).`
    );

    writeOutputs({ validated: "false" }, outputWriter);

    return { exitCode: 0, status: "skipped" };
  }

  if (normalizedErrorCode) {
    return bailWithConfigurationFailure(
      `Failed to validate ${mode} stage model "${model}": ${rawErrorCode}.`
    );
  }

  return bailWithConfigurationFailure(
    `Failed to validate ${mode} stage model "${model}". Response status: ${response.status}.`
  );
}

async function runFromCli() {
  const result = await validateStageModel();

  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runFromCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
