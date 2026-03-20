# Plan: Factory Control Panel

## Implementation Steps
1. **Introduce control panel view model**
   - Add `scripts/lib/control-panel.mjs` encapsulating state/label-to-display logic, including action matrix, reason wording, and link assembly helpers.
   - Cover every state mapping with unit tests to lock emoji, text, and action visibility.
2. **Enrich PR metadata handling**
   - Extend `scripts/lib/pr-metadata.mjs` defaults and schema with `lastCompletedStage`, `lastRunId`, `lastRunUrl`, and `pauseReason`.
   - Update `scripts/apply-pr-state.mjs` to accept new env vars, merge them into metadata, capture live PR labels, and pass label context into `renderPrBody`.
   - Ensure paused labels overlay the displayed state without mutating the underlying status machine.
3. **Propagate metadata from workflows**
   - Modify `scripts/finalize-plan.mjs` and relevant jobs in `.github/workflows/factory-pr-loop.yml` (mark-in-progress, stage-succeeded, review success/failure, handle-stage-failure) to set the new env vars consistently.
   - Verify `handle-stage-failure.mjs` passes along run identifiers/URLs and resets counters when automation succeeds to keep panel fields current.
4. **Render the control panel in the PR body**
   - Update `scripts/lib/github-messages.mjs` to build a `CONTROL_PANEL_SECTION` using the new view model, and adjust operator notes to reference the panel.
   - Insert the new token into `scripts/templates/github-messages/pr-body.md`, supplying a backward-compatible fallback when overrides omit it.
   - Refresh existing PR body tests, fixtures, and any downstream consumers (`tests/github-messages.test.mjs`, `tests/pr-metadata.test.mjs`, `tests/build-stage-prompt.test.mjs`).
5. **Wire operator actions**
   - Add `.github/workflows/factory-control-action.yml` (or extend an existing workflow) to execute state-changing actions via `workflow_dispatch` inputs.
   - Update the view model to emit workflow URLs for mutation actions and artifact/run links for informational actions; extend tests to ensure invalid actions never appear.
6. **Document and polish**
   - Update README/operator docs to describe the panel, action semantics, and fallback workflows.
   - Perform final lint/test pass (`npm test`) to ensure control-panel rendering and metadata handling remain stable.

## Impacted Areas
- PR metadata plumbing (`scripts/lib/pr-metadata.mjs`, `scripts/apply-pr-state.mjs`).
- GitHub message rendering (`scripts/lib/github-messages.mjs`, `scripts/templates/github-messages/pr-body.md`).
- Factory workflows (`.github/workflows/factory-pr-loop.yml`, new control-action workflow, `scripts/finalize-plan.mjs`).
- Failure handling (`scripts/handle-stage-failure.mjs`) for run metadata.
- Test suite covering PR body rendering and workflow routing (`tests/**`).
- Operator documentation (`README.md` or dedicated guide).

## Assumptions & Dependencies
- Workflow dispatch links satisfy the "one-click" expectation; operators are comfortable triggering actions via workflow runs.
- Existing failure metadata (`lastFailureType`, `repairAttempts`, `lastReviewArtifactFailure`) is sufficient to produce user-facing reasons without new classifiers.
- All PR metadata mutations continue to flow through `apply-pr-state.mjs`, so no additional writers need updates.

## Testing Strategy
- Add targeted unit tests for `control-panel.mjs` covering every state/action combination and blocked sub-type reason message.
- Update PR body and metadata tests to assert presence of the control panel, new metadata fields, and paused overlay behavior (`tests/github-messages.test.mjs`, `tests/pr-metadata.test.mjs`, `tests/apply-pr-state-metadata.test.mjs`).
- Extend workflow and failure handling tests (e.g., `tests/handle-stage-failure.test.mjs`, `tests/event-router.test.mjs`) to confirm run metadata and stage counters feed the panel correctly.
- Run the full test suite via `npm test` to catch regressions across templating and prompt builders that read the PR body.
