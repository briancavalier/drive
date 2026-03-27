# Implementation Plan – Run 105

- Refactor `buildReviewConversationBody` in `scripts/lib/github-messages.mjs` to accept the normalized review payload, generate the new `Factory Review` summary block (decision icon/label, method, counts, artifact links), append the canonical `review.md`, and update truncation logic to anchor on the new traceability summary.
- Regenerate the GitHub message templates:
  - Replace `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` with the shared layout described in the spec, sharing helper output for blocking findings, requirement gaps, artifact links, and traceability details.
  - Remove reliance on the legacy artifacts footer and `Full Review` section tokens, deleting any helpers rendered obsolete.
- Update review output helpers in `scripts/lib/review-output.mjs` to produce the flattened traceability block and ensure summaries for findings and unmet requirements stay concise when empty.
- Revise `.factory/prompts/review.md` (and any supporting guidance generators) to drop the “include methodology line” instruction and note that traceability is injected as one `<details>` block.
- Rebaseline tests:
  - `tests/github-messages.test.mjs` for comment formatting (PASS, REQUEST_CHANGES, truncation cases).
  - `tests/process-review.test.mjs`, `tests/review-artifacts.test.mjs`, and any fixtures that embed canonical `review.md` sections to reflect the new headings and flattened traceability presentation.
