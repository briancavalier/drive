import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import { FACTORY_LABELS, FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import { getPullRequest } from "./lib/github.mjs";
import {
  renderInterventionResolutionComment
} from "./lib/github-messages.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import {
  getOpenQuestionIntervention,
  getQuestionOption
} from "./lib/intervention-state.mjs";

function hasLabel(labels = [], labelName) {
  return labels.some((label) => label.name === labelName);
}

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function resolveStatusFromAction(action) {
  const normalized = `${action || ""}`.trim();

  if (normalized === "implement") {
    return FACTORY_PR_STATUSES.implementing;
  }

  if (normalized === "repair") {
    return FACTORY_PR_STATUSES.repairing;
  }

  if (normalized === "review") {
    return FACTORY_PR_STATUSES.reviewing;
  }

  return FACTORY_PR_STATUSES.blocked;
}

function buildPendingStageDecision({ intervention, option, actor }) {
  if (
    `${intervention?.payload?.questionKind || ""}`.trim() !== "ambiguity" ||
    `${option?.effect || ""}`.trim() !== "resume_current_stage" ||
    !`${option?.instruction || ""}`.trim()
  ) {
    return null;
  }

  return {
    sourceInterventionId: intervention.id,
    kind: "ambiguity",
    selectedOptionId: option.id,
    selectedOptionLabel: option.label,
    instruction: option.instruction,
    answeredBy: `${actor || ""}`.trim() || null,
    answeredAt: new Date().toISOString()
  };
}

function buildBudgetOverride({ intervention, option, actor }) {
  if (
    `${intervention?.payload?.questionKind || ""}`.trim() !== "budget_guardrail" ||
    `${option?.effect || ""}`.trim() !== "resume_current_stage"
  ) {
    return null;
  }

  return {
    sourceInterventionId: intervention.id,
    kind: "question_required",
    approvedBy: `${actor || ""}`.trim() || null,
    approvedAt: new Date().toISOString()
  };
}

export async function main(env = process.env, dependencies = {}) {
  const execFileAsync = dependencies.execFileAsync || promisify(execFile);
  const prNumber = requiredEnv("FACTORY_PR_NUMBER", env);
  const interventionId = requiredEnv("FACTORY_INTERVENTION_ID", env);
  const optionId = requiredEnv("FACTORY_OPTION_ID", env);
  const requestedResumeAction = `${env.FACTORY_RESUME_ACTION || ""}`.trim();
  const pullRequest = await (dependencies.getPullRequest || getPullRequest)(Number(prNumber));
  const metadata = extractPrMetadata(pullRequest.body) || {};
  const intervention = getOpenQuestionIntervention(metadata);

  if (!intervention || intervention.id !== interventionId) {
    throw new Error(`Open intervention ${interventionId} not found on PR #${prNumber}`);
  }

  const option = getQuestionOption(intervention, optionId);

  if (!option) {
    throw new Error(`Option ${optionId} is not valid for intervention ${interventionId}`);
  }

  const answerNote = `${env.FACTORY_ANSWER_NOTE || ""}`.trim();
  const resumeAction = option.effect === "resume_current_stage"
    ? requestedResumeAction || `${metadata.blockedAction || ""}`.trim()
    : "";
  const shouldApplySelfModifyLabel =
    optionId === "approve_once" &&
    intervention.payload?.applySelfModifyLabelOnApproval === true;
  const hasSelfModifyLabel = hasLabel(pullRequest.labels || [], FACTORY_LABELS.selfModify);
  const resolutionComment = renderInterventionResolutionComment({
    interventionId,
    optionId,
    resumeAction,
    remainsBlocked: !resumeAction
  });
  const pauseReason =
    optionId === "human_takeover"
      ? `Human takeover requested via /factory answer for ${interventionId}.`
      : optionId === "deny"
        ? `Approval denied via /factory answer for ${interventionId}.`
        : "";
  const childEnv = {
    ...env,
    FACTORY_PR_NUMBER: prNumber,
    FACTORY_INTERVENTION: "__CLEAR__",
    FACTORY_PENDING_STAGE_DECISION: "__UNCHANGED__",
    FACTORY_BUDGET_OVERRIDE: "__UNCHANGED__",
    FACTORY_COMMENT: answerNote
      ? `${resolutionComment}\n\nOperator note:\n${answerNote}`
      : resolutionComment,
    FACTORY_LAST_RUN_ID: `${env.GITHUB_RUN_ID || ""}`.trim(),
    FACTORY_LAST_RUN_URL:
      `${env.GITHUB_SERVER_URL || ""}`.trim() && `${env.GITHUB_REPOSITORY || ""}`.trim()
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : ""
  };

  if (shouldApplySelfModifyLabel && !hasSelfModifyLabel) {
    childEnv.FACTORY_SELF_MODIFY_LABEL_ACTION = "add";
    childEnv.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL = "true";
  } else {
    childEnv.FACTORY_SELF_MODIFY_LABEL_ACTION = "__UNCHANGED__";
    childEnv.FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL = "__UNCHANGED__";
  }

  if (resumeAction) {
    const pendingStageDecision = buildPendingStageDecision({
      intervention,
      option,
      actor: env.GITHUB_ACTOR
    });

    if (pendingStageDecision) {
      childEnv.FACTORY_PENDING_STAGE_DECISION = JSON.stringify(pendingStageDecision);
    }

    const budgetOverride = buildBudgetOverride({
      intervention,
      option,
      actor: env.GITHUB_ACTOR
    });

    childEnv.FACTORY_BUDGET_OVERRIDE = budgetOverride
      ? JSON.stringify(budgetOverride)
      : "__CLEAR__";

    childEnv.FACTORY_STATUS = resolveStatusFromAction(resumeAction);
    childEnv.FACTORY_BLOCKED_ACTION = "";
    childEnv.FACTORY_PAUSED = "false";
    childEnv.FACTORY_PAUSE_REASON = "";
  } else {
    childEnv.FACTORY_STATUS = FACTORY_PR_STATUSES.blocked;
    childEnv.FACTORY_BLOCKED_ACTION = "";
    childEnv.FACTORY_PAUSED = "true";
    childEnv.FACTORY_PAUSE_REASON = pauseReason;
    childEnv.FACTORY_BUDGET_OVERRIDE = "__CLEAR__";
  }

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: childEnv,
    stdio: "inherit"
  });

  setOutputs({
    resume_action: resumeAction
  });
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
