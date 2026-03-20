decision: pass

📝 Summary
- The implementation consolidates the previous `Factory Control Panel` and `Status` sections into a single `## Factory Dashboard` as specified.
- The dashboard is rendered as a two-column Markdown table with blank headers and includes rows for State, Owner, Stage, CI, Repairs, Cost, Estimate, and Next.
- Open and Actions link lines, artifact phase groupings, template token changes, and graceful fallbacks are implemented and covered by unit tests. CI unit checks passed (see evidence below).

🚨 blocking findings
- None.

⚠️ non-blocking notes
- Consider adding a lightweight `repair-log.md` artifact (even an empty placeholder) for runs where execution diagnostics exist; its absence is handled gracefully but a placeholder would keep `Execution` artifact lists consistent across runs.
- Update README documentation to call out the new token names (`DASHBOARD_SECTION`, `ARTIFACTS_SECTION`, `OPERATOR_NOTES_SECTION`) near the examples for template overrides (the code enforces validation but documentation will help integrators).

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (✅ 5)</summary>

- ✅ **Satisfied**: Dashboard replaces control panel and status sections (heading and table rows present)
  - **Evidence:** tests/github-messages.test.mjs: 'renderPrBody renders dashboard layout and operator notes' asserts '## Factory Dashboard' and table header rows.
  - **Evidence:** scripts/lib/github-messages.mjs: renderPrBody constructs 'dashboardLines' starting with '## Factory Dashboard' and table markup.
  - **Evidence:** scripts/lib/control-panel.mjs: buildDashboard() returns ordered 'rows' for State, Owner, Stage, CI, Repairs, Cost, Estimate, and Next.
- ✅ **Satisfied**: Open and Actions link grouping (Open and Actions lines render and mutation links marked)
  - **Evidence:** tests/github-messages.test.mjs: asserts '**Open:**' contains review.md and review.json links and '**Actions:**' contains mutation links with '*(state change)*'.
  - **Evidence:** scripts/lib/github-messages.mjs: renderPrBody builds 'openLinks' and 'stateChangeLinks' and appends '*(state change)*' to mutation actions.
- ✅ **Satisfied**: Artifacts grouped by workflow phase (Plan, Execution, Review) with inline links
  - **Evidence:** scripts/lib/control-panel.mjs: buildArtifactGroups() creates Plan/Execution/Review groups and filters out missing links.
  - **Evidence:** tests/github-messages.test.mjs: asserts '## Artifacts' contains '**Plan**', '**Execution**', and '**Review**' lines with inline links in expected format.
- ✅ **Satisfied**: Graceful fallbacks for missing numeric data (Cost, Estimate, Repairs show '—' when missing)
  - **Evidence:** scripts/lib/control-panel.mjs: formatCostDisplay(), formatEstimateDisplay(), and formatRepairsDisplay() implement fallbacks returning '—'.
  - **Evidence:** tests/github-messages.test.mjs: includes tests that verify CI fallback behavior and other fallback cases.
- ✅ **Satisfied**: Template override validation respects new tokens and falls back with a warning when required tokens are missing
  - **Evidence:** scripts/lib/github-messages.mjs: MESSAGE_SPECS updated to require 'DASHBOARD_SECTION', 'ARTIFACTS_SECTION', 'OPERATOR_NOTES_SECTION' for 'pr-body'.
  - **Evidence:** tests/github-messages.test.mjs: 'renderPrBody falls back to default template when required tokens are missing' asserts a warning is logged and default is used.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 1)</summary>

- ✅ **Satisfied**: Refactor control-panel builder into dashboard data and update renderPrBody to use it
  - **Evidence:** scripts/lib/control-panel.mjs: new buildDashboard() export implements the dashboard view model.
  - **Evidence:** scripts/lib/github-messages.mjs: renderPrBody imports and uses buildDashboard() and emits DASHBOARD_SECTION/ARTIFACTS_SECTION/OPERATOR_NOTES_SECTION variables.

</details>
