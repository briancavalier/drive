import fs from "node:fs";
import path from "node:path";

export const REVIEWERS_DIR_NAME = "reviewers";

function ensureObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return value;
}

function ensureString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
}

function ensureEvidence(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array of strings`);
  }

  return value.map((item, index) => ensureString(item, `${fieldName}[${index}]`));
}

function ensureBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

function validateWorkflowSafetyChecklist(checklist) {
  const normalized = ensureObject(checklist, "checklist");

  return {
    state_changed: ensureBoolean(normalized.state_changed, "checklist.state_changed"),
    writers_reviewed: ensureBoolean(normalized.writers_reviewed, "checklist.writers_reviewed"),
    readers_reviewed: ensureBoolean(normalized.readers_reviewed, "checklist.readers_reviewed"),
    workflow_paths_checked: ensureBoolean(
      normalized.workflow_paths_checked,
      "checklist.workflow_paths_checked"
    ),
    cleanup_paths_checked: ensureBoolean(
      normalized.cleanup_paths_checked,
      "checklist.cleanup_paths_checked"
    ),
    tests_evidence_checked: ensureBoolean(
      normalized.tests_evidence_checked,
      "checklist.tests_evidence_checked"
    ),
    residual_risks: ensureString(normalized.residual_risks, "checklist.residual_risks")
  };
}

function validateFindings(findings, fieldName = "findings") {
  if (!Array.isArray(findings)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return findings.map((finding, index) => {
    const normalized = ensureObject(finding, `${fieldName}[${index}]`);
    const level = ensureString(normalized.level, `${fieldName}[${index}].level`).toLowerCase();

    if (!["blocking", "non_blocking"].includes(level)) {
      throw new Error(`${fieldName}[${index}].level must be "blocking" or "non_blocking"`);
    }

    return {
      ...normalized,
      level,
      title: ensureString(normalized.title, `${fieldName}[${index}].title`),
      details: ensureString(normalized.details, `${fieldName}[${index}].details`),
      scope: ensureString(normalized.scope, `${fieldName}[${index}].scope`),
      recommendation: ensureString(
        normalized.recommendation,
        `${fieldName}[${index}].recommendation`
      ),
      evidence: ensureEvidence(normalized.evidence, `${fieldName}[${index}].evidence`)
    };
  });
}

function validateRequirementChecks(requirementChecks) {
  if (!Array.isArray(requirementChecks)) {
    throw new Error("requirement_checks must be an array");
  }

  return requirementChecks.map((check, index) => {
    const normalized = ensureObject(check, `requirement_checks[${index}]`);
    const type = ensureString(normalized.type, `requirement_checks[${index}].type`).toLowerCase();
    const status = ensureString(
      normalized.status,
      `requirement_checks[${index}].status`
    ).toLowerCase();

    if (!["acceptance_criterion", "spec_commitment", "plan_deliverable"].includes(type)) {
      throw new Error(`requirement_checks[${index}].type is not supported`);
    }

    if (!["satisfied", "partially_satisfied", "not_satisfied", "not_applicable"].includes(status)) {
      throw new Error(`requirement_checks[${index}].status is not supported`);
    }

    return {
      ...normalized,
      type,
      status,
      requirement: ensureString(
        normalized.requirement,
        `requirement_checks[${index}].requirement`
      ),
      evidence: ensureEvidence(normalized.evidence, `requirement_checks[${index}].evidence`)
    };
  });
}

function validateUncertainties(uncertainties) {
  if (!Array.isArray(uncertainties)) {
    throw new Error("uncertainties must be an array");
  }

  return uncertainties.map((entry, index) => ensureString(entry, `uncertainties[${index}]`));
}

export function validateReviewerArtifactPayload(payload, { reviewerName, requiresChecklist = false }) {
  const normalized = ensureObject(payload, "reviewer artifact");
  const reviewer = ensureString(normalized.reviewer, "reviewer");

  if (reviewer !== reviewerName) {
    throw new Error(`reviewer artifact reviewer "${reviewer}" does not match "${reviewerName}"`);
  }

  const status = ensureString(normalized.status, "status").toLowerCase();

  if (!["completed", "skipped"].includes(status)) {
    throw new Error(`status must be "completed" or "skipped", received "${normalized.status}"`);
  }

  const artifact = {
    ...normalized,
    reviewer,
    status,
    summary: ensureString(normalized.summary, "summary"),
    findings: validateFindings(normalized.findings),
    requirement_checks: validateRequirementChecks(normalized.requirement_checks),
    uncertainties: validateUncertainties(normalized.uncertainties)
  };

  if (requiresChecklist) {
    artifact.checklist = validateWorkflowSafetyChecklist(normalized.checklist);
  } else if (normalized.checklist != null) {
    artifact.checklist = validateWorkflowSafetyChecklist(normalized.checklist);
  }

  return artifact;
}

export function loadValidatedReviewerArtifact({
  artifactsPath,
  reviewerName,
  reviewerConfig
}) {
  const artifactPath = path.join(artifactsPath, REVIEWERS_DIR_NAME, `${reviewerName}.json`);
  const payload = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  return validateReviewerArtifactPayload(payload, {
    reviewerName,
    requiresChecklist: reviewerConfig?.authority?.requires_checklist === "workflow-safety"
  });
}

export function loadValidatedReviewerArtifacts({
  artifactsPath,
  reviewerDefinitions = [],
  selection
}) {
  const selected = selection?.selected_reviewers || [];

  return selected.map((selectedReviewer) => {
    const reviewerConfig = reviewerDefinitions.find(
      (reviewer) => reviewer.name === selectedReviewer.name
    );

    if (!reviewerConfig) {
      throw new Error(`Missing reviewer definition for "${selectedReviewer.name}"`);
    }

    return loadValidatedReviewerArtifact({
      artifactsPath,
      reviewerName: selectedReviewer.name,
      reviewerConfig
    });
  });
}
