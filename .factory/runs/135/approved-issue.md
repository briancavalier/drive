## Problem statement
Factory review comments are currently rendered by prepending a structured `Factory Review` header and then appending the full normalized `review.md`. That composition causes duplicated Traceability, leaks the raw `decision: pass` line into the published review, and leaves the Summary, blocking findings, and non-blocking notes as plain markdown instead of collapsible sections. The review output posted on PR #134 shows all three defects in a single comment.

## Goals
- Render GitHub review comments and request-changes bodies from a curated composition instead of `header + full review.md`.
- Eliminate duplicate `🧭 Traceability` output so published reviews contain exactly one canonical traceability block.
- Remove raw `decision: pass` / `decision: request_changes` lines from published review bodies.
- Make the Summary, blocking findings, and non-blocking notes sections collapsible via `<details>/<summary>` in the published GitHub output.
- Preserve the existing top-level `Factory Review` metadata header with decision, methodology, counts, and artifact links.
- Keep `review.md` and `review.json` as durable artifacts while making the conversation rendering resilient to legacy or drifted markdown content.

## Non-goals
- Changing the `review.json` schema or traceability contract.
- Redesigning the review methodology or the review-stage decision rules.
- Reworking artifact links, PR dashboard rendering, or non-review GitHub comments.
- Changing the durable `review.md` artifact format beyond what is already required by the current prompt and normalization rules.
- Broad UI polish outside the specific review comment/review-body rendering issues described above.

## Constraints
- The published review body must continue to be generated inside the existing `process-review.mjs` and `github-messages.mjs` flow.
- Canonical traceability must still come from `review.requirement_checks`, not from hand-authored markdown in `review.md`.
- The solution should tolerate legacy `review.md` content that still contains a decision line, methodology prose, or an extra traceability block.
- Truncation behavior must remain safe under GitHub body limits and should continue to anchor around the single canonical traceability section.
- PASS issue comments and REQUEST_CHANGES review bodies should use the same composition model so they do not drift.

## Acceptance criteria
- `buildReviewConversationBody()` no longer appends the full normalized `review.md` after the `Factory Review` header.
- Published PASS comments and REQUEST_CHANGES review bodies contain exactly one `🧭 Traceability` `<details>` block.
- Published review bodies do not contain `decision: pass` or `decision: request_changes`.
- Published review bodies render `📝 Summary`, `🚨 Blocking Findings`, and `⚠️ Non-Blocking Notes` as collapsible `<details>` sections.
- The renderer extracts only the intended narrative sections from `review.md` and ignores decision text, manual methodology lines, and manual traceability blocks.
- Unit and process-level tests cover the PR #134 regression shape and fail if duplication or raw decision text reappears.

## Risk
- If the section extraction is too strict, the published review may drop useful reviewer-authored narrative from `review.md`.
- If the parser is too loose, legacy traceability or decision text could still leak into the final GitHub body.
- Truncation logic could regress if it is updated against the new composed structure without preserving current body-size guarantees.
- PASS and REQUEST_CHANGES paths could drift again if they do not share the same final composition helper.
- This touches factory review output, so regressions would affect every automated review comment and GitHub review body.

## Affected area
CI / Automation
