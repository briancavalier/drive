# Implementation Plan

## Work Breakdown
1. **Introduce emoji mapping helpers**
   - In `scripts/lib/github-messages.mjs`, add stage/CI emoji maps near `renderPrBody` and update the status block assembly to prefix mapped emojis while preserving text labels.
   - Cover unmapped statuses (e.g., `reviewing`) with a fallback that omits icons so we do not invent semantics.
2. **Refresh operator notes copy**
   - Reword the three operator guidance bullets in `scripts/lib/github-messages.mjs` to reuse the required emoji prefixes (`▶️`, `⏸️`) and keep label references untouched.
3. **Adjust automated comment templates**
   - Update the plan-ready template (`scripts/templates/github-messages/plan-ready-issue-comment.md`) and review-pass template (`scripts/templates/github-messages/review-pass-comment.md`) to include their emoji prefixes without breaking existing token placeholders.
4. **Prefix failure comments**
   - Modify `buildFailureComment` in `scripts/handle-stage-failure.mjs` so every returned string begins with `⚠️` (including plan-reset paths) while leaving the explanatory copy intact.
   - Export the helper if needed so tests can assert the formatted output directly.
5. **Expand regression tests**
   - In `tests/github-messages.test.mjs`, update expectations for plan-ready/review-pass comments and add focused assertions that `renderPrBody` emits emoji-enhanced Stage/CI lines for mapped values plus a fallback case.
   - Extend `tests/handle-stage-failure.test.mjs` (or a new test) to verify `buildFailureComment` outputs the `⚠️` prefix for blocked/failure scenarios.

## Dependencies & Notes
- Updating comment templates requires no new override tokens, but tests using overrides must be refreshed to match the prefixed copy.
- Emoji additions must remain additive; double-check that JSON metadata in the PR body stays unchanged after template updates.
- When exporting `buildFailureComment`, avoid breaking existing imports by keeping the default API surface the same.
- After code changes, run the relevant unit tests (`node --test`) to confirm deterministic behavior.
