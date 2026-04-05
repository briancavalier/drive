import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FACTORY_PR_STATUSES } from "./lib/factory-config.mjs";
import { readFailureAdvisory } from "./lib/failure-diagnosis.mjs";
import { buildFailureComment } from "./lib/failure-comment.mjs";
import {
  buildApprovalIntervention,
  buildFailureIntervention,
  buildQuestionIntervention
} from "./lib/intervention-state.mjs";
import { buildRepairExhaustionQuestion } from "./lib/repair-interventions.mjs";
import { renderInterventionQuestionComment } from "./lib/github-messages.mjs";
import {
  FAILURE_TYPES,
  parseRetryLimit
} from "./lib/failure-classification.mjs";
import {
  buildFailureSignature,
  buildFollowupCommentSection,
  buildFollowupIssue,
  classifyFollowup,
  findOpenFollowup
} from "./lib/failure-followup.mjs";
import { createIssue, searchIssues } from "./lib/github.mjs";

export { buildFailureComment } from "./lib/failure-comment.mjs";
export { buildFailureIntervention } from "./lib/intervention-state.mjs";

const STAGE_NOOP_ATTEMPT_LIMIT = 2;

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function normalizeCounter(value) {
  const normalized = `${value ?? ""}`.trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildStageRetrySection({ action, attempts }) {
  if (attempts <= 0) {
    return "";
  }

  const cappedAttempts = Math.min(attempts, STAGE_NOOP_ATTEMPT_LIMIT);
  const nextAction =
    action === "repair"
      ? "repair run"
      : action === "review"
        ? "review run"
        : "implement run";

  if (attempts >= STAGE_NOOP_ATTEMPT_LIMIT) {
    return [
      "## Stage retry status",
      `- Consecutive no-op attempts: ${cappedAttempts}/${STAGE_NOOP_ATTEMPT_LIMIT}`,
      "- Automated retries are now blocked; investigate the branch before re-applying the factory stage label."
    ].join("\n");
  }

  const remaining = STAGE_NOOP_ATTEMPT_LIMIT - attempts;
  const remainingText = remaining === 1 ? "last auto-retry" : `${remaining} automated retries remaining`;

  return [
    "## Stage retry status",
    `- Consecutive no-op attempts: ${cappedAttempts}/${STAGE_NOOP_ATTEMPT_LIMIT}`,
    `- Factory will treat the next ${nextAction} as the ${remainingText}.`
  ].join("\n");
}

export function buildStateUpdate(action, failureType, { stageNoopAttempts = 0 } = {}) {
  if (failureType === FAILURE_TYPES.stageNoop && stageNoopAttempts >= STAGE_NOOP_ATTEMPT_LIMIT) {
    return {
      status: FACTORY_PR_STATUSES.blocked,
      addLabels: "factory:blocked",
      removeLabels: "factory:implement"
    };
  }

  if (
    action === "implement" &&
    (failureType === FAILURE_TYPES.contentOrLogic || failureType === FAILURE_TYPES.stageNoop)
  ) {
    return {
      status: FACTORY_PR_STATUSES.planReady,
      addLabels: "factory:plan-ready",
      removeLabels: "factory:implement,factory:blocked"
    };
  }

  return {
    status: FACTORY_PR_STATUSES.blocked,
    addLabels: "factory:blocked",
    removeLabels: "factory:implement"
  };
}

function buildReviewArtifactFailure(failureType, phase, failureMessage) {
  if (failureType !== FAILURE_TYPES.reviewArtifactContract) {
    return null;
  }

  return {
    type: failureType,
    phase,
    message: failureMessage || "",
    capturedAt: new Date().toISOString()
  };
}

function isSelfModifyGuardFailure(failureType, failureMessage) {
  const normalized = `${failureMessage || ""}`.toLowerCase();

  return (
    failureType === FAILURE_TYPES.stageSetup &&
    normalized.includes("factory:self-modify")
  );
}

function isBudgetGuardrailQuestionRequired(failureType, env = process.env) {
  return (
    failureType === FAILURE_TYPES.budgetGuardrail &&
    `${env.FACTORY_BUDGET_DECISION_DETAIL || ""}`.trim() === "question_required"
  );
}

export async function main(env = process.env, dependencies = {}) {
  const execFileAsync =
    dependencies.execFileAsync || promisify(execFile);
  const action = requiredEnv("FACTORY_FAILED_ACTION", env);
  const phase = `${env.FACTORY_FAILURE_PHASE || "stage"}`.trim() || "stage";
  const failureType = env.FACTORY_FAILURE_TYPE || FAILURE_TYPES.contentOrLogic;
  const prNumber = requiredEnv("FACTORY_PR_NUMBER", env);
  const retryAttempts = parseRetryLimit(env.FACTORY_TRANSIENT_RETRY_ATTEMPTS, 0);
  const stageNoopAttemptsBase = normalizeCounter(env.FACTORY_STAGE_NOOP_ATTEMPTS);
  const stageSetupAttemptsBase = normalizeCounter(env.FACTORY_STAGE_SETUP_ATTEMPTS);
  const repeatedFailureCountBase = normalizeCounter(
    env.FACTORY_INTERVENTION_REPEATED_FAILURE_COUNT
  );
  const repairAttemptsReported = Number(env.FACTORY_REPAIR_ATTEMPTS || 0);
  const maxRepairAttemptsConfigured = normalizeCounter(env.FACTORY_MAX_REPAIR_ATTEMPTS);
  const repairExhaustionReason = `${env.FACTORY_REPAIR_EXHAUSTION_REASON || ""}`.trim();
  const previousFailureSignature =
    `${env.FACTORY_INTERVENTION_FAILURE_SIGNATURE || ""}`
      .trim() || null;
  const computedStageNoopAttempts =
    failureType === FAILURE_TYPES.stageNoop ? stageNoopAttemptsBase + 1 : stageNoopAttemptsBase;
  const nextStageNoopAttempts = Math.min(computedStageNoopAttempts, STAGE_NOOP_ATTEMPT_LIMIT);
  const computedStageSetupAttempts =
    failureType === FAILURE_TYPES.stageSetup ? stageSetupAttemptsBase + 1 : stageSetupAttemptsBase;
  const nextStageSetupAttempts = computedStageSetupAttempts;
  const { status, addLabels, removeLabels } = buildStateUpdate(action, failureType, {
    stageNoopAttempts: computedStageNoopAttempts
  });
  const failureMessage = `${env.FACTORY_FAILURE_MESSAGE || ""}`.trim();
  const repositoryUrl =
    env.FACTORY_REPOSITORY_URL ||
    (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
      : "");
  const runUrl = env.FACTORY_RUN_URL || "";
  const branch = env.FACTORY_BRANCH || "";
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH || "";
  const ciRunId = env.FACTORY_CI_RUN_ID || "";
  const runId = `${env.GITHUB_RUN_ID || ""}`.trim();
  const explicitRunUrl = `${env.FACTORY_RUN_URL || ""}`.trim();
  const inferredRunUrl =
    runId && env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`
      : "";
  const resolvedRunUrl = explicitRunUrl || inferredRunUrl;
  const reviewArtifactFailure = buildReviewArtifactFailure(failureType, phase, failureMessage);
  const selfModifyGuardFailure = isSelfModifyGuardFailure(
    failureType,
    failureMessage
  );
  const budgetGuardrailQuestionRequired = isBudgetGuardrailQuestionRequired(failureType, env);
  const shouldClearBudgetOverride =
    `${env.FACTORY_BUDGET_OVERRIDE_CONSUMED || ""}`.trim() === "true";
  const repairStateSnapshot = {
    repairAttempts: repairAttemptsReported,
    maxRepairAttempts: maxRepairAttemptsConfigured,
    repeatedFailureCount: repeatedFailureCountBase,
    lastFailureSignature: previousFailureSignature,
    exhaustedBy: repairExhaustionReason || null
  };
  const shouldBuildRepairExhaustionQuestion =
    action === "repair" &&
    status === FACTORY_PR_STATUSES.blocked &&
    Boolean(repairStateSnapshot.exhaustedBy);
  const advisory = readFailureAdvisory(env.FACTORY_FAILURE_ADVISORY_PATH, {
    logger: console
  });
  const comment = buildFailureComment({
    action,
    phase,
    failureType,
    retryAttempts,
    failureMessage,
    runUrl,
    branch,
    repositoryUrl,
    artifactsPath,
    ciRunId,
    advisory
  });
  let augmentedComment = comment;
  const githubClient = {
    createIssue,
    searchIssues,
    ...(dependencies.githubClient || {})
  };
  const followup = {
    classifyFollowup,
    buildFailureSignature,
    buildFollowupIssue,
    findOpenFollowup,
    buildFollowupCommentSection,
    ...(dependencies.followup || {})
  };

  if (!selfModifyGuardFailure && !budgetGuardrailQuestionRequired && !shouldBuildRepairExhaustionQuestion) {
    try {
    const followupAssessment = followup.classifyFollowup({
      failureType,
      phase,
      action,
      failureMessage,
      advisory
    });

    if (followupAssessment.actionable) {
      const signature = followup.buildFailureSignature({
        category: followupAssessment.category,
        failureType,
        phase,
        failureMessage,
        advisory
      });
      const existingIssue = await followup.findOpenFollowup({
        signature,
        searchIssues: githubClient.searchIssues
      });

      if (existingIssue) {
        augmentedComment = `${comment}\n\n${followup.buildFollowupCommentSection({
          issueNumber: existingIssue.number,
          signature,
          created: false
        })}`;
        console.info(
          `Follow-up already tracked in issue #${existingIssue.number} for signature ${signature}.`
        );
      } else {
        const issuePayload = followup.buildFollowupIssue({
          prNumber,
          runUrl,
          branch,
          artifactsPath,
          failureType,
          failureMessage,
          advisory,
          category: followupAssessment.category,
          signature,
          ciRunId,
          repositoryUrl
        });
        const issue = await githubClient.createIssue({
          title: issuePayload.title,
          body: issuePayload.body
        });
        const issueNumber = issue?.number;

        if (issueNumber) {
          augmentedComment = `${comment}\n\n${followup.buildFollowupCommentSection({
            issueNumber,
            signature,
            created: true
          })}`;
          console.info(
            `Created follow-up issue #${issueNumber} for signature ${signature}.`
          );
        } else {
          console.warn("GitHub createIssue response missing issue number; skipping follow-up note.");
        }
      }
    } else {
      console.info(
        `Follow-up skipped: ${followupAssessment.reason || "no_actionable_indicators"}.`
      );
    }
    } catch (error) {
      console.warn(
        `Follow-up creation failed: ${error?.message || error}. Continuing without follow-up issue.`
      );
    }
  }

  if (failureType === FAILURE_TYPES.stageNoop) {
    const retrySection = buildStageRetrySection({
      action,
      attempts: computedStageNoopAttempts
    });

    if (retrySection) {
      augmentedComment = `${augmentedComment}\n\n${retrySection}`;
    }
  }

  const childEnv = {
    ...env,
    FACTORY_PR_NUMBER: prNumber,
    FACTORY_STATUS: status,
    FACTORY_ADD_LABELS: addLabels,
    FACTORY_REMOVE_LABELS: removeLabels,
    FACTORY_BLOCKED_ACTION: status === FACTORY_PR_STATUSES.blocked ? action : "",
    FACTORY_COMMENT: augmentedComment,
    FACTORY_BUDGET_OVERRIDE: shouldClearBudgetOverride ? "__CLEAR__" : "__UNCHANGED__",
    FACTORY_CI_STATUS: env.FACTORY_CI_STATUS || "pending"
  };

  if (env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID !== undefined) {
    childEnv.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID =
      env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID;
  }

  if (runId) {
    childEnv.FACTORY_LAST_RUN_ID = runId;
  }

  if (resolvedRunUrl) {
    childEnv.FACTORY_LAST_RUN_URL = resolvedRunUrl;
  }

  if (selfModifyGuardFailure) {
    const intervention = buildApprovalIntervention({
      action,
      summary: "Need approval to continue with protected control-plane changes",
      detail: failureMessage,
      question:
        "Should the factory authorize self-modify for the next resumed stage and continue?",
      recommendedOptionId: "approve_once",
      options: [
        {
          id: "approve_once",
          label: "Approve once and authorize the next resumed stage",
          effect: "resume_current_stage"
        },
        {
          id: "deny",
          label: "Do not approve",
          effect: "remain_blocked"
        },
        {
          id: "human_takeover",
          label: "Hand off to human-only handling",
          effect: "manual_only"
        }
      ],
      runId,
      runUrl: resolvedRunUrl,
      applySelfModifyLabelOnApproval: true,
      resumeContext: {
        ciRunId: ciRunId || null,
        reviewId: `${env.FACTORY_REVIEW_ID || ""}`.trim() || null,
        repairAttempts: repairAttemptsReported,
        repeatedFailureCount: repeatedFailureCountBase,
        failureSignature: previousFailureSignature,
        stageNoopAttempts: computedStageNoopAttempts,
        stageSetupAttempts: computedStageSetupAttempts
      }
    });
    childEnv.FACTORY_INTERVENTION = JSON.stringify(intervention);
    childEnv.FACTORY_COMMENT = renderInterventionQuestionComment({ intervention });
  } else if (shouldBuildRepairExhaustionQuestion) {
    const intervention = buildRepairExhaustionQuestion({
      action,
      repairState: repairStateSnapshot,
      failureDetail: augmentedComment,
      resumeContext: {
        ciRunId: ciRunId || null,
        reviewId: `${env.FACTORY_REVIEW_ID || ""}`.trim() || null,
        repairAttempts: repairAttemptsReported,
        repeatedFailureCount: repeatedFailureCountBase,
        failureSignature: previousFailureSignature,
        stageNoopAttempts: computedStageNoopAttempts,
        stageSetupAttempts: computedStageSetupAttempts
      },
      runInfo: {
        runId: runId || null,
        runUrl: resolvedRunUrl || null
      }
    });
    childEnv.FACTORY_INTERVENTION = JSON.stringify(intervention);
    childEnv.FACTORY_COMMENT = renderInterventionQuestionComment({ intervention });
  } else if (budgetGuardrailQuestionRequired) {
    const intervention = buildQuestionIntervention({
      action,
      questionKind: "budget_guardrail",
      summary: "Implement prompt was truncated for a broad control-plane change",
      detail: failureMessage,
      question:
        "Should the factory continue once with the truncated implement prompt for this broad control-plane change?",
      recommendedOptionId: "approve_once",
      options: [
        {
          id: "approve_once",
          label: "Continue once with the truncated prompt",
          effect: "resume_current_stage",
          instruction:
            "Proceed with the current implement stage despite prompt truncation and omission, keeping the existing approved plan in scope."
        },
        {
          id: "deny",
          label: "Keep blocked",
          effect: "remain_blocked"
        },
        {
          id: "human_takeover",
          label: "Hand off to human-only handling",
          effect: "manual_only"
        }
      ],
      runId,
      runUrl: resolvedRunUrl,
      resumeContext: {
        ciRunId: ciRunId || null,
        reviewId: `${env.FACTORY_REVIEW_ID || ""}`.trim() || null,
        repairAttempts: repairAttemptsReported,
        repeatedFailureCount: repeatedFailureCountBase,
        failureSignature: previousFailureSignature,
        stageNoopAttempts: computedStageNoopAttempts,
        stageSetupAttempts: computedStageSetupAttempts
      }
    });
    childEnv.FACTORY_INTERVENTION = JSON.stringify(intervention);
    childEnv.FACTORY_COMMENT = renderInterventionQuestionComment({ intervention });
  } else {
    childEnv.FACTORY_INTERVENTION = JSON.stringify(
      buildFailureIntervention({
        action,
        phase,
        failureType,
        failureMessage,
        retryAttempts,
        repeatedFailureCount: repeatedFailureCountBase,
        stageNoopAttempts: computedStageNoopAttempts,
        stageSetupAttempts: computedStageSetupAttempts,
        transientRetryAttempts: retryAttempts,
        failureSignature: previousFailureSignature,
        runId,
        runUrl: resolvedRunUrl,
        reviewArtifactFailure,
        blocking: status === FACTORY_PR_STATUSES.blocked
      })
    );
  }

  await execFileAsync(process.execPath, ["scripts/apply-pr-state.mjs"], {
    env: {
      ...childEnv,
      FACTORY_PENDING_STAGE_DECISION:
        env.FACTORY_PENDING_STAGE_DECISION || "__UNCHANGED__",
      FACTORY_SELF_MODIFY_LABEL_ACTION: "remove_if_auto_applied",
      FACTORY_AUTO_APPLIED_SELF_MODIFY_LABEL: "false"
    },
    stdio: "inherit"
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
