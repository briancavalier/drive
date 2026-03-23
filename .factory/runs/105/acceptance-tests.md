# Acceptance Tests

- PASS review layout: run `processReview` on a passing review artifact and verify the posted body starts with `## Factory Review`, shows `**✅ PASS** · Method:`, reports findings/requirement counts, lists both artifact paths in the summary block, and includes `<details>` sections for traceability and full review content.
- REQUEST_CHANGES review layout: run `processReview` on a failing review artifact and verify the REQUEST_CHANGES comment uses the same heading order, includes blocking and requirement summaries, renders a `<details>` block for full blocking findings, and references both artifact files in the summary block.
- Length guard: simulate a large review so the template would exceed the `MAX_REVIEW_BODY_CHARS` limit and confirm the summary block remains intact while lower-priority detail sections are dropped before a truncation notice pointing to `review.md` is appended.
- Template overrides: place an override for `review-pass-comment.md` under `.factory/messages/` and confirm `processReview` emits the overridden content, proving the new token map propagates through the rendering pipeline.
