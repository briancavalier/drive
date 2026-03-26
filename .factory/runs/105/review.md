decision: request_changes

📝 Summary
- Methodology: `default`
- Decision: REQUEST_CHANGES — the branch does not yet implement the target review-template layout nor the related traceability/prompt changes described in the spec and acceptance tests.

🚨 blocking findings
- Templates not updated: `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` remain in the legacy layout (legacy banner, duplicated summary/footer). This fails the acceptance requirement to add a top-level `## Factory Review` block with bold `Summary`, `Findings`, and `Artifacts` lines and to keep PASS/REQUEST_CHANGES aligned.
- Traceability rendering still uses nested `<details>` blocks (one per requirement group) in `scripts/lib/review-output.mjs::renderCanonicalTraceabilityMarkdown`. Acceptance requires a single `<details>` wrapper with flat subsections.
- Review authoring prompt still instructs reviewers to include the methodology line in `review.md` (`.factory/prompts/review.md`), which would cause duplication once the summary block injects the method automatically.
- Missing artifact: `.factory/runs/105/repair-log.md` is not present in the run artifacts; acceptance and artifact-index expect this file to exist.
- Tests not updated: repository tests and templates do not appear to assert the new `Factory Review` summary block or the flattened traceability layout (tests referencing `Traceability` remain but do not check the new top summary layout). The plan required rebaselining tests to the new format.

⚠️ non-blocking notes
- CI evidence shows unit tests and linters passing, but that CI result alone does not demonstrate the layout changes were implemented or tested.
- Validate truncation behavior (message length) after removing the legacy footer; ensure `buildReviewConversationBody` anchors/handles the new summary block for truncation scenarios.
- Confirm artifact URLs resolve correctly when the branch is published (the templates rely on repository/branch path formatting).

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 3)</summary>

- ❌ **Not satisfied**: The default factory review templates are updated to the target structure with bold labels in the summary block (PASS and REQUEST_CHANGES), and the top block clearly shows decision, method, summary, findings counts, and artifacts.
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md contains legacy banner 'Autonomous review completed' and a plain 'Summary:' token.
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md contains legacy layout and trailing artifacts/footer tokens.
- ❌ **Not satisfied**: Both PASS and REQUEST_CHANGES review templates use the same visible section headings and ordering.
  - **Evidence:** File content mismatch between scripts/templates/github-messages/review-pass-comment.md and scripts/templates/github-messages/review-request-changes.md (different headings and ordering).
- ❌ **Not satisfied**: The top traceability block renders as a single <details> wrapper with flat subsections (no nested <details> blocks).
  - **Evidence:** scripts/lib/review-output.mjs::renderCanonicalTraceabilityMarkdown currently emits multiple '<details>' elements (one per requirement group).

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (❌ 1)</summary>

- ❌ **Not satisfied**: Review authoring guidance (.factory/prompts/review.md) omits manual methodology instruction and clarifies traceability is injected automatically.
  - **Evidence:** .factory/prompts/review.md contains the instruction 'Include the methodology used ({{METHODOLOGY_NAME}}).' which asks reviewers to add methodology into review.md.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (❌ 2)</summary>

- ❌ **Not satisfied**: All acceptance-test-related tests updated to assert the new summary block, flattened traceability, and template layout.
  - **Evidence:** Repository tests do not include assertions for '## Factory Review' or the flattened traceability; tests/search returned no matches for 'Factory Review'.
  - **Evidence:** CI evidence: workflow run id 23614632266 shows 'unit: success', 'factory-artifact-guard: success', 'actionlint: success' but does not indicate tests for the new layout were added.
- ❌ **Not satisfied**: A repair-log (.factory/runs/105/repair-log.md) is provided as an artifact for this run.
  - **Evidence:** Directory listing for .factory/runs/105 does not include repair-log.md (ls output shows review.md and review.json but no repair-log.md).

</details>
