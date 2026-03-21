decision: pass

📝 Summary
- The changes implement the lighter-weight "Factory Dashboard" PR-body layout described in `.factory/runs/88/spec.md`.
- Template and rendering logic were updated (`scripts/templates/github-messages/pr-body.md`, `scripts/lib/github-messages.mjs`) and helper behavior lives in `scripts/lib/control-panel.mjs`.
- Unit tests in `tests/` were updated to validate the four acceptance scenarios and the metadata serialization; CI unit suite passed (workflow run id: 23378361353).

🚨 blocking findings
- None.

⚠️ non-blocking notes
- Artifact link presence vs. artifact file existence: `buildArtifactLinks` constructs artifact URLs from `repositoryUrl`, `branch`, and `artifactsPath` without checking whether the target files (e.g. `.factory/runs/88/repair-log.md`) actually exist in the tree. This can lead to PR bodies that list artifact links which 404 until those artifacts are produced. Consider adding an existence check or documenting that links are conservative placeholders.
- Consider adding a focused unit test that verifies omission of the `**Run**` artifact line when no run artifacts exist on disk (or when a runtime flag indicates absence).

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (✅ 3)</summary>

- ✅ **Satisfied**: Factory PR descriptions render a `Factory Dashboard` section without using a table.
  - **Evidence:** scripts/templates/github-messages/pr-body.md: contains '## Factory Dashboard' and tokens for sections.
  - **Evidence:** tests/github-messages.test.mjs: includes assertions that the produced body contains '## Factory Dashboard'.
  - **Evidence:** CI workflow run 23378361353: unit tests succeeded (unit: success).
- ✅ **Satisfied**: Top dashboard summary is rendered as compact grouped lines instead of a table and uses the prescribed segments (state, optional stage, waiting descriptor).
  - **Evidence:** scripts/lib/github-messages.mjs: `formatDashboardSummary` and `buildDashboardSection` implement grouped summary and lines.
  - **Evidence:** tests/github-messages.test.mjs: asserts specific summary line outputs for plan_ready, blocked, and implementing states.
- ✅ **Satisfied**: Suggested next actions list uses slash-command suggestions drawn from control panel mutation actions.
  - **Evidence:** scripts/lib/github-messages.mjs: `buildSuggestedActionsSection` maps control panel actions to slash-command lines.
  - **Evidence:** tests/github-messages.test.mjs: asserts the suggested actions list contains `/factory implement`, `/factory pause`, `/factory resume`, etc., per state.

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Artifacts section groups Plan, Run, and Review lines and omits groups when no links are present.
  - **Evidence:** scripts/lib/github-messages.mjs: `buildArtifactsSection` implements grouped Plan/Run/Review lines.
  - **Evidence:** tests/github-messages.test.mjs: asserts presence and formatting of '**Plan**', '**Run**', and '**Review**' lines in rendered output.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 2)</summary>

- ✅ **Satisfied**: Update the PR body template and `renderPrBody` to compute the new dashboard summary, suggested actions, artifact grouping, and operator notes.
  - **Evidence:** scripts/templates/github-messages/pr-body.md: new template ordering with DASHBOARD_SECTION, SUGGESTED_ACTIONS_SECTION, ARTIFACTS_SECTION, OPERATOR_NOTES_SECTION, and 'Closes #{{ISSUE_NUMBER}}'.
  - **Evidence:** scripts/lib/github-messages.mjs: renderPrBody composes the new sections and appends serialized factory-state comment.
- ✅ **Satisfied**: Unit tests updated to cover the acceptance scenarios and metadata serialization remains parseable.
  - **Evidence:** tests/github-messages.test.mjs and tests/pr-metadata.test.mjs: updated assertions covering summary lines, suggested actions, artifact lines, operator notes, and 'Closes #<issue>' placement.
  - **Evidence:** CI workflow run 23378361353: unit tests succeeded.

</details>
