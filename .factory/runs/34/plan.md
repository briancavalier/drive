# Implementation Plan

## Work Breakdown
1. **Lift review validation into a shared helper**
   - Create `scripts/lib/review-artifacts.mjs` containing the logic currently embedded in `process-review.mjs`.
   - Refactor `process-review.mjs` to consume the helper; update `tests/process-review.test.mjs` to point at the new API and add targeted helper tests.
2. **Gate review commits with pre-push validation**
   - Pass `FACTORY_ARTIFACTS_PATH` into the `prepare-stage-push.mjs` environment from `_factory-stage.yml`.
   - In `prepare-stage-push.mjs`, call the shared validator when `FACTORY_MODE === "review"` before staging/committing; surface failures as preparation errors.
   - Extend `tests/prepare-stage-push.test.mjs` (or add a sibling test file) to assert valid artifacts pass and malformed artifacts throw.
3. **Track pending review SHAs in metadata**
   - Add `pendingReviewSha` to PR metadata defaults and wire `apply-pr-state.mjs` to accept `FACTORY_PENDING_REVIEW_SHA` (including a sentinel for "clear").
   - Teach `prepare-stage-push.mjs` to emit the post-commit HEAD (e.g., `prepared_head_sha`) and record it during review runs via a new conditional step in `_factory-stage.yml`.
   - Ensure process-review success, request-changes, and failure paths clear the field; cover the new behavior in `tests/apply-pr-state-metadata.test.mjs`.
4. **Suppress redundant review reruns**
   - Update `scripts/lib/event-router.mjs` to skip CI completions whose `head_sha` equals the metadata `pendingReviewSha` while the PR remains `reviewing`.
   - Add regression cases to `tests/event-router.test.mjs` verifying self-generated commits are ignored and real new commits still trigger review.
5. **Document the guard**
   - Add a concise comment near the new workflow step (and, if helpful, a short note in the operator documentation) describing how the two-stage guard works and how to clear it if debugging.

## Testing Strategy
- Unit suites: `node --test tests/review-artifacts.test.mjs`, `node --test tests/prepare-stage-push.test.mjs`, `node --test tests/apply-pr-state-metadata.test.mjs`, `node --test tests/event-router.test.mjs`.
- Full regression: `npm test` (runs the entire Node test suite).
