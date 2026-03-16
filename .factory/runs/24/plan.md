# Implementation Plan

## Work Breakdown
1. **Introduce emoji formatting in PR body**
   - In `scripts/lib/github-messages.mjs`, add mapping helpers for stage and CI values and wrap the existing Stage/CI lines plus operator notes with the required emoji.
   - Ensure unknown statuses fall back to their raw text so metadata and future states remain readable.
2. **Update GitHub message templates**
   - Prepend `👀` to `scripts/templates/github-messages/plan-ready-issue-comment.md`.
   - Prepend `✅` to `scripts/templates/github-messages/review-pass-comment.md` while keeping the remaining markdown intact.
3. **Prefix blocked/failure comments**
   - Adjust `scripts/handle-stage-failure.mjs` to add a single leading `⚠️` to all comment variants and export `buildFailureComment` for testing.
4. **Extend automated tests**
   - Update `tests/github-messages.test.mjs` expectations for plan-ready and review-pass comments; add assertions that the PR body includes the emoji-enhanced Stage, CI, and operator note lines.
   - Add a new test in `tests/github-messages.test.mjs` for an unmapped status fallback.
   - Add a test in `tests/handle-stage-failure.test.mjs` covering the `⚠️` prefix via the exported helper.
5. **Regression checks**
   - Run the existing test suite (`npm test`) to confirm the emoji changes are fully covered and do not break other messaging behavior.

## Dependencies & Notes
- Template changes must keep existing tokens so overrides continue to validate.
- `buildFailureComment` export should be additive to avoid breaking the script entry point; keep default export behavior unchanged.
- Updating tests first will keep us honest when wiring the emoji mappings.
