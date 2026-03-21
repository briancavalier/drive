decision: pass

📝 Summary
- Methodology: `default`.
- The change implements the lighter-weight `Factory Dashboard` layout described in the spec: the template was updated to begin with `## Factory Dashboard`, the summary line is compact and stage-aware, suggested actions render as slash-command suggestions, and artifacts/operator notes are grouped into compact lines.
- Unit tests exercise the main acceptance scenarios (plan_ready, blocked, implementing, paused, ready_for_review) and the CI run shows tests passing.

🚨 blocking findings
- None. All acceptance criteria and plan deliverables are satisfied by the implementation and unit tests in this branch.

⚠️ non-blocking notes
- Tests are comprehensive for the primary acceptance cases. Consider adding an explicit unit test that asserts no table-like markdown is emitted (e.g. absence of `|` table marker) to future-proof against regressions.
- Consider a short changelog entry or README note documenting the PR-body template change so operators and integrators are aware of the moved `Closes #` placement.

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (✅ 4)</summary>

- ✅ **Satisfied**: Factory PR descriptions render a `Factory Dashboard` section without using a table.
  - **Evidence:** scripts/templates/github-messages/pr-body.md:1 (template starts with '## Factory Dashboard')
  - **Evidence:** tests/github-messages.test.mjs:1 (unit tests assert presence of '## Factory Dashboard' and artifact lines)
- ✅ **Satisfied**: Top dashboard summary is rendered as compact grouped lines instead of a key/value list.
  - **Evidence:** scripts/lib/github-messages.mjs: formatDashboardSummary / buildDashboardSection (implements grouped segments)
  - **Evidence:** tests/github-messages.test.mjs: renderPrBody renders plan_ready dashboard layout and assertions for summary, CI, cost, open lines
- ✅ **Satisfied**: Top summary line uses clearer human-facing waiting-state language (e.g. 'Human action required').
  - **Evidence:** scripts/lib/github-messages.mjs: WAITING_DESCRIPTORS constant and formatWaitingDescriptor implementation
  - **Evidence:** tests/github-messages.test.mjs: assertions for human-facing waiting descriptors in plan_ready/blocked/ready_for_review cases
- ✅ **Satisfied**: Suggested next actions replaced with slash-command suggestions for mutation actions.
  - **Evidence:** scripts/lib/github-messages.mjs: buildSuggestedActionsSection produces '- `/factory <verb>` — <guidance>' lines
  - **Evidence:** tests/github-messages.test.mjs: assertions verifying suggested actions for plan_ready and implementing states

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Artifacts section renders Plan / Run / Review lines and omits empty groups.
  - **Evidence:** scripts/lib/github-messages.mjs: buildArtifactsSection implementation
  - **Evidence:** tests/github-messages.test.mjs: assertions matching '**Plan**', '**Run**', '**Review**' lines

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 1)</summary>

- ✅ **Satisfied**: Unit tests updated to reflect new layout and formatting helpers added to renderPrBody.
  - **Evidence:** tests/github-messages.test.mjs: updated/added tests covering multiple status scenarios
  - **Evidence:** CI run 23379654433: unit tests passed (reported in run metadata)

</details>
