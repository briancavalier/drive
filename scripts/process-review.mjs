import path from "node:path";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import {
  commentOnIssue,
  submitPullRequestReview
} from "./lib/github.mjs";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import {
  buildReviewConversationBody,
  MAX_REVIEW_BODY_CHARS
} from "./lib/github-messages.mjs";
import { loadValidatedReviewArtifacts } from "./lib/review-artifacts.mjs";

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

async function clearPendingReviewSha({
  execFileAsync,
  env,
  ciStatus
}) {
  try {
    await runApplyPrState(execFileAsync, env, {
      FACTORY_PENDING_REVIEW_SHA: "",
      FACTORY_CI_STATUS: `${ciStatus || env.FACTORY_CI_STATUS || ""}`.trim() || "pending",
      FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID: env.FACTORY_CI_RUN_ID || ""
    });
  } catch (error) {
    console.warn(`Failed to clear pending review SHA: ${error.message}`);
  }
}

async function handlePass({
  review,
  artifactsPath,
  reviewMarkdown,
  prNumber,
  env,
  execFileAsync,
  githubClient
}) {
  let currentHead = "";

  try {
    currentHead = gitRevParse("HEAD");
  } catch (error) {
    currentHead = `${env.FACTORY_LAST_READY_SHA || ""}`.trim();
  }

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
    FACTORY_CLEAR_IMPLEMENT_LABEL: "false",
    FACTORY_PENDING_REVIEW_SHA: ""
  });

  const comment = buildReviewConversationBody({
    reviewMarkdown,
    artifactsPath,
    decision: review.decision,
    maxBodyChars: MAX_REVIEW_BODY_CHARS
  });
  await githubClient.commentOnIssue(prNumber, comment);
}

async function handleRequestChanges({
  review,
  reviewMarkdown,
  artifactsPath,
  prNumber,
  githubClient
}) {
  const body = buildReviewConversationBody({
    reviewMarkdown,
    artifactsPath,
    decision: review.decision,
    maxBodyChars: MAX_REVIEW_BODY_CHARS
  });

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

  let review;
  let reviewMarkdown;
  try {
    ({ review, reviewMarkdown } = loadValidatedReviewArtifacts({
      artifactsPath,
      requestedMethodology: requestedMethod
    }));

    console.log(
      `Processing autonomous review for PR #${prNumber} on branch ${branch} (methodology: ${review.methodology}, decision: ${review.decision})`
    );

    if (review.decision === "pass") {
      await handlePass({
        review,
        artifactsPath,
        reviewMarkdown,
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
    await clearPendingReviewSha({
      execFileAsync,
      env
    });
    console.log(
      "Autonomous review requested changes. Submitted REQUEST_CHANGES review to trigger repair."
    );
  } catch (error) {
    await clearPendingReviewSha({
      execFileAsync,
      env
    });
    throw error;
  }
}

export async function main(options = {}) {
  try {
    await processReview(options);
    setOutputs({
      failure_message: ""
    });
  } catch (error) {
    setOutputs({
      failure_message: `${error.message || ""}`.trim()
    });
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
