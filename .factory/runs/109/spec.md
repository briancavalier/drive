# Specification: Repair Exhaustion Decision Interventions

## Summary
- Convert repair exhaustion (max attempts reached or repeated identical failures) from an automatic failure into a structured question intervention so operators can choose the next action.
- Offer bounded answers—retry the repair with guidance, reset the PR to plan-ready, or hand off to human-only handling—delivered through the existing `/factory answer` workflow.
- Ensure answering the question updates PR metadata, labels, and comments consistently while keeping all other failure handling paths unchanged.

## Functional Requirements
- When `nextRepairState` returns `blocked === true` for repair-related triggers (CI failure workflow runs, trusted changes-requested reviews, or review artifact repair preparation), emit a question intervention instead of a failure intervention. The intervention must:
  - Use `type: "question"` with `payload.questionKind: "repair_exhaustion"` and set `stage` to the triggering action (`"repair"` for CI/review routes, `"review"` for review artifact repair prep).
  - Provide a summary such as "Repair attempts exhausted; choose the next action." and a prompt asking how to proceed after repair exhaustion.
  - Populate `payload.resumeContext` with the latest metadata: `repairAttempts`, `maxRepairAttempts`, `repeatedFailureCount`, `failureSignature`, `stageNoopAttempts`, `stageSetupAttempts`, and whichever of `ciRunId` or `reviewId` applies.
  - Supply detail text that enumerates the recorded attempts, the configured limit when non-zero, and whether repeated failures were detected (include the last failure signature when available).
  - Set `recommendedOptionId` to `retry_narrower`.
  - Offer exactly three options:
    1. `retry_narrower` — label “Retry repair with narrower scope”, `effect: "resume_current_stage"`, plus an `instruction` telling the next repair run to focus on the latest failure evidence and avoid unrelated edits.
    2. `reset_plan_ready` — label “Reset to plan-ready for a fresh plan”, `effect: "reset_to_plan_ready"`, no instruction payload.
    3. `human_takeover` — label “Hand off to human-only handling”, `effect: "manual_only"`.
- Route outputs and PR updates must surface the rendered question:
  - `route-pr-loop.mjs` should continue emitting the serialized intervention (via the existing `failure_intervention` output) and additionally publish a comment string rendered with `renderInterventionQuestionComment` whenever the intervention is a question.
  - The `factory-pr-loop` workflow must pass that comment into `FACTORY_COMMENT`, falling back to the current “repair attempts exhausted” message only when no comment output is provided.
  - `FACTORY_BLOCKED_ACTION` should remain `"repair"` so automation knows which stage can resume when the operator selects a retry.
- Extend the review artifact repair path (`scripts/prepare-review-artifact-repair.mjs`) so that a blocked repair state returns the new question intervention (stage `"review"`), the same resume context, and marks outputs `blocked: "true"`. The downstream workflow step that blocks review processing must post the rendered question comment.
- Update answer handling logic:
  - `scripts/apply-intervention-answer.mjs` must recognize `questionKind: "repair_exhaustion"` when deciding whether to persist a `pendingStageDecision`.
  - Selecting `retry_narrower` should clear the intervention, resume the repair stage (`FACTORY_STATUS: repairing`), store a pending stage decision with `kind: "repair_exhaustion"` containing the provided instruction, clear `FACTORY_BLOCKED_ACTION`, and leave the PR unpaused.
  - Selecting `reset_plan_ready` should clear the intervention, set `FACTORY_STATUS: plan_ready`, clear `FACTORY_BLOCKED_ACTION`, set `FACTORY_PAUSED` to `false`, wipe `FACTORY_PAUSE_REASON`, clear `FACTORY_PENDING_STAGE_DECISION`, and append a resolution comment indicating the PR was reset to plan-ready.
  - Selecting `human_takeover` should clear the intervention, keep the PR blocked but paused with a pause reason noting the human takeover triggered by repair exhaustion.
  - Resolution comments must mention whether automation will resume repair, reset to plan-ready, or remain blocked, and still include the metadata footer.
- Update UX affordances to match the new paths:
  - Add a descriptive hint for `reset_to_plan_ready` in `describeOptionEffect` so GitHub comments display “Resets to plan-ready”.
  - Ensure the control panel surfaces the question summary when a repair exhaustion question is open; only fall back to the legacy “exhausted automatic retries” message when no question is present.
- Regression guard: non-exhausted failures, other failure types, and approval interventions must continue to follow their existing flows (failure interventions stay failure-shaped and approval questions remain unchanged).

## Non-Functional Requirements
- Preserve `metadata.intervention` as the single source of truth; never create multiple open interventions simultaneously.
- Generated question strings, detail text, and option payloads must be deterministic for stable unit tests.
- The workflow changes must be idempotent—rerunning the same job cannot duplicate comments or mutate counters when state has not changed.
- New option effects must remain internal to the factory; no additional schema migration is required outside the touched scripts and tests.

## Edge Cases & Data Handling
- When `maxRepairAttempts` is zero or undefined, omit the limit wording in the detail text while still triggering on repeated failure counts.
- If the last failure signature is missing, state that no signature was captured instead of attempting to render it.
- Resume context should only include `ciRunId` / `reviewId` when available; other fields remain non-null per existing normalization.
- Ensure questions only appear when `nextRepairState(...).blocked` is `true`; differing failure signatures must continue to reset `repeatedFailureCount` to zero.
- Option validation should continue to reject unknown option ids during `/factory answer` handling.

## Assumptions
- Operators can act on a single generic instruction for “retry with narrower scope” without additional dynamic context.
- Resetting to plan-ready through this question does not reset historical repair attempt counters; the metadata should persist the accumulated counts.
- It is acceptable for a PR to receive a new repair exhaustion question if it exhausts retries again after being resumed.

## Risks & Mitigations
- **Risk:** Misclassifying a failure as repair exhaustion could spam questions. **Mitigation:** Drive triggering strictly from `nextRepairState(...).blocked` and cover both triggering conditions in unit tests.
- **Risk:** New option effects might not integrate with existing slash-command flows. **Mitigation:** Extend tests for `renderInterventionQuestionComment`, `apply-intervention-answer`, and the control panel to cover `reset_to_plan_ready` and ensure commands render correctly.
- **Risk:** Resetting to plan-ready could leave stale pending stage decisions. **Mitigation:** Explicitly clear `FACTORY_PENDING_STAGE_DECISION` in the reset path and add tests asserting it is nullified.
