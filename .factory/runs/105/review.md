request_changes · Method: `default`

**📝 Summary**
- The branch implements a spec to rework the Factory Review comment templates and traceability rendering to a dashboard-first layout. I evaluated the code, templates, review-output helpers, authoring prompt, and test/CI evidence against the approved spec and acceptance tests.
- Outcome: Request changes — multiple acceptance criteria are not satisfied. See blocking findings below for concrete fixes.

**🚨 Blocking Findings**
- PASS and REQUEST_CHANGES GitHub message templates remain in the legacy layout and still include the old summary/footer tokens; they were not updated to the new `## Factory Review` header and compact summary block. See `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md`.
- Traceability rendering still emits multiple `<details>` blocks (one per requirement type) rather than a single `<details>` wrapper with flat subsections. See `scripts/lib/review-output.mjs:renderCanonicalTraceabilityMarkdown`.
- Review authoring prompt still instructs reviewers to include the methodology line inside `review.md`, which would duplicate the methodology once the new summary block renders it; see `.factory/prompts/review.md`.

**⚠️ Non-Blocking Notes**
- Unit tests and CI passed (workflow run id: `23614227503`, unit: success, actionlint: success), which indicates existing behavior is stable but does not demonstrate the new template/layout changes required by the acceptance criteria.
- Tests and rendering helpers (e.g., `tests/process-review.test.mjs` and `scripts/lib/review-output.mjs`) will need coordinated updates to adopt the single-details traceability model and the new summary tokens. Update the tests after applying code/template changes to avoid snapshot drift.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 4)</summary>

- ❌ **Not satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md contains legacy banner: "✅ Autonomous review completed with decision **PASS**"
  - **Evidence:** tests/process-review.test.mjs expects the review body to contain '## 🧭 Traceability' but no test asserts the new '## Factory Review' header; templates were not updated to the new summary block.
- ❌ **Not satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md shows legacy layout and tokens (includes '{{FULL_REVIEW_DETAILS}}' and a trailing 'Artifacts:' section).
  - **Evidence:** No template matching the target '## Factory Review' summary block was found in 'scripts/templates/github-messages/'.
- ❌ **Not satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** scripts/lib/review-output.mjs:renderCanonicalTraceabilityMarkdown currently emits one <details> per requirement group (nested details), not a single flattened <details> wrapper.
  - **Evidence:** tests/review-artifacts.test.mjs and tests/process-review.test.mjs continue to exercise the existing multi-<details> rendering behavior.
- ❌ **Not satisfied**: Review authoring guidance omits manual methodology instruction
  - **Evidence:** .factory/prompts/review.md still instructs reviewers to include the methodology line inside review.md (the prompt contains: 'Include the methodology used ({{METHODOLOGY_NAME}})').
  - **Evidence:** No change to .factory/prompts/review.md observed in the working tree to remove the manual methodology instruction.

</details>
