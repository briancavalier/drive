# Implementation Plan

## Work Breakdown
1. **Create shared review body helper**
   - In `scripts/lib/github-messages.mjs`, replace the pass/request-changes template functions with a helper that ingests `review.md`, appends the artifact footer, and applies the deterministic truncation rules (traceability-based fallback, final hard cap).
   - Drop unused rendering helpers (`renderBlockingFindingsSummary`, etc.) once the new helper no longer references them.
2. **Wire helper into review processing**
   - Update `scripts/process-review.mjs` to call the helper for both PASS and REQUEST_CHANGES paths, keeping the existing `apply-pr-state` flow while swapping the posted bodies to the helper output.
   - Ensure PASS still posts via `commentOnIssue` and REQUEST_CHANGES continues to use `submitPullRequestReview`.
3. **Emoji-enable canonical review markdown**
   - Adjust `scripts/lib/review-output.mjs` so the canonical traceability block carries the `🧭` heading/summaries and export any small utilities needed by the new helper.
   - Refresh `.factory/prompts/review.md` instructions to require the `✅/❌`, `📝`, `🚨`, `⚠️`, and `🧭` badges in the designated sections without altering the structural requirements.
4. **Update and extend automated tests**
   - Rewrite the test fixture generator in `tests/process-review.test.mjs` to emit emoji-bearing review markdown.
   - Expand tests to assert the PASS comment matches the markdown + footer, the REQUEST_CHANGES review uses the same helper output, and truncation emits the new notice.
   - Revise `tests/github-messages.test.mjs` to cover the helper directly (full vs. truncated bodies) and delete expectations tied to the old templates.
5. **Regression guardrails**
   - Run `npm test` to confirm all suites pass after the refactor and emoji updates.

## Dependencies & Notes
- The helper needs access to `MAX_REVIEW_BODY_CHARS` (share the constant from `process-review.mjs`), so export/reuse it rather than duplicating magic numbers.
- Preserve artifact path handling so overrides under `.factory/messages` keep working; fall back gracefully if a custom template is still present.
- Keep `renderCanonicalTraceabilityMarkdown` the single source for whatever heading text the validator expects.
