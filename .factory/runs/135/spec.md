# Factory Run #135 – Plan Stage Spec

## Summary
- Rework the GitHub review body composer so it no longer pastes the entire `review.md` after the metadata header.
- Build a curated layout that keeps the existing `## Factory Review` header but renders Summary, Blocking Findings, and Non-Blocking Notes as `<details>` sections populated from `review.md`.
- Guarantee that only the canonical traceability block derived from `review.requirement_checks` appears in the published body and that raw `decision: …` lines never surface.

## Goals & Success Criteria
- `buildReviewConversationBody()` constructs the body from explicit sections instead of concatenating `review.md`.
- The composed body contains exactly one `<details>` block with the `🧭 Traceability` summary and it is sourced from `review.requirement_checks`.
- Summary, blocking findings, and non-blocking notes content are wrapped in `<details>` elements whose `<summary>` labels include the existing emoji/title pairings.
- Any `decision:` or methodology boilerplate present in `review.md` is discarded during composition.
- Layout behaves identically for PASS comments and REQUEST_CHANGES review bodies because both code paths call the shared helper.
- Truncation logic still respects `MAX_REVIEW_BODY_CHARS` and keeps the traceability anchor if truncation is necessary.

## Detailed Approach
1. **Extract narrative sections from `review.md`.**
   - Add a helper that parses the normalized markdown for the `📝 Summary`, `🚨 Blocking Findings`, and `⚠️ Non-Blocking Notes` heading patterns (handle emoji or plain-text variants).
   - Capture the markdown between each heading and the next recognized heading or traceability block, ignoring decision or methodology lines and any existing traceability section.
   - Provide sensible fallbacks (`review.summary`, “No blocking findings.”, `_None._`, etc.) when sections are missing or empty.
2. **Compose the curated review body.**
   - Keep `buildFactoryReviewHeader()` to render the metadata header (decision, methodology, counts, artifact links).
   - After the header, append `<details>` blocks for the summary, blocking findings, non-blocking notes (only when content exists or fallback text is required).
   - Append the canonical traceability `<details>` generated via `renderCanonicalTraceabilityMarkdown(review.requirement_checks)`.
   - Ensure the composed body never includes raw `decision:` strings or a second traceability block even if they exist in `review.md`.
3. **Update truncation behaviour.**
   - Adjust `buildTruncatedReviewSection()` (or replace with a new truncation helper) so it operates on the composed sections and still prioritizes retaining the traceability anchor within the character limit.
   - Maintain the existing truncation notice wording and artifact link logic.
4. **Tests & safeguards.**
   - Update `tests/github-messages.test.mjs` to assert the new structure, single traceability block, absence of `decision:` text, and use of `<details>/<summary>` for the targeted sections.
   - Add regression coverage emulating PR #134 to confirm we no longer duplicate traceability and that legacy decision/methodology text is filtered.
   - Extend `tests/process-review.test.mjs` (and any relevant fixtures) to validate that pass and request-changes paths emit the curated layout and satisfy truncation limits.

## Assumptions
- `review.md` uses `##`-level headings with or without emoji for the narrative sections; if headings are missing we can rely on JSON-derived summary/findings for fallbacks.
- No other narrative sections need to be surfaced in the published body beyond Summary, Blocking Findings, and Non-Blocking Notes.
- Legacy reviewers might still include their own traceability or decision text; dropping it from the GitHub output is acceptable because artifacts remain intact.

## Out of Scope
- Changing the `review.md` generation pipeline or its durable format.
- Altering `review.json` schema or downstream dashboards.
- Revisiting the overall truncation notice copy or GitHub messaging templates beyond what is required to support the curated composition.
