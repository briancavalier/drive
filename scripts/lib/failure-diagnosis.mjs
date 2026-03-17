import fs from "node:fs";

export const FAILURE_DIAGNOSIS_SCOPES = Object.freeze([
  "control_plane",
  "pr_branch",
  "external",
  "unclear"
]);

export const FAILURE_DIAGNOSIS_CONFIDENCE = Object.freeze([
  "low",
  "medium",
  "high"
]);

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
}

export function validateFailureAdvisory(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("failure advisory must be an object");
  }

  const diagnosis = ensureNonEmptyString(payload.diagnosis, "diagnosis");
  const scope = ensureNonEmptyString(payload.scope, "scope");
  const confidence = ensureNonEmptyString(payload.confidence, "confidence");

  if (!FAILURE_DIAGNOSIS_SCOPES.includes(scope)) {
    throw new Error(
      `scope must be one of ${FAILURE_DIAGNOSIS_SCOPES.join(", ")}, received "${scope}"`
    );
  }

  if (!FAILURE_DIAGNOSIS_CONFIDENCE.includes(confidence)) {
    throw new Error(
      `confidence must be one of ${FAILURE_DIAGNOSIS_CONFIDENCE.join(", ")}, received "${confidence}"`
    );
  }

  if (!Array.isArray(payload.recovery_steps) || payload.recovery_steps.length === 0) {
    throw new Error("recovery_steps must be a non-empty array");
  }

  const recoverySteps = payload.recovery_steps.map((step, index) =>
    ensureNonEmptyString(step, `recovery_steps[${index}]`)
  );

  return {
    diagnosis,
    scope,
    recovery_steps: recoverySteps,
    confidence
  };
}

export function readFailureAdvisory(
  advisoryPath,
  { readFileImpl = fs.readFileSync, logger = console } = {}
) {
  if (!`${advisoryPath || ""}`.trim()) {
    return null;
  }

  try {
    const advisoryText = readFileImpl(advisoryPath, "utf8");
    return validateFailureAdvisory(JSON.parse(advisoryText));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    logger.warn(
      `Ignoring invalid failure advisory at ${advisoryPath}: ${error.message || String(error)}`
    );
    return null;
  }
}
