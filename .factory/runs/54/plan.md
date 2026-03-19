# Implementation plan

- **Failure typing and metadata plumbing**
  - Update `scripts/lib/failure-classification.mjs` and dependent tests to introduce `review_artifact_contract`.
  - Extend `scripts/process-review.mjs` to emit the new type for validation errors and record structured failure details.
  - Add `lastReviewArtifactFailure` (or similar) to PR metadata via `scripts/lib/pr-metadata.mjs` and `scripts/apply-pr-state.mjs`.

- **Review failure state preparation**
  - Implement `scripts/prepare-review-artifact-repair.mjs` to fetch PR metadata, derive the next repair state with `nextRepairState()`, and write actionable outputs (attempt counts, signature, blocked flag).
  - Create accompanying tests that cover fresh, repeated, and exhausted repair scenarios.

- **Workflow orchestration**
  - Modify `.github/workflows/factory-pr-loop.yml`:
    - Branch inside `review-processing-failed` based on the new failure type.
    - When recoverable, call the new preparation script, update PR state to `repairing`, and skip the blocking path.
    - Add a `review-artifact-repair` job that invokes `./.github/workflows/_factory-stage.yml` in `repair` mode with the updated counters.
    - Ensure the existing `handle-stage-failure.mjs` path is used only when attempts are exhausted or the failure is non-recoverable.

- **Prompt context and comments**
  - Update `scripts/build-stage-prompt.mjs` to include stored review-artifact failure details in the repair prompt’s Failure Context.
  - Adjust `scripts/lib/failure-comment.mjs` (and tests) so comments for `review_artifact_contract` highlight invalid artifacts and indicate whether repair will retry or is exhausted.
  - Ensure `handle-stage-failure.mjs` clears or applies labels consistently with the new status flow.

- **Regression and unit tests**
  - Extend `tests/process-review.test.mjs`, `tests/failure-classification.test.mjs`, `tests/failure-comment.test.mjs`, and `tests/build-stage-prompt.test.mjs` for the new behaviour.
  - Add a dedicated test file for `prepare-review-artifact-repair.mjs`.
  - Update or add fixtures if the new metadata or prompts require them.
