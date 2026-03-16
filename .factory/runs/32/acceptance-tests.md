# Acceptance Tests

1. **PASS review posts the full markdown**
   - Run `processReview` with a PASS `review.json` and matching emoji-enhanced `review.md`; assert the issue comment body equals the markdown plus the artifact footer and contains the `✅` decision and `📝` summary headings.
2. **REQUEST_CHANGES review mirrors `review.md`**
   - Run `processReview` with a REQUEST_CHANGES decision; verify the submitted pull-request review body matches the `review.md` content plus footer, including the `🚨` blocking findings section.
3. **Oversized review triggers deterministic truncation**
   - Provide a REQUEST_CHANGES `review.md` that exceeds `MAX_REVIEW_BODY_CHARS`; confirm the posted body keeps the decision/summary block, introduces the truncation notice, and references `review.md` for the remainder.
4. **Canonical traceability block carries emoji**
   - Call `renderCanonicalTraceabilityMarkdown` from `scripts/lib/review-output.mjs` with a mix of requirement types; the result begins with `## 🧭 Traceability` and each `<summary>` line includes the `🧭` cue.
5. **Review prompt mandates emoji cues**
   - Inspect `.factory/prompts/review.md` and verify the deliverable instructions explicitly call for `✅/❌` decision, `📝` summary, `🚨` blocking, `⚠️` non-blocking, and `🧭` traceability headings so authors deliver the new format consistently.
