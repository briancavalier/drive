# Factory Review Template Refresh Specification

## Summary
- Introduce a shared `## Factory Review` header for PASS and REQUEST_CHANGES delivery that surfaces decision, methodology, key counts, and direct artifact links while keeping `review.md` as the authoritative narrative.
- Replace the legacy mixed-format review comments with a compact summary block plus collapsible deep detail, eliminating duplicated methodology/summary/artifact sections and aligning both decisions to the same visible structure.
- Update traceability rendering and reviewer guidance so methodology only appears in the new header, `Traceability` uses a single flat `<details>` disclosure, and the posted body stays byte-for-byte aligned with `review.md` apart from the new framing.

## Current Behavior
- `scripts/lib/github-messages.mjs#buildReviewConversationBody` posts `review.md` verbatim with a trailing ``—`` footer that repeats artifact paths as inline code, without any dashboard-style summary or clickable links.
- PASS and REQUEST_CHANGES templates under `scripts/templates/github-messages/` still contain the legacy `Autonomous review…` lines, duplicated `Summary:` labels, standalone artifact lists, and (for REQUEST_CHANGES) an extra `Full Review` section.
- Traceability emitted by `renderCanonicalTraceabilityMarkdown` nests multiple `<details>` elements (`<summary>🧭 Traceability: …</summary>` per requirement group), so the posted review body never presents the single collapsible block requested in the issue.
- `.factory/prompts/review.md` tells reviewers to include the methodology inside `review.md`, which guarantees duplication once the control plane also prints the method in the new top section.

## Proposed Changes

### Review Comment Layout
- Extend `buildReviewConversationBody` to accept the validated `review` payload plus repository context so it can render a `Factory Review` header before appending the canonical `review.md` content.
- Render the header from updated templates `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` that share the same shape:
  - line 1: `## Factory Review`
  - line 3: `**{{DECISION_DISPLAY}}** · Method: \`{{REVIEW_METHOD}}\``
  - blank line between the decision line and the bold summary block to satisfy the readability requirement.
  - bold lines for `Summary`, `Findings`, and `Artifacts`, where `Findings` echoes blocking and unmet-requirement counts and `Artifacts` links to `review.md` / `review.json`.
- After the summary block, emit `### Blocking Findings` and `### Requirement Gaps` sections populated via `renderBlockingFindingsSummary` and a new unmet-requirement helper. These summaries act as a quick scan layer before the full `review.md`.
- Keep PASS and REQUEST_CHANGES templates identical except that the REQUEST_CHANGES version injects `{{FULL_BLOCKING_FINDINGS_DETAILS}}`, allowing deep blocking evidence inside a single `<details>` block labelled “Blocking finding details”.
- Convert the posted body to `header + summaries + traceability block + review.md`, removing the trailing `— Artifacts:` footer and any legacy `Autonomous review…` or plain `Summary:` lines.

### Artifact Linking & Truncation
- Derive artifact URLs with `buildArtifactLinks` using either `FACTORY_REPOSITORY_URL` or the GitHub Actions `GITHUB_SERVER_URL/GITHUB_REPOSITORY` fallback plus `FACTORY_BRANCH`. Fall back to relative paths when no remote URL is present so Markdown links remain clickable.
- Update truncation handling to operate on the full framed body and alter the notice to `**Review truncated after traceability details. See [review.md](…) for the full report.**`, reusing the clickable `review.md` link.
- Preserve the existing traceability-based truncation strategy so the dashboard header and summaries always remain visible; ensure the truncation path still appends `review.md` once under the size limit.

### Traceability & Detail Rendering
- Replace `renderCanonicalTraceabilityMarkdown` with a single `<details>` block whose `<summary>` is `🧭 Traceability`. Inside, render grouped sections as `### <label> (<counts>)` followed by bullet evidence—no nested `<details>` elements or repeated headings.
- Add a helper that returns only the inner body (`TRACEABILITY_FLAT_DETAILS`) for reuse by the GitHub comment templates, guaranteeing that both the posted review and normalized `review.md` share the same structure.
- Adjust `renderTraceabilityDetails` and `renderFullBlockingFindingsDetails` to match the new summary labels (e.g., “Blocking finding details”) and keep the detail blocks collapsible.

### Review Authoring Guidance
- Edit `.factory/prompts/review.md` to drop the requirement that reviewers restate the methodology inside `review.md`, clarifying that the control plane surfaces it in the Factory Review header.
- Leave the mandated section order (decision, `📝` Summary, `🚨` blocking, `⚠️` non-blocking) intact so the appended `review.md` continues to match historical expectations.

### Testing & Validation
- Refresh `tests/process-review.test.mjs` fixtures to expect the new header, bold summary lines, clickable artifact links, absence of legacy strings, and consistent layout for both decision paths (including blocking-detail collapsibles for REQUEST_CHANGES).
- Update `tests/github-messages.test.mjs` to assert the framed body begins with `## Factory Review`, keeps the blank line before the summary block, produces the flattened traceability disclosure, and uses the new truncation notice.
- Ensure any override-related tests cover the new token set (e.g., `DECISION_DISPLAY`, `REVIEW_MARKDOWN_URL`) and confirm overrides that do not include required tokens fall back to the defaults.

## Assumptions & Open Questions
- The automation has access to either `FACTORY_REPOSITORY_URL` or the GitHub Actions environment variables needed to build blob URLs; if neither is present the plan relies on Markdown-relative links.
- `review.md` continues to be appended verbatim after the new framing; no changes are required to its canonical heading order beyond the methodology guidance.
- Existing repositories are not depending on the deprecated `Full Review` or legacy artifact footers in downstream automation.

## Out of Scope
- Changing the schema or validation rules for `review.json`.
- Altering repair-loop triggers, slash commands, or dashboard templates outside the review comment itself.
- Introducing new dashboard sections or modifying the PR body layout.

## Risks & Mitigations
- **Formatting regressions**: Differences in whitespace or headings could make comparisons noisy. Mitigation: keep templates deterministic and cover both decisions in automated tests.
- **Broken artifact links**: Missing repository context would produce empty URLs. Mitigation: detect empty context, fall back to relative links, and cover both code paths in unit tests.
- **Override drift**: Existing overrides might reference removed tokens. Mitigation: rely on the existing template validation to fall back to defaults and document the new token set in test fixtures.
