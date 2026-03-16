# Two-Stage Review Guard Specification

## Summary
- Run the canonical review artifact validation before the review stage creates or pushes a `factory(review)` commit so invalid payloads fail fast without mutating the branch.
- Persist the review-stage output SHA in PR metadata and teach the router to ignore the CI completion that immediately follows a self-generated review commit while the same review cycle is still settling.
- Share the validation code between the pre-push check and `process-review` so the enforcement surface stays consistent and easier to audit; document the intent inside the workflow for future operators.

## Current Behavior
- `prepare-stage-push.mjs` always stages and commits Codex output before any validation; if a review prompt produces malformed `review.md`/`review.json`, the commit lands and triggers a fresh CI run even though the artifacts will later fail `process-review`.
- `process-review.mjs` houses the only canonical validation of the review artifacts, so the failure is detected after the branch update and after the follow-on CI workflow has already started.
- PR metadata does not track which commit originated from the review stage, so `routeWorkflowRun` sees the new green CI completion and re-enters review, yielding a second autonomous commit for the same branch head.
- Operators have no inline workflow comments describing the two-stage guard philosophy, making it hard to reason about why a CI run might be ignored.

## Proposed Changes

### Shared Review Artifact Validation
- Extract the validation logic from `scripts/process-review.mjs` into a new helper (e.g., `scripts/lib/review-artifacts.mjs`) that loads `review.md`/`review.json`, enforces the canonical schema, and confirms the markdown contains the rendered traceability block.
- Ensure the helper accepts `{ artifactsPath, requestedMethodology }`, returns `{ review, reviewMarkdown }`, and throws the same error strings currently produced so downstream classification remains stable.
- Update `process-review.mjs` to delegate to the helper, keeping the pass/request-changes delivery paths untouched aside from sourcing the validated payload.
- Add focused unit tests for the helper (happy path, schema violations, traceability drift) so future changes are caught at the shared layer.

### Pre-Push Review Guard in `prepare-stage-push`
- Pass `FACTORY_ARTIFACTS_PATH` into the `prepare-stage-push` step (via `_factory-stage.yml`) so the script knows where the review artifacts live when running in review mode.
- When `FACTORY_MODE === "review"`, invoke the shared validation helper immediately after pruning temp artifacts and before staging files; surface validation failures as regular preparation errors so the job stops without creating a commit.
- Include a targeted test that simulates review mode with invalid artifacts to assert the script throws and no commit decision is produced.

### Review Rerun Suppression
- Extend PR metadata with a new field (e.g., `pendingReviewSha`) defaulting to `null`; allow `apply-pr-state.mjs` to set or clear it via a `FACTORY_PENDING_REVIEW_SHA` environment knob.
- Capture the post-commit HEAD inside `prepare-stage-push` and expose it (e.g., `prepared_head_sha`) so `_factory-stage.yml` can conditionally record it for review runs.
- Add a lightweight step after the push (only for review mode) that calls `apply-pr-state.mjs` with `FACTORY_PENDING_REVIEW_SHA` set to the staged commit SHA and leaves other fields unchanged; include a brief workflow comment explaining the guard.
- Update `routeWorkflowRun` to return `noop` when:
  - metadata.status is still `reviewing`,
  - `metadata.pendingReviewSha` is present, and
  - the CI completion’s `head_sha` matches the recorded pending SHA.
- Clear `pendingReviewSha` inside `process-review` once delivery succeeds or we escalate (PASS updates already call `apply-pr-state`; REQUEST_CHANGES and failure paths should follow suit) so legitimate future commits are not suppressed.
- Add router tests to confirm self-generated review commits are ignored while unrelated new SHAs still trigger review.

### Documentation & Observability
- Update inline comments in `_factory-stage.yml` (or a short note in `README.md` if preferred) summarizing the two-stage guard so operators know why a CI completion might not retrigger review.
- Note the new metadata field in any relevant developer docs to aid debugging.

## Assumptions & Open Questions
- `FACTORY_ARTIFACTS_PATH` from PR metadata always points at the durable `.factory/runs/<issue>/` directory; no alternative storage conventions need to be supported.
- CI jobs complete fast enough that recording the pending SHA immediately after the push is sufficient to suppress the subsequent run; no extra synchronization is required across workflows.
- Clearing `pendingReviewSha` in all review outcomes (pass, request changes, blocked) will not interfere with existing repair or status workflows.
- No additional audit trail is required beyond the commit message and metadata field.

## Out of Scope
- Reworking how review prompts are generated or how review artifacts are authored beyond the validation reuse.
- Changing the concurrency model or rerun limits for other stages (implement/repair).
- Adding alternative mechanisms (e.g., branch protections or GitHub statuses) to gate review commits.
