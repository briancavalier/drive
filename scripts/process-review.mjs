import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  commentOnIssue,
  submitPullRequestReview
} from "./lib/github.mjs";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import {
  renderRequestChangesReviewBody,
  renderReviewPassComment
} from "./lib/github-messages.mjs";
import {
  countBlockingFindings,
  resolveReviewMethodology,
  sanitizeReviewDecision
} from "./lib/review-methods.mjs";
import { renderCanonicalTraceabilityMarkdown } from "./lib/review-output.mjs";

const REVIEW_JSON_NAME = "review.json";
const REVIEW_MD_NAME = "review.md";
const MAX_REVIEW_BODY_CHARS = 60000;

function gitRevParse(ref = "HEAD") {
  return execFileSync("git", ["rev-parse", ref], {
    encoding: "utf8"
  }).trim();
}

function requiredEnv(env, name) {
  const value = env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }

  return value;
}

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
  return `${markdown || ""}`.replaceAll("\r\n", "\n").trim();
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

async function runApplyPrState(execFileAsync, env, envOverrides) {
  const childEnv = {
    ...env,
    ...envOverrides
  };

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: childEnv,
    stdio: "inherit"
  });
}

async function handlePass({
  review,
  artifactsPath,
  prNumber,
  env,
  execFileAsync,
  githubClient,
  githubMessageOptions
}) {
  const currentHead = gitRevParse("HEAD");

  await runApplyPrState(execFileAsync, env, {
    FACTORY_STATUS: FACTORY_PR_STATUSES.readyForReview,
    FACTORY_CI_STATUS: "success",
    FACTORY_READY_FOR_REVIEW: "true",
    FACTORY_REMOVE_LABELS: "factory:blocked",
    FACTORY_LAST_READY_SHA: currentHead,
    FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID: env.FACTORY_CI_RUN_ID || "",
    FACTORY_LAST_FAILURE_TYPE: "",
    FACTORY_TRANSIENT_RETRY_ATTEMPTS: "0",
    FACTORY_LAST_REFRESHED_SHA: env.FACTORY_LAST_REFRESHED_SHA || "",
    FACTORY_COMMENT: "",
    FACTORY_CLEAR_IMPLEMENT_LABEL: "false"
  });

  const comment = renderReviewPassComment(
    {
      methodology: review.methodology,
      summary: review.summary,
      blockingFindingsCount: review.blocking_findings_count,
      artifactsPath
    },
    githubMessageOptions
  );
  await githubClient.commentOnIssue(prNumber, comment);
}

async function handleRequestChanges({
  review,
  reviewMarkdown,
  artifactsPath,
  prNumber,
  githubClient,
  githubMessageOptions
}) {
  const body = renderRequestChangesReviewBody(
    {
      methodology: review.methodology,
      summary: review.summary,
      findings: review.findings,
      requirementChecks: review.requirement_checks,
      reviewMarkdown,
      artifactsPath,
      maxBodyChars: MAX_REVIEW_BODY_CHARS
    },
    githubMessageOptions
  );

  await githubClient.submitPullRequestReview({
    prNumber,
    event: "REQUEST_CHANGES",
    body
  });
}

export async function processReview({
  env = process.env,
  githubClient = {
    commentOnIssue,
    submitPullRequestReview
  },
  execFileImpl = execFile,
  githubMessageOptions = {}
} = {}) {
  const execFileAsync = promisify(execFileImpl);
  const prNumber = Number(requiredEnv(env, "FACTORY_PR_NUMBER"));
  const issueNumber = Number(requiredEnv(env, "FACTORY_ISSUE_NUMBER"));
  const artifactsPath = requiredEnv(env, "FACTORY_ARTIFACTS_PATH");
  const branch = requiredEnv(env, "FACTORY_BRANCH");
  const requestedMethod = env.FACTORY_REVIEW_METHOD || "";

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("FACTORY_PR_NUMBER must be a positive integer");
  }

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("FACTORY_ISSUE_NUMBER must be a positive integer");
  }

  const methodology = resolveReviewMethodology({ requested: requestedMethod });
  const reviewJsonPath = path.join(artifactsPath, REVIEW_JSON_NAME);
  const reviewMarkdownPath = path.join(artifactsPath, REVIEW_MD_NAME);
  const reviewMarkdown = readMarkdown(reviewMarkdownPath);
  const parsed = parseJsonFile(reviewJsonPath);
  const review = validateReviewPayload(parsed, methodology.name);
  validateReviewMarkdown(reviewMarkdown, review);

  console.log(
    `Processing autonomous review for PR #${prNumber} on branch ${branch} (methodology: ${review.methodology}, decision: ${review.decision})`
  );

  if (review.decision === "pass") {
    await handlePass({
      review,
      artifactsPath,
      prNumber,
      env,
      execFileAsync,
      githubClient,
      githubMessageOptions
    });
    console.log("Autonomous review passed. PR marked ready for human review.");
    return;
  }

  await handleRequestChanges({
    review,
    reviewMarkdown,
    artifactsPath,
    prNumber,
    githubClient,
    githubMessageOptions
  });
  console.log("Autonomous review requested changes. Submitted REQUEST_CHANGES review to trigger repair.");
}

async function main() {
  try {
    await processReview();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
