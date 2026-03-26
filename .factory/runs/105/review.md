Request changes · Method: `default`

📝 Summary
- The branch does not implement the requested factory review template and rendering changes described in `.factory/runs/105/spec.md` and `.factory/runs/105/plan.md`.
- Key deliverables remaining: update both `review-pass-comment.md` and `review-request-changes.md` to the new dashboard-first layout; refactor `buildReviewConversationBody` to accept the normalized review payload and render the new top-level `## Factory Review` block; and flatten traceability output to a single `<details>` wrapper.

🚨 blocking findings
- Templates still use the legacy layout (missing dashboard-first summary block): `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` remain in the old format and must be replaced with the shared layout described in the spec. Evidence: `scripts/templates/github-messages/review-pass-comment.md:1-4`, `scripts/templates/github-messages/review-request-changes.md:1-30`.

- Traceability rendering produces nested `<details>` blocks instead of a single flattened `<details>` wrapper. The current implementation `renderCanonicalTraceabilityMarkdown` builds one `<details>` per requirement group. Evidence: `scripts/lib/review-output.mjs:1-200` (function `renderCanonicalTraceabilityMarkdown`).

- The message assembly function was not refactored to accept the parsed `review.json` payload or to render the new `Factory Review` summary block. `buildReviewConversationBody` still only accepts `reviewMarkdown` and `artifactsPath` and appends the legacy artifacts footer. Evidence: `scripts/lib/github-messages.mjs:860-1020` (function `buildReviewConversationBody`).

- Authoring prompt still instructs reviewers to include methodology manually in `review.md`, which would duplicate the methodology once the new summary block exists. Evidence: `.factory/prompts/review.md:1-80` (includes instruction: "Include the methodology used (`{{METHODOLOGY_NAME}}`)").

⚠️ non-blocking notes
- Tests and snapshots likely need updates to reflect the new templates and rendering; current tests reference the old template bodies (e.g., `tests/github-messages.test.mjs` references template expectations). Evidence: `tests/github-messages.test.mjs:1-120`.
- A `repair-log.md` was referenced by the prompt and spec but no `repair-log.md` file exists at `.factory/runs/105/repair-log.md` in this run; if the acceptance flow depends on it, add or document it. Evidence: `.factory/runs/105/` listing (no `repair-log.md`).

Methodology
- Applied methodology: `default`.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 3)</summary>

- ❌ **Not satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md:1-4 (still contains legacy 'Autonomous review completed' line)
  - **Evidence:** scripts/lib/github-messages.mjs:897-1020 (buildReviewConversationBody appends legacy artifacts footer and does not accept review.json payload)
- ❌ **Not satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md:1-30 (still the legacy long-form layout with blocking lists and full review details)
  - **Evidence:** scripts/lib/review-output.mjs:1-220 (rendering helpers produce nested details and full-review blocks)
- ❌ **Not satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** scripts/lib/review-output.mjs:1-120 (function renderCanonicalTraceabilityMarkdown emits multiple <details> blocks rather than one flattened <details>)

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (❌ 1)</summary>

- ❌ **Not satisfied**: Update authoring prompt to omit manual methodology instruction
  - **Evidence:** .factory/prompts/review.md:1-80 (still instructs reviewers to 'Include the methodology used')

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (❌ 1)</summary>

- ❌ **Not satisfied**: Refactor buildReviewConversationBody to accept normalized review payload and render new Factory Review summary block
  - **Evidence:** scripts/lib/github-messages.mjs:860-1020 (current function signature: { reviewMarkdown, artifactsPath, maxBodyChars } without review payload)
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md:1-4 (templates still expect legacy assembled footer)

</details>
