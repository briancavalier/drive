# Full Review Delivery Specification

## Summary
- Post the complete `review.md` body into the pull request conversation for both PASS and REQUEST_CHANGES decisions so humans can read the full assessment without opening artifacts.
- Treat `review.md` as the single source of truth when composing GitHub comments/reviews, only appending deterministic metadata (e.g., artifact links, truncation notices) to avoid drift.
- Refresh the `review.md` authoring guidance and canonical traceability renderer with light-touch emoji cues to match the rest of the factory messaging while keeping content readable and collapsible.

## Current Behavior
- `process-review.mjs` handles PASS decisions by leaving a short `renderReviewPassComment` issue comment that summarizes the decision and links to `review.md`; the full markdown stays hidden in artifacts.
- REQUEST_CHANGES decisions use `renderRequestChangesReviewBody`, which stitches together multiple summaries plus a collapsible copy of `review.md`, causing duplication and leaving PASS vs. REQUEST_CHANGES on different rendering paths.
- `renderCanonicalTraceabilityMarkdown` emits plain headings (`## Traceability`, `Traceability: Acceptance Criteria`, etc.), so `review.md` lacks the emoji styling recently rolled out elsewhere.
- The review prompt in `.factory/prompts/review.md` does not mention emoji cues, so authors keep producing plain-text headings.
- Tests in `tests/process-review.test.mjs` and `tests/github-messages.test.mjs` assert the old summary comment and the legacy request-changes layout.

## Proposed Changes

### Review Delivery Flow
- Replace `renderReviewPassComment`/`renderRequestChangesReviewBody` with a shared helper in `scripts/lib/github-messages.mjs` (e.g., `buildReviewConversationBody`) that accepts `{ reviewMarkdown, artifactsPath, decision }` and returns:
  - The trimmed `review.md` content as the primary body.
  - An appended footer like `\n\n—\nArtifacts: \\`<path\>`` so readers still have quick links.
  - A deterministic truncation message when the composed body would exceed `MAX_REVIEW_BODY_CHARS`.
- Update `scripts/process-review.mjs` so both PASS and REQUEST_CHANGES paths call the helper:
  - PASS continues to run `apply-pr-state` then posts the helper output via `commentOnIssue` (ensuring continuity of the ready-for-review state change while upgrading the comment content).
  - REQUEST_CHANGES submits the helper output in `submitPullRequestReview({ event: "REQUEST_CHANGES" })`, keeping the repair loop trigger intact but avoiding any parallel summary formatting.
- Keep `review.json` validation as-is; remove unused summary-building code from `review-output.mjs` once the helper no longer relies on it.

### Deterministic Truncation Strategy
- The helper should:
  1. Attempt to post the full `review.md` body (plus footer) when `length <= MAX_REVIEW_BODY_CHARS`.
  2. If too large, locate the canonical `## Traceability` heading emitted by `renderCanonicalTraceabilityMarkdown`.
     - Always keep everything up to (but excluding) the traceability section plus the `## Traceability` heading itself, ensuring the decision, summary, and findings remain visible.
     - Append a bold note such as `**Review truncated after traceability details. See \\`review.md\`` to signal loss of detail.
  3. If the pre-traceability portion alone still exceeds the limit (pathological case), fall back to slicing at `MAX_REVIEW_BODY_CHARS - note.length` after the first newline, ensuring the opening decision block survives, then append the truncation note.
- This keeps the highest-signal content in GitHub while deferring tables/large evidence to the artifact when necessary.

### Emoji Enhancements for `review.md`
- Update `renderCanonicalTraceabilityMarkdown` in `scripts/lib/review-output.mjs` to emit emoji-decorated headings (e.g., `## 🧭 Traceability`, `<summary>🧭 Traceability: Acceptance Criteria</summary>`) so validation expects the emoji-bearing block.
- Refresh `.factory/prompts/review.md` deliverable instructions to require emoji cues in the key sections:
  - Decision line prefixed with `✅` (PASS) or `❌` (REQUEST_CHANGES) directly in the heading or inline label.
  - Summary heading with `📝`.
  - Blocking findings heading with `🚨`; non-blocking notes heading with `⚠️` (only when present).
  - Traceability heading must match the canonical emoji-enhanced block.
- Clarify in the prompt that emoji should be concise and limited to the specified headings to manage noise.
- Ensure existing instructions about traceability structure remain intact so `process-review` validation still passes.

### Test Coverage
- Rewrite `tests/process-review.test.mjs` fixtures so the synthetic `review.md` they generate already uses the emoji headings, ensuring validation exercises the new canonical formatting.
- Add PASS-path assertions verifying that `commentOnIssue` receives the literal `review.md` content (plus footer) and contains the expected emoji headers.
- Add REQUEST_CHANGES assertions confirming the submitted review body matches the helper output, includes the emoji headings, and in truncation scenarios signals the truncation notice while preserving the decision/summary block.
- Update `tests/github-messages.test.mjs` to cover the new helper behavior (full body, truncated body) and remove expectations tied to the legacy templates.

## Assumptions & Open Questions
- Posting the full `review.md` as an issue comment for PASS decisions is acceptable and keeps downstream automation unchanged; no additional approval review is required.
- GitHub’s effective body limit remains ≥ 65k characters, so a 60k cap continues to provide buffer after adding the footer/truncation notice.
- Repository-specific overrides under `.factory/messages/**` either already match the new token set or will intentionally fall back to the built-in default.
- Emoji vocabulary (`✅`, `❌`, `📝`, `🚨`, `⚠️`, `🧭`) aligns with prior messaging updates; if product prefers different symbols, they will supply replacements.

## Out of Scope
- Changing how `review.json` is generated or validated beyond the traceability emoji update.
- Introducing per-finding inline review comments or file annotations.
- Altering the repair loop trigger semantics for REQUEST_CHANGES decisions.
