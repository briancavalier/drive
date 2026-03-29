# Implementation Plan

1. **Review body parsing helper**
   - Update `scripts/lib/github-messages.mjs` to add utilities that normalize `review.md`, locate `📝 Summary`, `🚨 Blocking Findings`, and `⚠️ Non-Blocking Notes` sections, and strip decision/methodology/traceability content.
   - Ensure the parser tolerates emoji-free headings and returns fallback text sourced from the structured review payload when sections are absent.

2. **Curated composition**
   - Refactor `buildReviewConversationBody()` in `scripts/lib/github-messages.mjs` to assemble the metadata header plus `<details>` blocks for summary, blocking findings, non-blocking notes, and the canonical traceability produced via `renderCanonicalTraceabilityMarkdown()`.
   - Guarantee only one traceability block is included and raw `decision:` lines never appear.

3. **Truncation adjustments**
   - Rework the truncation helper in `scripts/lib/github-messages.mjs` to operate on the new composed segments while keeping the existing truncation notice and artifact link references.
   - Maintain preference for retaining the traceability anchor within character limits.

4. **Test coverage**
   - Update `tests/github-messages.test.mjs` to reflect the new markup, including regression scenarios mirroring PR #134 and truncated bodies.
   - Extend `tests/process-review.test.mjs` (and any supporting fixtures) to assert that both PASS comments and REQUEST_CHANGES reviews emit the curated layout and stay within `MAX_REVIEW_BODY_CHARS`.
