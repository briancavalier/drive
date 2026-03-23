# Repair Exhaustion Decision Intervention (Run 109)

## Overview
- Give operators a structured decision when automated repair retries are exhausted instead of leaving the PR blocked on a generic failure.
- Reuse the existing question-based intervention channel so `/factory answer` continues to drive next steps.
- Ensure every resolution path updates PR metadata consistently so automation can either retry, roll back to plan-ready, or pause for human takeover.

## Current Behavior
- `nextRepairState` marks the repair run as `blocked` once either:
  - `metadata.repairAttempts` exceeds `metadata.maxRepairAttempts`, or
  - the same failure signature is seen three consecutive times (`repeatedFailureCount >= 2`).
- Blocked repair runs surface as a failure intervention (`type: "failure"`) built by `handle-stage-failure.mjs` and rendered into the PR as a failed repair comment.
- Operators only see a generic "repair retries exhausted" message and must infer whether to retry, reset, or pause; there is no `/factory answer` hook to capture intent.

## Proposed Behavior
- When `handle-stage-failure.mjs` processes a failed repair run and `nextRepairState(...).blocked` is true, emit a **question** intervention instead of a failure intervention.
  - Use a dedicated `questionKind: "repair_exhaustion"` so downstream handling can distinguish from ambiguity prompts.
  - Continue posting the generated question via `renderInterventionQuestionComment`.
- Keep failure interventions for other stages and for repair runs that have not hit the exhaustion threshold.
- Capture `repairAttempts`, `maxRepairAttempts`, `repeatedFailureCount`, the last failure signature, and recent CI/run metadata inside the question `resumeContext` so automation can resume with full context if the operator retries.

## Question Content
- Summary: "Automated repair retries are exhausted; choose the next step." (include attempt counts in detail text).
- Question prompt: "How should the factory proceed after repeated repair failures?"
- Options (all append-only IDs, stable across runs):
  1. `retry_repair` — label "Retry repair with a narrower scope";
     - `effect: "resume_current_stage"`
     - `instruction`: guidance to focus the next repair attempt (e.g., revert risky edits, apply targeted fix, or capture a precise scope before re-running).
  2. `reset_plan_ready` — label "Reset to plan-ready for a fresh implementation";
     - `effect: "reset_to_plan_ready"` (new effect handled by `apply-intervention-answer.mjs`).
  3. `human_takeover` — label "Hand off to human-only handling";
     - `effect: "manual_only"` (keeps PR blocked/paused as today).
- Detail block should surface:
  - Total attempts vs limit (e.g., `4/3 attempts used`).
  - Recent failure summary/signature if available.
  - A reminder that answering logs the decision in the PR.

## Metadata & State Updates
- Question creation:
  - `metadata.intervention` stores the open question; `metadata.blockedAction` remains `repair` so `/factory resume` still maps to repair if needed.
  - `metadata.repairAttempts` records the *current* attempt count at exhaustion (limit+1).
- Answer handling (`apply-intervention-answer.mjs`):
  - Support `questionKind: "repair_exhaustion"` alongside ambiguity/approval.
  - `retry_repair`
    - Clears the intervention, resumes the repair stage (`FACTORY_STATUS=repairing`, `FACTORY_BLOCKED_ACTION=""`).
    - Resets counters so automation can run again: set `FACTORY_REPAIR_ATTEMPTS=0` and clear the recorded failure signature/repeated counter in the pending decision payload.
    - Persist a `FACTORY_PENDING_STAGE_DECISION` entry with `kind: "repair_exhaustion"`, selected option metadata, and the operator note/instruction so the run history captures the human choice.
  - `reset_plan_ready`
    - Clears the intervention, transitions PR status to plan-ready, reapplies the `factory:plan-ready` label, removes `factory:implement`/`factory:blocked`, and resets `FACTORY_REPAIR_ATTEMPTS=0`.
    - Clears `FACTORY_BLOCKED_ACTION` and `FACTORY_PAUSED`.
  - `human_takeover`
    - Uses existing pause path (`FACTORY_STATUS=blocked`, `FACTORY_PAUSED=true`) with a pause reason identifying the intervention.
- Extend `renderInterventionResolutionComment` output (already used) to reflect the resume/reset action; no messaging changes required beyond new option effect hint.

## Supporting Changes
- Add a helper (e.g., `buildRepairExhaustionQuestion`) under `scripts/lib/repair-state.mjs` or a new module to encapsulate question creation so both CI and review-triggered repair exhaustion reuse the same message/options.
- Update `scripts/lib/event-router.mjs` paths that currently emit failure interventions for blocked repair runs (review changes requested & failing CI) to call the new helper and pass the resulting question through `route-pr-loop` outputs.
- Expand option effect hints in `github-messages.mjs` to describe the new `reset_to_plan_ready` effect (e.g., "Returns to plan-ready").
- Document the new `questionKind` and option effect in `detect-stage-intervention-request` validation if required.
- Ensure PR dashboard/control-panel messaging uses the question summary when present (already default behavior); add tests if necessary to prove the new summary appears.

## Assumptions & Open Questions
- Resetting to plan-ready zeroes `repairAttempts`; we assume no other component requires the historical exhausted count once the operator intentionally resets.
- The operator instruction for `retry_repair` will provide sufficient guidance without needing additional structured metadata.
- Existing CI and review pipelines can pass along the new question artifact without further workflow file changes; if not, implementation will align any workflow outputs.
- No additional approvals are required before resuming repair once the operator answers the question.
