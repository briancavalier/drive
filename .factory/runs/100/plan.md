# Implementation Plan – Run 100

- Update `scripts/lib/github-messages.mjs` to refactor `renderInterventionQuestionComment`:
  - Build a condensed summary block that surfaces `intervention.summary`, ID, stage, and optional recommended option.
  - Inline the optional prompt (`payload.question`) ahead of the answer list when present.
  - Generate per-option sections that pair a bold label and human outcome hint with individual `text` code fences.
  - Defer verbose context into a `<details>` block only when `intervention.detail` is non-empty, keeping the hidden metadata untouched.
  - Introduce or reuse a small helper to derive effect descriptions for known `option.effect` values without impacting other callers.
- Adjust supporting utilities if needed (e.g., option normalization in `scripts/lib/intervention-state.mjs`) to expose effect labels while keeping existing APIs stable.
- Refresh `tests/github-messages.test.mjs`:
  - Rebaseline the comment-structure snapshot assertions to match the new Markdown layout.
  - Add coverage for multiple answer fences, absence of the old options list, presence/absence of context block, and fallback behavior when `recommendedOptionId` or `option.effect` are missing.
- Execute `npm test -- tests/github-messages.test.mjs` (and broader suites if required by cascading changes) to confirm the renderer updates keep passing.
