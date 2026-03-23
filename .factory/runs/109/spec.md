# Repair Exhaustion Decision Flow (Run 109)

## Overview
- Convert repair-exhaustion failures into a structured intervention so operators can pick the next step instead of inferring it from raw failure logs.
- Reuse the existing PR-comment Q/A flow and `metadata.intervention` state so automation continues to surface a single, canonical open question.
- Offer bounded follow-up options that map directly onto supported factory transitions: one more repair attempt, reset to plan-ready, or manual takeover.
- Preserve current failure behavior when repair is still allowed to retry automatically.

## Current Behavior
- `scripts/lib/repair-state.mjs#nextRepairState` marks the PR as blocked when repair attempts exceed `maxRepairAttempts` or the same failure repeats twice.
- Blocked repair states trigger `buildFailureIntervention` in `scripts/lib/event-router.mjs`, `scripts/prepare-review-artifact-repair.mjs`, and `scripts/handle-stage-failure.mjs`.
- The failure intervention keeps the PR blocked without prescribing an action, leaving humans to translate diagnostics into the desired follow-up.

## Target Behavior
- When `nextRepairState` determines the repair path is blocked, emit a **question** intervention with `questionKind: "repair_exhaustion"` instead of a failure.
- Post the question via the existing comment renderer so operators receive `/factory answer` commands with bounded options.
- Include resume context (repair attempts, repeated failure counter, last signature, stage noop/setup counters) so the answering path retains the data needed to resume safely.
- Continue emitting failure interventions for all non-exhaustion repair issues.

## Intervention Structure
- Summary highlights why repair exhausted (e.g., attempts exceeded limit vs. repeated identical failure) and reiterates the blocked stage.
- Detail folds in the latest failure message/diagnostics when available so the `<details>` section still explains root cause.
- Options (IDs subject to tests):
  - `retry_narrow_scope` — effect `resume_current_stage`; recommended when exhaustion was triggered by repeated identical failures but another guided attempt might succeed. Instruction text nudges the operator to outline the narrower scope before re-running.
  - `reset_plan_ready` — effect `reset_to_plan_ready`; transitions the PR back to plan-ready, clears blocked state, resets repair attempts, and drops intervention metadata.
  - `manual_takeover` — effect `manual_only`; keeps the PR paused and records a pause reason noting manual takeover.
- All options retain append-only PR comments and hidden metadata markers.

## Answer Handling
- Extend `scripts/apply-intervention-answer.mjs` to recognise `questionKind: "repair_exhaustion"`.
  - `resume_current_stage`: resume repair, preserve updated repair counters from the resume context, and clear the intervention.
  - `reset_to_plan_ready`: set PR status to `plan_ready`, remove blocked/paused state, clear staged actions, reset `repairAttempts` to `0`, and wipe failure signature counters so subsequent runs start fresh.
  - `manual_only`: leave the PR blocked/paused with an explicit pause reason and keep status `blocked`.
- Ensure the resolution comment states whether automation resumes, resets to plan-ready, or stays blocked.
- Continue rejecting answers when the intervention ID or option ID does not match the open question.

## Integration Points
- Add a helper (likely in `scripts/lib/intervention-state.mjs` or a small sibling module) to build the repair exhaustion question payload so all call sites share the same options, summary copy, and resume context.
- Update the following entry points to call the new helper whenever `repairState.blocked` is true:
  - `scripts/lib/event-router.mjs` (CI workflow failures and trusted review change requests).
  - `scripts/prepare-review-artifact-repair.mjs` (review artifact repairs).
  - `scripts/handle-stage-failure.mjs` (stage-driven repair failures inside GitHub Actions).
- Extend `scripts/lib/github-messages.mjs` effect hints and resolution comment logic to describe the plan reset outcome.
- Update `scripts/lib/repair-state.mjs` to surface a `blockedReason` flag (`"max_attempts" | "repeated_failure"`) so the question summary can reflect the specific trigger.
- Keep `metadata.intervention` as the canonical open item by reusing `apply-pr-state.mjs` JSON updates without changing its storage semantics.

## Out of Scope
- Changing repair thresholds or retry heuristics beyond distinguishing why exhaustion occurred.
- Introducing new slash commands or multi-question flows.
- Modifying approval/self-modify interventions or non-repair failure handling.

## Assumptions
- Resetting to plan-ready should also clear `metadata.repairAttempts` so fresh repair runs are not immediately considered exhausted.
- Existing automation that inspects `failure_intervention` outputs tolerates a question payload when repair exhaustion occurs; downstream workflows treat any intervention JSON uniformly.
- Operators already know how to provide optional slash-command notes when choosing manual takeover or reset paths.

## Risks & Mitigations
- **Mis-classified exhaustion reason**: derive the reason directly from `nextRepairState` so the question messaging matches the true trigger.
- **State drift after reset**: ensure the answer flow resets counters (`repairAttempts`, failure signature, repeated failures) in a single `apply-pr-state` update to avoid partial state changes.
- **Commander confusion over new effect**: update option-effect hints and resolution comments so the GitHub UI clearly signals what each answer does.
