import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getPullRequest as defaultGetPullRequest } from "./lib/github.mjs";
import { renderInterventionQuestionComment } from "./lib/github-messages.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import {
  buildQuestionIntervention,
  getFailureCounter,
  getFailureSignature
} from "./lib/intervention-state.mjs";

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export async function handleStageInterventionRequest({
  env = process.env,
  dependencies = {}
} = {}) {
  const execFileAsync = dependencies.execFileAsync || promisify(execFile);
  const getPullRequest = dependencies.getPullRequest || defaultGetPullRequest;
  const prNumber = Number(requiredEnv("FACTORY_PR_NUMBER", env));
  const action = requiredEnv("FACTORY_STAGE_ACTION", env);
  const requestPayload = JSON.parse(requiredEnv("FACTORY_INTERVENTION_REQUEST", env));
  const pullRequest = await getPullRequest(prNumber);
  const metadata = extractPrMetadata(pullRequest?.body) || {};
  const runId = `${env.GITHUB_RUN_ID || ""}`.trim() || null;
  const runUrl =
    `${env.GITHUB_SERVER_URL || ""}`.trim() && `${env.GITHUB_REPOSITORY || ""}`.trim()
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;

  const intervention = buildQuestionIntervention({
    action,
    questionKind: "ambiguity",
    summary: requestPayload.summary,
    detail: requestPayload.detail,
    question: requestPayload.question,
    recommendedOptionId: requestPayload.recommendedOptionId,
    options: requestPayload.options,
    runId,
    runUrl,
    resumeContext: {
      ciRunId: `${metadata.lastProcessedWorkflowRunId || ""}`.trim() || null,
      repairAttempts: Number(metadata.repairAttempts || 0),
      repeatedFailureCount: getFailureCounter(metadata, "repeatedFailureCount"),
      failureSignature: getFailureSignature(metadata),
      stageNoopAttempts: getFailureCounter(metadata, "stageNoopAttempts"),
      stageSetupAttempts: getFailureCounter(metadata, "stageSetupAttempts")
    }
  });

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: {
      ...env,
      FACTORY_PR_NUMBER: String(prNumber),
      FACTORY_STATUS: "blocked",
      FACTORY_BLOCKED_ACTION: action,
      FACTORY_INTERVENTION: JSON.stringify(intervention),
      FACTORY_PENDING_STAGE_DECISION: "__CLEAR__",
      FACTORY_PAUSED: "false",
      FACTORY_PAUSE_REASON: "",
      FACTORY_LAST_RUN_ID: `${env.GITHUB_RUN_ID || ""}`.trim(),
      FACTORY_LAST_RUN_URL: runUrl || "",
      FACTORY_COMMENT: renderInterventionQuestionComment({ intervention }),
      FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
      FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false"
    },
    stdio: "inherit"
  });

  return intervention;
}

export async function main(env = process.env) {
  await handleStageInterventionRequest({ env });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
