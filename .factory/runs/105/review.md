REQUEST_CHANGES · Methodology: `default`

📝 Summary
- The change submits spec/plan/acceptance artifacts describing the intended template and helper refactors but does not implement them. The repository still contains the legacy review templates and helper implementations that produce the old banner/footer and nested traceability `<details>` blocks. Tests and template files required by the acceptance criteria were not updated.

🚨 blocking findings
- Legacy templates remain unchanged: `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` still contain the legacy banner/footer and token layout rather than the new `## Factory Review` summary block. See file heads (lines shown in repo). 

- Core helpers not updated: `scripts/lib/review-output.mjs` still renders per-group `<details>` blocks in `renderCanonicalTraceabilityMarkdown` (nested details) instead of a single `<details>` wrapper containing flattened subsections. This violates the Traceability acceptance test.

- Conversation builder still appends legacy artifact footer: `scripts/lib/github-messages.mjs` `buildReviewConversationBody` still constructs a trailing `Artifacts: \`.../review.md\`` footer instead of rendering the new Factory Review header and artifact links in the top summary.

- Authoring prompt not updated: `.factory/prompts/review.md` continues to instruct reviewers to include the methodology line in `review.md`, which will duplicate the methodology once the new summary block injects it automatically.

⚠️ non-blocking notes
- CI/unit tests (workflow run id: 23614012071) report success; however, tests do not currently assert the new layout. Update test expectations (`tests/github-messages.test.mjs`, `tests/process-review.test.mjs`, and related snapshots) as planned so CI verifies the new summary block, artifact links, and flattened traceability.
- Consider validating truncation behavior after template/footer removal to ensure comment body limits are still honored and that the new anchor/truncation point is correct.

Methodology: `default`

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 3)</summary>

- ❌ **Not satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md:1 contains legacy banner 'Autonomous review completed with decision **PASS**' (file shows old format)
  - **Evidence:** git diff origin/main...HEAD shows only .factory artifacts were added; templates were not changed: A .factory/runs/105/* (no changes to scripts/templates).
- ❌ **Not satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md:1-8 contains legacy layout (listing 'Summary', 'Blocking findings:', 'Artifacts:')
  - **Evidence:** rg '## Factory Review' found no matches in templates or tests; new header not present in templates.
- ❌ **Not satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** scripts/lib/review-output.mjs: export function renderCanonicalTraceabilityMarkdown produces multiple '<details>' blocks (per-group) rather than a single '<details>' wrapper.
  - **Evidence:** scripts/lib/review-artifacts.mjs and scripts/lib/review-output.mjs still call renderCanonicalTraceabilityMarkdown (no flattening change present).

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (❌ 2)</summary>

- ❌ **Not satisfied**: buildReviewConversationBody renders new Factory Review header and removes legacy artifacts footer
  - **Evidence:** scripts/lib/github-messages.mjs: buildReviewConversationBody constructs a footer '

—
Artifacts: `.../review.md`' and appends it to review.md; it does not render the new Factory Review header or inject artifacts as links in the top block.
  - **Evidence:** git diff origin/main...HEAD shows no modifications to scripts/lib/github-messages.mjs in this branch.
- ❌ **Not satisfied**: Review authoring guidance omits manual methodology instruction
  - **Evidence:** .factory/prompts/review.md: the prompt still instructs 'Apply the active methodology `{{METHODOLOGY_NAME}}`' and 'Include the methodology used ({{METHODOLOGY_NAME}})' in the review.md, which will duplicate methodology when summary block is injected.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (❌ 1)</summary>

- ❌ **Not satisfied**: Tests updated to assert new comment layout and flattened traceability
  - **Evidence:** git diff origin/main...HEAD shows no updates to test files (tests/github-messages.test.mjs and snapshots remain unchanged).
  - **Evidence:** Repository search for 'Factory Review' returned no matches in tests or templates.

</details>
