import { buildQuestionIntervention } from "./intervention-state.mjs";

function toNumber(value, fallback = 0) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function trimOrNull(value) {
  const normalized = `${value ?? ""}`.trim();
  return normalized ? normalized : null;
}

function buildExhaustionSummary({ exhaustedBy, repairAttempts, maxRepairAttempts, repeatedFailureCount }) {
  if (exhaustedBy === "attempt_limit") {
    const allowed = maxRepairAttempts > 0 ? maxRepairAttempts : null;
    const completedAttempts = repairAttempts > 0 ? Math.max(repairAttempts - 1, 0) : 0;

    if (allowed) {
      return `Autonomous repair exhausted after ${Math.min(completedAttempts, allowed)}/${allowed} attempts.`;
    }

    return `Autonomous repair exhausted its retry budget after ${completedAttempts} attempt(s).`;
  }

  if (exhaustedBy === "repeated_failure") {
    const streak = repeatedFailureCount > 1 ? repeatedFailureCount : 2;
    return `Repeated repair failures (${streak} consecutive matches) require an operator decision.`;
  }

  return "Autonomous repair needs an operator decision before continuing.";
}

function buildResumeContext(repairState = {}, resumeContext = {}, runInfo = {}) {
  const repairAttempts = toNumber(
    resumeContext.repairAttempts ?? repairState.repairAttempts,
    repairState.repairAttempts || 0
  );
  const repeatedFailureCount = toNumber(
    resumeContext.repeatedFailureCount ?? repairState.repeatedFailureCount,
    repairState.repeatedFailureCount || 0
  );

  return {
    ciRunId: trimOrNull(resumeContext.ciRunId ?? runInfo.ciRunId),
    reviewId: trimOrNull(resumeContext.reviewId),
    repairAttempts,
    repeatedFailureCount,
    failureSignature: trimOrNull(
      resumeContext.failureSignature ?? repairState.lastFailureSignature
    ),
    stageNoopAttempts: toNumber(resumeContext.stageNoopAttempts, 0),
    stageSetupAttempts: toNumber(resumeContext.stageSetupAttempts, 0)
  };
}

export function buildRepairExhaustionQuestion({
  action = "repair",
  repairState = {},
  failureDetail = "",
  resumeContext = {},
  runInfo = {}
} = {}) {
  const exhaustedBy = `${repairState?.exhaustedBy || ""}`.trim() || null;
  const repairAttempts = toNumber(repairState?.repairAttempts, 0);
  const maxRepairAttempts = toNumber(repairState?.maxRepairAttempts, 0);
  const repeatedFailureCount = toNumber(repairState?.repeatedFailureCount, 0);
  const summary = buildExhaustionSummary({
    exhaustedBy,
    repairAttempts,
    maxRepairAttempts,
    repeatedFailureCount
  });
  const normalizedDetail = `${failureDetail || ""}`.trim();
  const questionPrompt = "The factory can’t repair this branch autonomously. What should happen next?";
  const options = [
    {
      id: "retry_repair",
      label: "Retry repair after adjustments",
      effect: "resume_current_stage",
      instruction:
        "Investigate the failure, adjust the branch or plan, then run `/factory repair` to try again."
    },
    {
      id: "reset_plan",
      label: "Reset to plan-ready",
      effect: "reset_to_plan_ready",
      instruction:
        "Return the PR to plan-ready, clear repair counters, and restart with `/factory implement` when ready."
    },
    {
      id: "human_takeover",
      label: "Pause for human takeover",
      effect: "manual_only",
      instruction:
        "Keep automation paused while a human resolves the issue or applies manual fixes."
    }
  ];

  return buildQuestionIntervention({
    action,
    questionKind: "repair_exhaustion",
    summary,
    detail: normalizedDetail,
    question: questionPrompt,
    recommendedOptionId: "retry_repair",
    options,
    runId: trimOrNull(runInfo.runId),
    runUrl: trimOrNull(runInfo.runUrl),
    resumeContext: buildResumeContext(repairState, resumeContext, runInfo)
  });
}
