decision: pass

📝 Summary
- Methodology: `default`.
- The change implements the lighter-weight `Factory Dashboard` layout described in the spec: the PR body template now renders `## Factory Dashboard` first, the summary line is compact and stage-aware, suggested actions render as slash-command suggestions, and artifacts/operator notes are grouped into compact lines.
- Unit tests exercise the main acceptance scenarios (plan_ready, blocked, implementing, paused, ready_for_review) and the CI run shows tests passing (workflow run id: 23379780805).

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
  - **Evidence:** scripts/templates/github-messages/pr-body.md: template includes '## Factory Dashboard'
  - **Evidence:** tests/github-messages.test.mjs: unit test asserts presence of '## Factory Dashboard'
- ✅ **Satisfied**: Top dashboard summary is rendered as compact grouped lines instead of a key/value list.
  - **Evidence:** scripts/lib/github-messages.mjs: formatDashboardSummary / buildDashboardSection implement grouped segments
  - **Evidence:** tests/github-messages.test.mjs: renderPrBody tests assert summary, CI, cost, open lines
- ✅ **Satisfied**: Top summary line uses clearer human-facing waiting-state language (e.g. 'Human action required').
  - **Evidence:** scripts/lib/github-messages.mjs: WAITING_DESCRIPTORS and formatWaitingDescriptor
  - **Evidence:** tests/github-messages.test.mjs: assertions for waiting descriptors (plan_ready/blocked/ready_for_review)
- ✅ **Satisfied**: Suggested next actions replaced with slash-command suggestions for mutation actions.
  - **Evidence:** scripts/lib/github-messages.mjs: buildSuggestedActionsSection produces '- `/factory <verb>` — <guidance>' lines
  - **Evidence:** tests/github-messages.test.mjs: assertions verifying suggested actions for plan_ready and implementing states

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Artifacts section renders Plan / Build / Review lines and omits empty groups.
  - **Evidence:** scripts/lib/github-messages.mjs: buildArtifactsSection implementation
  - **Evidence:** tests/github-messages.test.mjs: assertions matching '**Plan**', '**Build**', '**Review**' lines

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 1)</summary>

- ✅ **Satisfied**: Unit tests updated to reflect new layout and formatting helpers added to renderPrBody.
  - **Evidence:** tests/github-messages.test.mjs: updated/added tests covering multiple status scenarios
  - **Evidence:** CI workflow run 23379780805: unit tests and supporting checks successful

</details>
