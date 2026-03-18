import fs from "node:fs";
import path from "node:path";
import {
  countBlockingFindings,
  resolveReviewMethodology,
  sanitizeReviewDecision
} from "./review-methods.mjs";
import {
  normalizeNewlines,
  renderCanonicalTraceabilityMarkdown
} from "./review-output.mjs";

export const REVIEW_JSON_NAME = "review.json";
export const REVIEW_MD_NAME = "review.md";
const TRACEABILITY_HEADING_TOKENS = ["## \ud83e\udded Traceability", "## Traceability"];

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

function readMarkdown(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
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

function ensureInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function validateFindings(findings) {
  if (!Array.isArray(findings)) {
    throw new Error("findings must be an array");
  }

  return findings.map((finding, index) => {
    if (typeof finding !== "object" || finding === null) {
      throw new Error(`finding at index ${index} must be an object`);
    }

    const level = sanitizeReviewDecision(ensureString(finding.level, `findings[${index}].level`));

    if (level !== "blocking" && level !== "non_blocking") {
      throw new Error(
        `findings[${index}].level must be "blocking" or "non_blocking", received "${finding.level}"`
      );
    }

    return {
      ...finding,
      level,
      title: ensureString(finding.title, `findings[${index}].title`),
      details: ensureString(finding.details, `findings[${index}].details`),
      scope: ensureString(finding.scope, `findings[${index}].scope`),
      recommendation: ensureString(finding.recommendation, `findings[${index}].recommendation`)
    };
  });
}

function validateRequirementChecks(requirementChecks) {
  if (!Array.isArray(requirementChecks) || requirementChecks.length === 0) {
    throw new Error("requirement_checks must be a non-empty array");
  }

  return requirementChecks.map((check, index) => {
    if (typeof check !== "object" || check === null) {
      throw new Error(`requirement_checks[${index}] must be an object`);
    }

    const type = sanitizeReviewDecision(
      ensureString(check.type, `requirement_checks[${index}].type`)
    );
    const status = sanitizeReviewDecision(
      ensureString(check.status, `requirement_checks[${index}].status`)
    );

    if (!["acceptance_criterion", "spec_commitment", "plan_deliverable"].includes(type)) {
      throw new Error(
        `requirement_checks[${index}].type must be "acceptance_criterion", "spec_commitment", or "plan_deliverable", received "${check.type}"`
      );
    }

    if (
      !["satisfied", "partially_satisfied", "not_satisfied", "not_applicable"].includes(status)
    ) {
      throw new Error(
        `requirement_checks[${index}].status must be "satisfied", "partially_satisfied", "not_satisfied", or "not_applicable", received "${check.status}"`
      );
    }

    return {
      ...check,
      type,
      status,
      requirement: ensureString(check.requirement, `requirement_checks[${index}].requirement`),
      evidence: ensureString(check.evidence, `requirement_checks[${index}].evidence`)
    };
  });
}

function validateReviewPayload(payload, expectedMethodology) {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("review.json must contain an object");
  }

  const methodology = ensureString(payload.methodology, "methodology");

  if (methodology !== expectedMethodology) {
    throw new Error(
      `review.json methodology "${methodology}" does not match expected "${expectedMethodology}"`
    );
  }

  const decision = sanitizeReviewDecision(payload.decision);

  if (!["pass", "request_changes"].includes(decision)) {
    throw new Error(`decision must be "pass" or "request_changes", received "${payload.decision}"`);
  }

  const summary = ensureString(payload.summary, "summary");
  const blockingCount = ensureInteger(payload.blocking_findings_count, "blocking_findings_count");
  const requirementChecks = validateRequirementChecks(payload.requirement_checks);
  const findings = validateFindings(payload.findings);
  const computedBlocking = countBlockingFindings(findings);

  if (computedBlocking !== blockingCount) {
    throw new Error(
      `blocking_findings_count (${blockingCount}) does not match number of blocking findings (${computedBlocking})`
    );
  }

  if (decision === "pass" && computedBlocking > 0) {
    throw new Error(
      "decision \"pass\" is not allowed when review.json includes blocking findings"
    );
  }

  if (
    decision === "pass" &&
    requirementChecks.some((check) =>
      ["partially_satisfied", "not_satisfied"].includes(
        sanitizeReviewDecision(check.status)
      )
    )
  ) {
    throw new Error(
      "decision \"pass\" is not allowed when review.json includes unmet requirement_checks"
    );
  }

  return {
    methodology,
    decision,
    summary,
    blocking_findings_count: blockingCount,
    requirement_checks: requirementChecks,
    findings
  };
}

function normalizeMarkdown(markdown) {
  return normalizeNewlines(`${markdown || ""}`).trim();
}

function findTraceabilityHeadingIndex(lines) {
  return lines.findIndex((line) =>
    TRACEABILITY_HEADING_TOKENS.some((token) => line.trimStart().startsWith(token))
  );
}

function findTrailingContentIndex(lines, startIndex) {
  let index = startIndex;

  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  while (index < lines.length) {
    if (lines[index].trim() !== "<details>") {
      return index;
    }

    index += 1;

    while (index < lines.length && lines[index].trim() !== "</details>") {
      index += 1;
    }

    if (index >= lines.length) {
      return lines.length;
    }

    index += 1;

    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
  }

  return lines.length;
}

export function normalizeReviewMarkdownTraceability(reviewMarkdown, requirementChecks) {
  const normalizedReviewMarkdown = normalizeMarkdown(reviewMarkdown);
  const canonicalTraceability = normalizeMarkdown(
    renderCanonicalTraceabilityMarkdown(requirementChecks)
  );
  const lines = normalizedReviewMarkdown.split("\n");
  const traceabilityIndex = findTraceabilityHeadingIndex(lines);

  if (traceabilityIndex === -1) {
    return normalizedReviewMarkdown
      ? `${normalizedReviewMarkdown}\n\n${canonicalTraceability}`
      : canonicalTraceability;
  }

  const trailingContentIndex = findTrailingContentIndex(lines, traceabilityIndex + 1);
  const beforeTraceability = lines.slice(0, traceabilityIndex).join("\n").replace(/\s+$/u, "");
  const afterTraceability = lines.slice(trailingContentIndex).join("\n").replace(/^\s+/u, "");

  return [beforeTraceability, canonicalTraceability, afterTraceability]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function normalizeReviewArtifacts({ artifactsPath, requestedMethodology }) {
  if (!artifactsPath) {
    throw new Error("artifactsPath is required");
  }

  const methodology = resolveReviewMethodology({ requested: requestedMethodology });
  const reviewJsonPath = path.join(artifactsPath, REVIEW_JSON_NAME);
  const reviewMarkdownPath = path.join(artifactsPath, REVIEW_MD_NAME);
  const reviewMarkdown = readMarkdown(reviewMarkdownPath);
  const parsed = parseJsonFile(reviewJsonPath);
  const review = validateReviewPayload(parsed, methodology.name);
  const normalizedReviewMarkdown = normalizeReviewMarkdownTraceability(
    reviewMarkdown,
    review.requirement_checks
  );

  if (normalizeMarkdown(reviewMarkdown) !== normalizedReviewMarkdown) {
    fs.writeFileSync(reviewMarkdownPath, `${normalizedReviewMarkdown}\n`);
  }

  return {
    review,
    reviewMarkdown: normalizedReviewMarkdown,
    methodology
  };
}

function validateReviewMarkdown(reviewMarkdown, review) {
  const canonicalTraceability = normalizeMarkdown(
    renderCanonicalTraceabilityMarkdown(review.requirement_checks)
  );
  const normalizedReviewMarkdown = normalizeMarkdown(reviewMarkdown);

  if (!normalizedReviewMarkdown.includes(canonicalTraceability)) {
    throw new Error(
      "review.md must include the canonical Traceability section derived from review.json"
    );
  }
}

export function loadValidatedReviewArtifacts({
  artifactsPath,
  requestedMethodology
}) {
  const { review, reviewMarkdown, methodology } = normalizeReviewArtifacts({
    artifactsPath,
    requestedMethodology
  });

  validateReviewMarkdown(reviewMarkdown, review);

  return {
    review,
    reviewMarkdown,
    methodology
  };
}

export function validateReviewArtifacts({
  artifactsPath,
  requestedMethodology
}) {
  const { review, reviewMarkdown, methodology } = loadValidatedReviewArtifacts({
    artifactsPath,
    requestedMethodology
  });

  return {
    review,
    reviewMarkdown,
    methodology
  };
}
