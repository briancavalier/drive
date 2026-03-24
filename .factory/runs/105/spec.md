# Factory Review Template Refinement (Run 105)

## Overview
- Reframe the GitHub review comment that the factory posts so the first screen shows a compact `Factory Review` summary with decision, methodology, findings counts, and artifact links.
- Remove redundant legacy framing below the summary while keeping the durable `review.md` content as the authoritative body beneath the new block.
- Flatten traceability rendering to a single collapsible section and update authoring guidance so methodology only appears in the new summary block.

## Current Behavior
- The PASS template (`scripts/templates/github-messages/review-pass-comment.md:1`) renders the legacy “Autonomous review completed...” line, repeats the summary as plain text, and exposes only `review.md` as a static path string.
- The REQUEST_CHANGES template (`scripts/templates/github-messages/review-request-changes.md:1`) repeats decision, summary, artifact lists, and appends `{{FULL_REVIEW_DETAILS}}`, producing a long first screen.
- `buildReviewConversationBody` (`scripts/lib/github-messages.mjs:900`) simply appends the raw `review.md` plus a trailing ``Artifacts: `…/review.md` `` footer, so the posted body lacks any dashboard-style framing and duplicates method and artifact data elsewhere in the comment.
- Canonical traceability (`renderCanonicalTraceabilityMarkdown` in `scripts/lib/review-output.mjs:91`) emits nested `<details>` blocks under a `## 🧭 Traceability` heading, creating an extra disclosure layer that conflicts with the requested single `<details>` wrapper.
- The review prompt (`.factory/prompts/review.md:16`) instructs reviewers to include the methodology inside `review.md`, which would duplicate the method once the new summary block renders it automatically.

## Target Experience
- Both PASS and REQUEST_CHANGES comments start with:
  - `## Factory Review`
  - A decision/method line: `**✅ PASS** · Method: \`workflow-safety\`` (or ❌ for changes), followed by a blank line.
  - Bold summary block lines for `Summary`, `Findings` (`Blocking {{count}} · Requirement gaps {{count}}`), and `Artifacts` (Markdown links to `review.md` and `review.json`).
  - Shared `### Blocking Findings` and `### Requirement Gaps` sections populated from `review.json`.
  - A single `<details>` block with `<summary>🧭 Traceability</summary>` that contains flat subsections for each requirement type.
- No legacy “Autonomous review…” banner, no duplicated plain summary line, and no trailing artifact footer or `Full Review` section appear after the new block.
- The remainder of the comment matches the canonical `review.md` so operators can rely on the artifact as the single source of truth.

## Detailed Changes
- Replace the PASS and REQUEST_CHANGES template bodies with the target layout, introducing tokens for decision label/icon, findings counts, artifact URLs, and the flattened traceability content (`{{TRACEABILITY_FLAT_DETAILS}}`). Ensure both templates stay structurally identical aside from decision glyphs and the optional full blocking findings details block in REQUEST_CHANGES.
- Extend `buildReviewConversationBody` to accept the parsed `review.json` payload alongside `review.md`, render the new `Factory Review` header (including clickable artifact URLs derived from repository/branch context), and then append the exact `review.md` content without adding the old footer. Preserve truncation handling by anchoring on the new traceability `<summary>`.
- Update `renderBlockingFindingsSummary`, `renderUnmetRequirementChecksSummary`, and related helpers as needed so empty sections render concise “None.” bullets while still respecting the new headings.
- Replace `renderCanonicalTraceabilityMarkdown` with a generator that emits a single `<details>` wrapper containing Markdown subsections (e.g., `#### Acceptance Criteria (✅ 3)`) for each requirement group. Adjust any helper that previously returned nested `<details>` (`renderTraceabilityDetails`, `renderFullReviewDetails`) so they align with the flattened structure or are removed if the template no longer needs them.
- Remove usage of the old `Artifacts` footer and `Full review.md` detail block from comment assembly and clean up any now-unused helpers.
- Update the review authoring prompt (`.factory/prompts/review.md`) so it stops instructing reviewers to restate the methodology and clarifies that traceability is injected automatically as a single block.

## Testing & Validation
- Refresh `tests/github-messages.test.mjs` expectations to assert the new summary block, artifact links, flattened traceability, and absence of the legacy footer for both PASS and REQUEST_CHANGES cases (including truncation scenarios).
- Update `tests/process-review.test.mjs` snapshots and string assertions to match the reworked comment body and ensure both decisions route through the shared `Factory Review` header.
- Adjust any fixtures or helpers that construct canonical `review.md` content (e.g., `tests/review-artifacts.test.mjs`, `tests/prepare-stage-push.test.mjs`) so their traceability sections use the new single `<details>` format.

## Assumptions & Open Questions
- The existing `review.json` schema provides everything needed to populate counts and summaries; no schema changes are required.
- Artifact URLs will continue to follow the existing `repositoryUrl/blob/<branch>/<artifactsPath>` pattern; no permalink changes are in scope.
- Truncation limits in `buildReviewConversationBody` remain sufficient once the old footer is removed; if the new layout impacts limits, we will adjust during implementation.
