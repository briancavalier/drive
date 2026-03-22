import {
  buildFailureHeadline,
  extractFailureDiagnosticsSections
} from "./failure-comment.mjs";

function normalizeOption(option = {}) {
  return {
    id: `${option.id || ""}`.trim(),
    label: `${option.label || ""}`.trim(),
    effect: `${option.effect || ""}`.trim()
  };
}

function normalizeResumeContext(context = {}) {
  return {
    ciRunId: `${context.ciRunId || ""}`.trim() || null,
    reviewId: `${context.reviewId || ""}`.trim() || null,
    repairAttempts: Number(context.repairAttempts || 0),
    repeatedFailureCount: Number(context.repeatedFailureCount || 0),
    failureSignature: `${context.failureSignature || ""}`.trim() || null,
    stageNoopAttempts: Number(context.stageNoopAttempts || 0),
    stageSetupAttempts: Number(context.stageSetupAttempts || 0)
  };
}

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

export function defaultQuestionInterventionPayload(overrides = {}) {
  return {
    questionKind: null,
    question: "",
    recommendedOptionId: null,
    options: [],
    allowsComment: true,
    version: 1,
    resumeContext: normalizeResumeContext(overrides.resumeContext),
    ...overrides,
    options: Array.isArray(overrides.options)
      ? overrides.options.map(normalizeOption)
      : [],
    resumeContext: normalizeResumeContext(overrides.resumeContext)
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

export function defaultQuestionIntervention(overrides = {}) {
  const payload = defaultQuestionInterventionPayload(overrides.payload);

  return {
    id: null,
    type: "question",
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

export function defaultApprovalIntervention(overrides = {}) {
  return defaultQuestionIntervention({
    ...overrides,
    type: "approval",
    payload: {
      questionKind: "approval",
      ...overrides.payload
    }
  });
}

export function canonicalizeIntervention(intervention) {
  if (!intervention) {
    return null;
  }

  const type = `${intervention.type || ""}`.trim();

  if (type === "failure") {
    return defaultFailureIntervention(intervention);
  }

  if (type === "question") {
    return defaultQuestionIntervention(intervention);
  }

  if (type === "approval") {
    return defaultApprovalIntervention(intervention);
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

export function getOpenQuestionIntervention(metadata = {}) {
  const intervention = canonicalizeIntervention(metadata?.intervention);

  if (
    intervention &&
    (intervention.type === "question" || intervention.type === "approval") &&
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

export function getQuestionOptions(intervention) {
  return Array.isArray(intervention?.payload?.options)
    ? intervention.payload.options.map(normalizeOption)
    : [];
}

export function getQuestionOption(intervention, optionId) {
  const normalizedOptionId = `${optionId || ""}`.trim();

  return getQuestionOptions(intervention).find((option) => option.id === normalizedOptionId) || null;
}

export function getQuestionResumeContext(intervention) {
  return normalizeResumeContext(intervention?.payload?.resumeContext);
}

export function buildInterventionId(prefix = "int") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}_${timestamp}`;
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

export function buildApprovalIntervention({
  id = buildInterventionId("int_q"),
  action,
  summary,
  detail = "",
  question,
  recommendedOptionId,
  options,
  runId = null,
  runUrl = null,
  allowsComment = true,
  resumeContext = {}
}) {
  return defaultApprovalIntervention({
    id,
    stage: action,
    summary: `${summary || ""}`.trim(),
    detail: `${detail || ""}`.trim(),
    createdAt: new Date().toISOString(),
    runId: runId || null,
    runUrl: runUrl || null,
    payload: {
      questionKind: "approval",
      question: `${question || ""}`.trim(),
      recommendedOptionId: `${recommendedOptionId || ""}`.trim() || null,
      options: Array.isArray(options) ? options : [],
      allowsComment,
      resumeContext
    }
  });
}
