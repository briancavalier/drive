# Spec: Dashboard-Style Factory Review Comments

## Overview
Factory-generated pull request reviews should adopt the same scan-friendly, dashboard-first layout already used in PR descriptions. The PASS and REQUEST_CHANGES comment templates will be refactored to show a compact summary block up front, followed by collapsible detail sections for supporting evidence. The automation that assembles and posts review comments will render these templates with data pulled from `review.json` and `review.md`, ensuring consistent wording and artifact links across outcomes.

## Template Structure
- Shared visible headings for both decisions:
  1. `## Factory Review`
  2. Compact summary block with decision, methodology, review summary line, findings counts, and artifact paths.
  3. `### Blocking Findings`
  4. `### Requirement Gaps`
  5. Collapsible `<details>` sections for deeper content.
- Decision line uses emoji + label (✅ PASS / ❌ REQUEST_CHANGES) followed by ``Method: `<method>` ``.
- Findings summary displays blocking and unmet requirement counts computed from `review.json`.
- Artifact line links to both `review.md` and `review.json` under the current run path.
- Detail sections:
  - `{{BLOCKING_FINDINGS_SUMMARY}}` and `{{UNMET_REQUIREMENT_CHECKS_SUMMARY}}` render bullet lists with "- None recorded in review.json." when empty.
  - `{{TRACEABILITY_DETAILS}}` renders a `<details>` element containing canonical traceability groups.
  - `{{FULL_REVIEW_DETAILS}}` wraps the entire `review.md` content in a `<details>` element labelled “Full review.md”.
  - For REQUEST_CHANGES, include `{{FULL_BLOCKING_FINDINGS_DETAILS}}` `<details>` element to surface full blocking finding write-ups.

## Rendering Logic
- Extend `buildReviewConversationBody` to render the new templates via `renderMessage`, supplying tokens for the summary block and detail sections.
- Pass the validated `review` payload, `reviewMarkdown`, and the artifacts directory so token values can be derived without re-reading artifacts.
- Supported tokens (available to overrides):
  - `REVIEW_DECISION_EMOJI`, `REVIEW_DECISION_LABEL`, `REVIEW_METHOD`, `REVIEW_SUMMARY`
  - `BLOCKING_FINDINGS_COUNT`, `UNMET_REQUIREMENT_CHECKS_COUNT`
  - `REVIEW_MARKDOWN_PATH`, `REVIEW_JSON_PATH`
  - `BLOCKING_FINDINGS_SUMMARY`, `UNMET_REQUIREMENT_CHECKS_SUMMARY`
  - `TRACEABILITY_DETAILS`, `FULL_BLOCKING_FINDINGS_DETAILS`, `FULL_REVIEW_DETAILS`
- Preserve mention of artifact paths even when detail sections are omitted.

## Length Management
- Keep existing `maxBodyChars` guard: attempt full template first, then progressively drop optional detail sections (full review details, blocking finding expansions, traceability) while keeping the summary block intact.
- If trimming still exceeds the limit, fall back to a shortened body containing the compact summary block plus a truncation notice pointing operators back to `review.md`.

## Assumptions
- `loadValidatedReviewArtifacts` already guarantees consistent `review.json` schema; no additional validation is required.
- Consumer workflows expect artifact paths formatted as inline code (backticks) instead of markdown links.
- Factory overrides will continue to live under `.factory/messages/`; supplying the expanded token set preserves compatibility for custom templates.
