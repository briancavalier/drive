# Acceptance Tests

1. **PASS review emits the Factory Review header**
   - Execute `processReview` with a PASS `review.json`/`review.md` pair and repository context set.
   - Assert the posted issue comment starts with `## Factory Review`, the second non-empty line is `**✅ PASS** · Method: \`workflow-safety\`` (or whichever method the artifacts declare), a blank line follows, and the next lines are the bold `Summary`, `Findings`, and `Artifacts` entries using Markdown links.
   - Confirm the body does not contain `Autonomous review completed`, the plain `Summary:` label, or the trailing ``—`` artifact footer.

2. **REQUEST_CHANGES review shares the same layout**
   - Execute `processReview` with a REQUEST_CHANGES decision.
   - Verify the pull-request review body matches the PASS structure (header + summaries + traceability block), includes `### Blocking Findings`, `### Requirement Gaps`, and a `<details><summary>Blocking finding details</summary>` block before traceability.
   - Ensure there is no `Full Review` section and that the `Artifacts` line links to both `review.md` and `review.json`.

3. **Traceability is rendered as a single flat disclosure**
   - Call `renderCanonicalTraceabilityMarkdown` with requirement checks covering multiple types.
   - Assert the output contains exactly one `<details>` element with `<summary>🧭 Traceability</summary>` and inner headings (e.g., `### Acceptance Criteria (✅ 2)`), with no nested `<details>` tags.
   - Confirm `buildReviewConversationBody` reuses the same inner block (e.g., search the rendered header for `<summary>🧭 Traceability</summary>` followed immediately by the grouped headings).

4. **Truncation path retains the header and links**
   - Feed `buildReviewConversationBody` a REQUEST_CHANGES review whose framed body would exceed `MAX_REVIEW_BODY_CHARS`.
   - Verify the returned string still begins with the Factory Review header, includes the bold summary block, and appends the truncation notice `**Review truncated after traceability details. See [review.md](…) for the full report.**`.
   - Ensure the truncation notice uses the same clickable `review.md` link as the `Artifacts` line.

5. **Review prompt no longer requests methodology duplication**
   - Inspect `.factory/prompts/review.md` and confirm the deliverable instructions no longer tell the reviewer to include the methodology inside `review.md`, while the required section order remains unchanged.
