decision: pass

📝 Summary
- Methodology: `default`.
- The change updates `renderInterventionQuestionComment` in `scripts/lib/github-messages.mjs` to produce the dashboard-style compact header block and the `### Answer With` section with fenced `/factory answer` commands, preserving the serialized `<!-- factory-question: ... -->` metadata.
- Unit tests in `tests/github-messages.test.mjs` were updated to lock the new layout and exercise full-header, missing-option, no-answers, unknown-effect, detail-absent, and minimal-header cases. The test suite for the repo (CI workflow id `23441794083`) shows `unit: success` and the updated tests pass locally in the run.

🚨 blocking findings
- None. All acceptance criteria from `.factory/runs/106/acceptance-tests.md` are covered by unit tests and the implementation matches the spec. CI evidence shows the unit tests succeeded.

⚠️ non-blocking notes
- Consider adding a focused unit test for the run-link-only case (where `runUrl` is present but `runId` is empty) to explicitly assert the exact run-link formatting branch in `renderInterventionQuestionComment`.
- Consider adding a short changelog note or one-line comment in `scripts/lib/github-messages.mjs` referencing the spec change for future maintainers.

Methodology: `default`

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (✅ 3)</summary>

- ✅ **Satisfied**: Full header and details
  - **Evidence:** tests/github-messages.test.mjs: test 'renderInterventionQuestionComment renders concise header with per-option fences' asserts header lines, recommended option, run link, fenced code blocks, and metadata comment.
  - **Evidence:** scripts/lib/github-messages.mjs: implementation constructs header lines including human-action line, optional Summary, Question ID, Recommended, and Run link, followed by '### Answer With' and per-option fenced blocks.
  - **Evidence:** CI workflow 23441794083: unit tests succeeded (unit: success).
- ✅ **Satisfied**: Missing optional values
  - **Evidence:** tests/github-messages.test.mjs: test 'renderInterventionQuestionComment handles missing optional values' asserts absent Summary/Recommended/Run and presence of '_No answers available._' and metadata.
  - **Evidence:** scripts/lib/github-messages.mjs: code omits lines when summary/recommended/run are empty and preserves spacing rules via final filter to remove consecutive blank lines.
- ✅ **Satisfied**: No available answers
  - **Evidence:** tests/github-messages.test.mjs: test 'renderInterventionQuestionComment handles missing optional values' includes an options-empty case and asserts '_No answers available._'.
  - **Evidence:** scripts/lib/github-messages.mjs: branch that pushes '_No answers available._' when options.length is 0.

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Preserve serialized metadata comment and option ordering
  - **Evidence:** tests/github-messages.test.mjs: metadata JSON parsed and validated in tests (checks id, type, version, status, optionIds ordering).
  - **Evidence:** scripts/lib/github-messages.mjs: metadata built via JSON.stringify({ id, type, version, status, optionIds }) and appended as '<!-- factory-question: ... -->'.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 1)</summary>

- ✅ **Satisfied**: Update `renderInterventionQuestionComment` and unit tests to assert new layout
  - **Evidence:** git diff (last commit) shows changes to 'scripts/lib/github-messages.mjs' and 'tests/github-messages.test.mjs'.
  - **Evidence:** tests/github-messages.test.mjs: multiple new/updated tests asserting new header and answer layout.

</details>
