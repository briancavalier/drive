# Implementation Plan – Run 109

- **Create a reusable repair-exhaustion question builder**
  - Add a helper (new module or addition to `scripts/lib/repair-state.mjs`) that accepts the computed repair state plus failure context and returns a `question` intervention with `questionKind: "repair_exhaustion"`, populated summary/detail, and the three canonical options (`retry_repair`, `reset_plan_ready`, `human_takeover`).
  - Ensure the helper attaches `resumeContext` (repair attempts, repeated failure count, failure signature, CI metadata) so downstream stages can resume safely.

- **Emit the question when repair exhaustion is detected**
  - Update `scripts/handle-stage-failure.mjs` so that when `action === "repair"` and the computed `repairState.blocked` flag is true, it calls the new helper and posts the question instead of a failure intervention.
  - Adjust `scripts/lib/event-router.mjs` paths that currently return a repair failure intervention on `repairState.blocked` (failing CI and maintainer review requests) to route the new question instead, keeping the rest of the payload unchanged.

- **Teach answer handling about repair exhaustion outcomes**
  - Extend `scripts/apply-intervention-answer.mjs` to recognize `questionKind: "repair_exhaustion"` and the new option effects.
  - Implement effect-specific metadata updates:
    - `retry_repair`: clear the intervention, resume the repair stage, set `FACTORY_REPAIR_ATTEMPTS=0`, and persist a `pending_stage_decision` entry noting the operator’s choice/instruction.
    - `reset_plan_ready`: transition to plan-ready (status + labels), reset repair counters, and clear blocked/paused flags.
    - `human_takeover`: reuse the existing pause path with an explicit pause reason tied to the intervention.
  - Add a new option effect handler for `reset_to_plan_ready` and expose a matching hint in `scripts/lib/github-messages.mjs`.

- **Validate and surface the new question kind**
  - Update `scripts/detect-stage-intervention-request.mjs` (or related validation) if necessary to allow `questionKind: "repair_exhaustion"` while preserving existing ambiguity checks.
  - Confirm `control-panel` messaging and any metadata serializers (`scripts/lib/pr-metadata.mjs`) continue to emit the question summary; tweak only if gaps appear during tests.

- **Expand automated coverage**
  - `tests/handle-stage-failure.test.mjs`: assert that repair exhaustion now produces a question intervention with the expected option IDs/effects and question metadata.
  - `tests/event-router.test.mjs`: cover both CI and review-triggered exhaustion, ensuring the routed output contains the question intervention and `action: "blocked"`.
  - `tests/apply-intervention-answer.test.mjs`: add cases for each repair exhaustion option to verify status transitions, counter resets, pending decision logging, and pause behavior.
  - `tests/github-messages.test.mjs`: document the new `reset_to_plan_ready` hint and ensure question rendering includes the new summary/prompt text.
  - Update or add any snapshot/fixture expectations impacted by the change (e.g., control panel state, metadata serialization).

- **Manual/CI verification**
  - Run targeted suites (e.g., `npm test -- tests/handle-stage-failure.test.mjs tests/event-router.test.mjs tests/apply-intervention-answer.test.mjs`) followed by the full test suite if fallout occurs.
