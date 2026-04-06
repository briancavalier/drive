# Add repair exhaustion operator question

## Problem
- When the repair stage exhausts its retry budget or hits the repeated-failure guard, the factory posts a generic failure comment and leaves a blocking failure intervention.
- Operators must infer the next action (rerun repair, escalate, or reset) from unstructured comments, and the control panel cannot surface specific bounded choices.
- The absence of a structured intervention breaks the existing `/factory answer` flow and makes it difficult to resume automation safely once someone decides how to proceed.

## Goals
- Swap the blocking failure output for a question intervention whenever repair exhaustion is reached.
- Use the existing intervention/comment infrastructure so operators answer via `/factory answer <id> <option>`.
- Capture enough context (failure detail, attempt counts, resume instructions) to let automation resume repair, reset to planning, or stay paused for human takeover.
- Keep failure handling for non-exhaustion scenarios unchanged.

## Non-goals and constraints
- Do not introduce free-form operator responses or multi-question orchestration.
- Do not change repair attempt accounting, `maxRepairAttempts`, or how signatures are computed.
- Preserve `metadata.intervention` as the single source of truth for open interventions.
- Keep the rollout limited to repeated repair failures; other failure types should continue to surface as today.

## Proposed solution

### 1. Expose repair exhaustion reason alongside counters
- Extend `scripts/lib/repair-state.mjs` so `nextRepairState()` returns an `exhaustedBy` field (e.g. `"attempt_limit"` or `"repeated_failure"`) when `blocked === true`.
- Update downstream consumers (`scripts/lib/event-router.mjs`, `scripts/route-pr-loop.mjs`, relevant tests) to propagate the reason and retain existing numeric counters.
- Ensure route outputs expose both `maxRepairAttempts` and the exhaustion reason so later steps can render accurate messaging.

### 2. Build a shared repair-exhaustion question helper
- Introduce `scripts/lib/repair-interventions.mjs` (or similar) with a `buildRepairExhaustionQuestion({ action, repairState, failureSummary, failureDetail, resumeContext, runInfo })`.
  - Reuse `buildFailureComment()` to populate the detail/FAQ section so operators still see diagnostics and follow-up links.
  - Generate a summary like “Autonomous repair exhausted after {attempts}/{max} attempts” or “Repeated repair failure needs operator decision,” depending on `exhaustedBy`.
  - Provide a prompt question: “The factory can’t repair this branch autonomously. What should happen next?”
  - Define options:
    - `retry_repair` — effect `resume_current_stage`, instruction guiding the operator to narrow the repair scope before re-running `/factory repair`. Recommended option.
    - `reset_plan` — effect `reset_to_plan_ready`, instruction indicating automation will return to the plan-ready state and clear repair counters.
    - `human_takeover` — effect `manual_only`, signalling a manual takeover.
  - Attach a `resumeContext` carrying current counters, failure signature, stage no-op/setup counts, and CI/review identifiers.

### 3. Convert repair-stage failure exhaustion into a question
- Pass `FACTORY_MAX_REPAIR_ATTEMPTS` (and the exhaustion reason emitted by routing) from the workflow into `scripts/handle-stage-failure.mjs`.
- When `FACTORY_FAILED_ACTION === "repair"` and the counters show we just crossed the limit (`repairAttempts > max` or `repeatedFailureCount >= 2`), skip the normal failure intervention:
  - Build the question via the new helper, set `FACTORY_STATUS=blocked`, `FACTORY_BLOCKED_ACTION=repair`, and `FACTORY_INTERVENTION` to the question payload.
  - Replace the failure comment with `renderInterventionQuestionComment()` so the PR thread shows the question and `/factory answer` commands.
  - Reuse the failure diagnostics inside the question detail, and avoid creating follow-up GitHub issues unless the helper explicitly signals otherwise.
- Keep existing behaviour for non-exhausted failures (transient, configuration, first-attempt repair runs, etc.).

### 4. Raise the question when routing detects exhaustion before a stage run
- Update `scripts/lib/event-router.mjs` so `routeWorkflowRun()` and `routePullRequestReview()`:
  - Check for an existing open question intervention; if one already exists, return `action: "noop"` to prevent duplicate comments.
  - When `repairState.blocked` is newly reached, emit a question payload (using the shared helper) instead of a failure intervention and add the exhaustion reason to the routed outputs.
- Extend `scripts/route-pr-loop.mjs` and job outputs to include `repair_question_intervention`, `repair_question_comment`, `max_repair_attempts`, and `repair_exhaustion_reason`.
- Replace the current “block” step in `.github/workflows/factory-pr-loop.yml` with a new job (e.g. `repair-exhaustion-question`) that runs when the routed question payload is present:
  - Invoke a small wrapper script (e.g. `scripts/raise-repair-exhaustion-question.mjs`) that applies the question intervention via `apply-pr-state.mjs`, mirroring the stage-failure path.
  - Leave the legacy blocking path in place for other failure types that still emit `failure_intervention`.

### 5. Support plan reset answers in the intervention handler
- Extend `scripts/apply-intervention-answer.mjs` to recognise option effect `reset_to_plan_ready`:
  - Clear the open intervention, set status to `plan_ready`, clear `blockedAction`, reset `repairAttempts` to 0, and unpause the PR.
  - Ensure the PR body/labels update through `apply-pr-state.mjs` (plan-ready label applied, blocked removed).
- Add the new effect hint (`reset_to_plan_ready → Returns to plan-ready state`) to `scripts/lib/github-messages.mjs` so question comments describe it.
- Verify the helper still records pending stage decisions for `resume_current_stage` answers (they should resume the repair stage).

### 6. Testing and verification
- Update `tests/repair-state.test.mjs` to cover the new `exhaustedBy` flag.
- Add/extend unit tests for:
  - `scripts/lib/repair-interventions.mjs` question builder.
  - `tests/handle-stage-failure.test.mjs` for the question path vs legacy failure.
  - `tests/event-router-commands.test.mjs` verifying routed question payloads and duplicate suppression.
  - `tests/apply-intervention-answer.test.mjs` for the reset-to-plan-ready effect.
  - `tests/github-messages.test.mjs` (and control-panel coverage) to render the new option hint.
- Provide workflow-level coverage where feasible (e.g. mocking the new wrapper script) to ensure the routed outputs drive the correct job branches.

## Assumptions
- Resetting to plan-ready implicitly restarts repair attempt accounting; setting `repairAttempts` to 0 is acceptable for downstream logic.
- Reusing `buildFailureComment()` for the question detail provides sufficient diagnostics; no additional bespoke content is needed.
- Operators will use the existing `/factory answer` flow, so no changes to slash-command parsing are required.
