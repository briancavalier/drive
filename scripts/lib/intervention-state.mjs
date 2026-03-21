import {
  buildFailureHeadline,
  extractFailureDiagnosticsSections
} from "./failure-comment.mjs";

export function defaultFailureInterventionPayload(overrides = {}) {
  return {
    failureType: null,
    failureSignature: null,
    retryAttempts: 0,
    repeatedFailureCount: 0,
    stageNoopAttempts: 0,
    stageSetupAttempts: 0,
    transientRetryAttempts: 0,
    reviewArtifactFailure: null,
    ...overrides
  };
}

export function defaultFailureIntervention(overrides = {}) {
  const payload = defaultFailureInterventionPayload(overrides.payload);

  return {
    id: null,
    type: "failure",
    status: "open",
    stage: null,
    blocking: true,
    summary: "",
    detail: "",
    createdAt: null,
    runId: null,
    runUrl: null,
    payload,
    resolution: null,
    ...overrides,
    payload
  };
}

export function canonicalizeIntervention(intervention) {
  if (!intervention) {
    return null;
  }

  if (`${intervention.type || ""}`.trim() === "failure") {
    return defaultFailureIntervention(intervention);
  }

  return intervention;
}

export function getOpenFailureIntervention(metadata = {}) {
  const intervention = canonicalizeIntervention(metadata?.intervention);

  if (
    intervention &&
    intervention.type === "failure" &&
    intervention.status === "open"
  ) {
    return intervention;
  }

  return null;
}

export function getFailureValue(metadata = {}, key, fallback = null) {
  const intervention = getOpenFailureIntervention(metadata);

  if (intervention?.payload && intervention.payload[key] != null) {
    return intervention.payload[key];
  }

  return fallback;
}

export function getFailureType(metadata = {}) {
  return `${getFailureValue(metadata, "failureType", "") || ""}`.trim();
}

export function getFailureCounter(metadata = {}, key, fallback = 0) {
  return Number(getFailureValue(metadata, key, fallback) || 0);
}

export function getFailureSignature(metadata = {}) {
  return `${getFailureValue(metadata, "failureSignature", "") || ""}`.trim() || null;
}

export function getReviewArtifactFailure(metadata = {}) {
  return getFailureValue(metadata, "reviewArtifactFailure", null);
}

export function buildFailureIntervention({
  action,
  phase,
  failureType,
  failureMessage,
  retryAttempts,
  repeatedFailureCount = 0,
  stageNoopAttempts = 0,
  stageSetupAttempts = 0,
  transientRetryAttempts = 0,
  failureSignature = null,
  runId = null,
  runUrl = null,
  reviewArtifactFailure = null,
  blocking = true
}) {
  const { detail, diagnostics } = extractFailureDiagnosticsSections(failureMessage);
  const summary = buildFailureHeadline({ action, phase, failureType, retryAttempts });
  const detailText = [detail, diagnostics ? `Stage diagnostics:\n${diagnostics}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return defaultFailureIntervention({
    stage: action,
    blocking,
    summary,
    detail: detailText,
    createdAt: new Date().toISOString(),
    runId: runId || null,
    runUrl: runUrl || null,
    payload: {
      failureType,
      failureSignature: failureSignature || null,
      retryAttempts,
      repeatedFailureCount,
      stageNoopAttempts,
      stageSetupAttempts,
      transientRetryAttempts,
      reviewArtifactFailure
    }
  });
}
