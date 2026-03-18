# Implementation Plan

## Work Breakdown
1. **Expand failure taxonomy and stage detection**
   - Update `scripts/lib/failure-classification.mjs` with `stage_noop` and `stage_setup` plus associated regex patterns.
   - Modify `.github/workflows/_factory-stage.yml` and `scripts/prepare-stage-push.mjs` to emit the new failure types, including collecting diagnostics when no repository changes are produced.
   - Adjust workflow diagnosis gating to skip the new deterministic types and extend `tests/failure-classification.test.mjs` / `tests/prepare-stage-push.test.mjs` accordingly.

2. **Surface diagnostics in operator-facing output**
   - Factor a helper to build stage diagnostics summaries and include them in `prepare-stage-push` error messages.
   - Update `scripts/lib/failure-comment.mjs` to add tailored headlines, recovery steps, and a “Stage diagnostics” section for `stage_noop` and `stage_setup`.
   - Refresh `tests/failure-comment.test.mjs` to cover the new rendering and ensure existing comment flows stay intact.

3. **Track bounded recovery attempts and adjust state handling**
   - Extend PR metadata (`scripts/lib/pr-metadata.mjs`, `scripts/apply-pr-state.mjs`, `scripts/route-pr-loop.mjs`) with `stageNoopAttempts` / `stageSetupAttempts`, wiring through environment variables in the PR loop workflows.
   - Update `scripts/handle-stage-failure.mjs` to increment counters, choose plan-ready vs blocked transitions, and annotate comments. Ensure the stage success path resets the counters.
   - Cover these behaviors in `tests/handle-stage-failure.test.mjs` and any PR-metadata rendering tests.

4. **Prompt context and documentation**
   - Teach `scripts/build-stage-prompt.mjs` to echo the last failure type and attempt counters in Run Metadata and to nudge the next implement/repair run after a no-op.
   - Document the new classifications and recovery expectations in `README.md`.
   - Update `tests/build-stage-prompt.test.mjs` (or add a new case) verifying the additional context.

5. **Follow-up gating & regression sweep**
   - Ensure `scripts/lib/failure-followup.mjs` treats `stage_noop` as ineligible and add/update unit coverage.
   - Run the full node test suite (`npm test`) to confirm all updated components integrate cleanly.

## Testing Strategy
- Focused unit suites: `node --test tests/failure-classification.test.mjs`, `tests/prepare-stage-push.test.mjs`, `tests/failure-comment.test.mjs`, `tests/handle-stage-failure.test.mjs`, `tests/build-stage-prompt.test.mjs`, `tests/failure-followup.test.mjs`.
- End-to-end assurance: `npm test` to execute the entire test matrix after modifications.
