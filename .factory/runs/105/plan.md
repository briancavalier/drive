# Implementation Plan

## Work Breakdown
1. **Refactor review conversation builder**
   - Extend `buildReviewConversationBody` in `scripts/lib/github-messages.mjs` to accept the validated review payload and repository context, render the new Factory Review header (via refreshed templates), append `review.md`, and update truncation to use the clickable `review.md` link.
   - Compute blocking/requirement counts, summary text, and artifact URLs, and pass them into the template render for both PASS and REQUEST_CHANGES decisions.
2. **Update rendering helpers**
   - Adjust `scripts/lib/review-output.mjs` to provide flattened traceability content, updated detail blocks, and any new helpers needed for unmet requirement summaries.
   - Ensure `renderCanonicalTraceabilityMarkdown` and `renderTraceabilityDetails` both emit a single `<details>` block with the new labels.
3. **Refresh GitHub message templates and prompts**
   - Rewrite `scripts/templates/github-messages/review-pass-comment.md` and `review-request-changes.md` to the new header/summary layout (identical structure aside from the blocking-details token).
   - Edit `.factory/prompts/review.md` to remove the directive about including methodology in `review.md` while preserving the required section order.
4. **Propagate environment metadata**
   - Update `scripts/process-review.mjs` to pass repository URL, branch, and artifacts path into the builder so the `Artifacts` line renders clickable links; retain existing apply-state flow.
5. **Revise automated tests**
   - Update `tests/process-review.test.mjs` expectations for both decisions, covering header structure, absence of legacy lines, and blocking-detail collapsibles.
   - Refresh `tests/github-messages.test.mjs` to validate the new framed output, flattened traceability, and truncation notice; adjust override tests for the new token set.
6. **Verification**
   - Run the relevant test suites (`npm test`) and review diff outputs to confirm no stray legacy strings or duplicated methodology remain.

## Dependencies & Notes
- Reuse `buildArtifactLinks` when deriving review markdown/json URLs; fall back to relative paths if the repository URL is unavailable.
- Keep a shared decision metadata helper (emoji + label) to avoid diverging PASS vs. REQUEST_CHANGES formatting.
- Confirm that override validation still downgrades invalid templates so legacy files with removed tokens do not break delivery.
