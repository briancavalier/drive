REQUEST_CHANGES

📝 Summary
- The branch does not implement the changes described in `.factory/runs/105/spec.md` and the implementation plan. The GitHub message templates (`scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md`), the review-output helpers, and the review authoring prompt were expected to be updated to render a new `## Factory Review` dashboard-first header, but they remain in their legacy form. The `buildReviewConversationBody` helper still appends the old artifacts footer and lacks the new rendering behavior.

🚨 blocking findings
- Templates not updated: `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` still contain the legacy banner/footer and do not implement the target `## Factory Review` header and bold summary block required by the spec.
- Conversation body helper unchanged: `scripts/lib/github-messages.mjs` still uses the legacy artifacts footer and truncation anchoring logic (`Artifacts: \`<artifactsPath>/review.md\``) instead of rendering the new dashboard-style summary block from parsed `review.json`.
- Authoring prompt not revised: `.factory/prompts/review.md` still instructs reviewers to "include the methodology inside `review.md`", which conflicts with the spec's requirement that the methodology be rendered automatically in the new summary block.

⚠️ non-blocking notes
- Tests and snapshots were not updated to assert the new layout; please update `tests/github-messages.test.mjs` and related snapshots to validate the new PASS and REQUEST_CHANGES bodies and truncation behavior.
- CI passing (unit tests) is useful, but it does not substitute for the acceptance-test changes requested in the run; add focused tests that assert the presence of `## Factory Review`, the bold `Summary`, `Findings`, and `Artifacts` lines, and the single `<details>` `🧭 Traceability` block.
- Consider adding a small integration test that renders the new template with a sample `review.json` payload to catch formatting regressions early.

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 3)</summary>

- ❌ **Not satisfied**: The default factory review templates are updated to the target structure with bold labels in the summary block.
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md: line 1 contains '✅ Autonomous review completed with decision **PASS**', indicating the legacy banner is still present.
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md: file contains legacy 'Autonomous review decision: REQUEST_CHANGES (methodology: {{REVIEW_METHOD}})' and trailing artifact/footer tokens, not the target '## Factory Review' header.
- ❌ **Not satisfied**: Both PASS and REQUEST_CHANGES templates use the same visible section headings and ordering.
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md: uses a single-line PASS banner and 'Artifacts: `...`' inline path rather than the shared dashboard block.
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md: contains multiple sections (Blocking findings, Unmet requirement checks, Full review details) and differs in visible ordering from PASS template.
- ❌ **Not satisfied**: Review authoring guidance omits manual methodology instruction and clarifies traceability is embedded automatically as a single block.
  - **Evidence:** .factory/prompts/review.md: still instructs reviewers to 'include the methodology inside review.md' (line referencing methodology instruction).
  - **Evidence:** Acceptance tests in .factory/runs/105/acceptance-tests.md expect the prompt to be revised, but the prompt file is unchanged.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (❌ 1)</summary>

- ❌ **Not satisfied**: Refactor buildReviewConversationBody to accept parsed review.json and render the new Factory Review summary, and remove the legacy artifacts footer.
  - **Evidence:** scripts/lib/github-messages.mjs: function 'buildReviewConversationBody' (lines ~897) builds a footer string '

—
Artifacts: `review.md`' and appends it to the review body, showing the old behavior.
  - **Evidence:** rg output / git show for the current commit c00f9134b01c27ad3e08fbd96a6822140d2a0174: only '.factory/runs/105/cost-summary.json' and usage-event files were modified in the last commit, indicating the implementation files were not changed in this branch.

</details>
