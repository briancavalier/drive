# Implementation Plan – Run 109

- **Surface exhaustion context in repair state**
  - Extend `scripts/lib/repair-state.mjs#nextRepairState` to return a `blockedReason` value (`"max_attempts"` or `"repeated_failure"`) alongside existing fields.
  - Update consumers and tests (`tests/repair-state.test.mjs`, any snapshots) to assert the new reason and maintain backwards compatibility for unblocked cases.

- **Provide a shared repair-exhaustion question builder**
  - Introduce `buildRepairExhaustionQuestion` in `scripts/lib/intervention-state.mjs` (or adjacent module) that accepts `{ action, repairState, failureMessage, failureType, phase, runId, runUrl, resumeContext }`.
  - Build summary text using `repairState.blockedReason`, include stage, attempts, and repeated failure counts.
  - Populate payload with `questionKind: "repair_exhaustion"`, recommended option (default to `retry_narrow_scope` when reason is `repeated_failure`, otherwise none), shared options (retry, reset, manual takeover), and resume context.
  - Write targeted unit coverage in `tests/intervention-state.test.mjs` or extend an existing suite.

- **Emit question interventions from exhaustion call sites**
  - `scripts/lib/event-router.mjs`: swap `buildFailureIntervention` for the new builder when `repairState.blocked` is true; feed through failure metadata and resume context for review and CI routes.
  - `scripts/prepare-review-artifact-repair.mjs`: use the new builder in outputs and adjust tests to expect a question intervention while preserving failure metadata outputs.
  - `scripts/handle-stage-failure.mjs`: when dependent repair state indicates exhaustion (via env counters), create the question intervention and render via `renderInterventionQuestionComment`.
  - Update affected tests (`tests/event-router.test.mjs`, `tests/prepare-review-artifact-repair.test.mjs`, `tests/handle-stage-failure.test.mjs`) to cover the question path and still validate non-exhausted flows.

- **Handle repair-exhaustion answers**
  - Extend `scripts/apply-intervention-answer.mjs` to process `questionKind: "repair_exhaustion"`:
    - Map option effects: `resume_current_stage` resumes repair, `reset_to_plan_ready` sets status to plan-ready, clears blocked/pause fields, resets repair counters; `manual_only` pauses with a descriptive reason.
    - Ensure `FACTORY_REPAIR_ATTEMPTS`, repeated failure counters, and failure signatures reset appropriately for plan-ready transitions.
  - Add tests to `tests/apply-intervention-answer.test.mjs` validating status transitions, pause reasons, and metadata resets for each option.

- **Expose new option effect and messaging**
  - Update `scripts/lib/github-messages.mjs` `OPTION_EFFECT_HINTS` and resolution-comment wording to describe plan reset outcomes.
  - Adjust `tests/github-messages.test.mjs` to cover the new hint and ensure the comment still renders correctly for repair-exhaustion questions.

- **Ensure PR metadata updates stay canonical**
  - Review `scripts/apply-pr-state.mjs` and related metadata helpers to confirm they can clear `repairAttempts`, `intervention`, and pending decisions in a single update.
  - Add/adjust unit tests (`tests/apply-pr-state-metadata.test.mjs`, `tests/pr-metadata.test.mjs`) if any new metadata fields or behaviors are introduced (e.g., verifying reset clears counters).

- **Regression pass**
  - Run targeted suites: `npm test -- tests/repair-state.test.mjs tests/intervention-state.test.mjs tests/event-router.test.mjs tests/apply-intervention-answer.test.mjs tests/prepare-review-artifact-repair.test.mjs tests/handle-stage-failure.test.mjs tests/github-messages.test.mjs tests/apply-pr-state-metadata.test.mjs`.
  - Expand to full CI run if time permits to catch cross-module regressions.
