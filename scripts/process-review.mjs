import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  commentOnIssue,
  submitPullRequestReview
} from "./lib/github.mjs";
import {
  countBlockingFindings,
  resolveReviewMethodology,
  sanitizeReviewDecision
} from "./lib/review-methods.mjs";

const REVIEW_JSON_NAME = "review.json";
const REVIEW_MD_NAME = "review.md";
const MAX_REVIEW_BODY_CHARS = 60000;

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

  findings.forEach((finding, index) => {
    if (typeof finding !== "object" || finding === null) {
      throw new Error(`finding at index ${index} must be an object`);
    }

    const level = sanitizeReviewDecision(ensureString(finding.level, `findings[${index}].level`));

    if (level !== "blocking" && level !== "non_blocking") {
      throw new Error(
        `findings[${index}].level must be "blocking" or "non_blocking", received "${finding.level}"`
      );
    }

    ensureString(finding.title, `findings[${index}].title`);
    ensureString(finding.details, `findings[${index}].details`);
    ensureString(finding.scope, `findings[${index}].scope`);
    ensureString(finding.recommendation, `findings[${index}].recommendation`);
  });

  return findings;
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
  const findings = validateFindings(payload.findings);
  const computedBlocking = countBlockingFindings(findings);

  if (computedBlocking !== blockingCount) {
    throw new Error(
      `blocking_findings_count (${blockingCount}) does not match number of blocking findings (${computedBlocking})`
    );
  }

  return {
    methodology,
    decision,
    summary,
    blocking_findings_count: blockingCount,
    findings
  };
}

function buildPassComment(review, artifactsPath) {
  const lines = [
    `Autonomous review completed with decision **PASS** (methodology: ${review.methodology}).`,
    "",
    `Summary: ${review.summary}`,
    "",
    review.blocking_findings_count > 0
      ? `Blocking findings recorded: ${review.blocking_findings_count}. See \`${path.join(artifactsPath, REVIEW_MD_NAME)}\` for details.`
      : "No blocking findings recorded.",
    "",
    `Artifacts: \`${path.join(artifactsPath, REVIEW_MD_NAME)}\``
  ];

  return lines.join("\n").trim();
}

function buildRequestChangesBody(reviewMarkdown, review, artifactsPath) {
  const header = [
    `Autonomous review decision: REQUEST_CHANGES (methodology: ${review.methodology})`,
    "",
    `Summary: ${review.summary}`,
    "",
    "---",
    ""
  ].join("\n");

  let body = `${header}${reviewMarkdown.trim()}\n`;

  if (body.length <= MAX_REVIEW_BODY_CHARS) {
    return body;
  }

  const truncated = `${body.slice(0, MAX_REVIEW_BODY_CHARS)}\n\n*(Review truncated. See \`${path.join(
    artifactsPath,
    REVIEW_MD_NAME
  )}\` for the full report.)*`;

  return truncated;
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
  githubClient
}) {
  await runApplyPrState(execFileAsync, env, {
    FACTORY_STATUS: "ready_for_review",
    FACTORY_CI_STATUS: "success",
    FACTORY_READY_FOR_REVIEW: "true",
    FACTORY_REMOVE_LABELS: "factory:blocked",
    FACTORY_COMMENT: "",
    FACTORY_CLEAR_IMPLEMENT_LABEL: "false"
  });

  const comment = buildPassComment(review, artifactsPath);
  await githubClient.commentOnIssue(prNumber, comment);
}

async function handleRequestChanges({
  review,
  reviewMarkdown,
  artifactsPath,
  prNumber,
  githubClient
}) {
  const body = buildRequestChangesBody(reviewMarkdown, review, artifactsPath);

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
  execFileImpl = execFile
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
      githubClient
    });
    console.log("Autonomous review passed. PR marked ready for human review.");
    return;
  }

  await handleRequestChanges({
    review,
    reviewMarkdown,
    artifactsPath,
    prNumber,
    githubClient
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
