decision: pass

📝 Summary
- I reviewed the implementation that adds a durable "Factory Control Panel" to factory-managed PR bodies (branch: `factory/80-add-a-pr-control-panel-with-contextual-operator-`).
- The change adds a pure view-model `scripts/lib/control-panel.mjs`, wires it into PR rendering (`scripts/lib/github-messages.mjs` and `scripts/lib/pr-metadata.mjs`), updates metadata handling (`scripts/apply-pr-state.mjs`, `scripts/finalize-plan.mjs`), and adds unit tests that exercise the control-panel output and behavior.
- CI evidence shows the unit tests passed (workflow run id: 23350202423, `unit: success`). The test suite includes focused control-panel tests that cover paused overlay, blocked subtypes, ready-for-review behavior, action links, and artifact/run links.

🚨 blocking findings
- None. All mandatory acceptance points in the spec and plan are implemented and covered by unit tests; CI passed.

⚠️ non-blocking notes
- Operator action dispatch: the control panel emits `workflow_dispatch` URLs that point at `.github/workflows/factory-control-action.yml`. The workflow exists and is included in this change, but operators must ensure repository-level Actions permissions and any `FACTORY_GITHUB_TOKEN` are available for dispatch/permission-sensitive flows. Consider an explicit integration test or a short operator doc snippet that lists required repo permissions and run-dispatch expectations.
- Integration surface tests: the automated tests exercise the control-panel view model and PR rendering thoroughly, but there are no end-to-end tests that exercise the full workflow dispatch/side-effect of mutation actions. If you want higher confidence for operator-triggered transitions, consider adding an e2e smoke test (can be manual or a protected CI job) that validates the dispatch inputs and a small mock-run handler.
- Documentation: README already mentions the control action; consider adding a short example screenshot of the rendered control panel and a one‑liner that explains the difference between mutation (state-changing) and informational actions for operators.

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (✅ 4)</summary>

- ✅ **Satisfied**: Every factory-managed PR shows a stable 'Factory Control Panel' section in a single canonical location.
  - **Evidence:** scripts/lib/github-messages.mjs: renderPrBody builds a 'CONTROL_PANEL_SECTION' and inserts a '## Factory Control Panel' section into the PR body (see renderPrBody variables and CONTROL_PANEL_SECTION usage).
  - **Evidence:** tests/github-messages.test.mjs: 'renderPrBody renders control panel for plan_ready status' asserts presence of '## Factory Control Panel' and the required fields.
  - **Evidence:** tests/control-panel.test.mjs: unit tests validate control-panel serialization and action lines used by the PR body renderer.
- ✅ **Satisfied**: The control panel updates as the PR moves through plan_ready, implementing, repairing, reviewing, ready_for_review, blocked, and paused states.
  - **Evidence:** scripts/lib/control-panel.mjs: view model implements state overlay for paused label, maps FACTORY_PR_STATUSES to display text, reason, actions and artifacts.
  - **Evidence:** tests/control-panel.test.mjs: tests cover 'paused overlay', 'blocked reasons', 'ready_for_review state', and 'latest run and artifact links' ensuring the view model responds to those states.
  - **Evidence:** CI: unit tests passed (workflow run id: 23350202423, 'unit: success').
- ✅ **Satisfied**: The panel includes fields: State, Waiting on, Last completed stage, Reason, Recommended next step, and Actions.
  - **Evidence:** scripts/lib/github-messages.mjs: controlPanelSection assembly includes '**State:**', '**Waiting on:**', '**Last completed stage:**', '**Reason:**', '**Recommended next step:**', '**Latest run:**', '**Artifacts:**', and '**Actions**'.
  - **Evidence:** tests/github-messages.test.mjs: assertions check those fields appear in the rendered PR body for plan_ready status.
- ✅ **Satisfied**: Automated tests cover the control panel states, action links, artifact/run link rendering, and template override behavior.
  - **Evidence:** tests/control-panel.test.mjs: exercises paused overlay, blocked subtype actions/reasons, ready_for_review behavior, and link generation.
  - **Evidence:** tests/github-messages.test.mjs: covers template overrides, cost lines, and control-panel action lines including presence and encoded workflow dispatch params.
  - **Evidence:** CI: unit workflow passed (unit: success) — run id 23350202423.

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Preserve existing human review gate for merges and do not change the underlying state machine behavior (panel overlays paused state but doesn't alter metadata-driven status transitions).
  - **Evidence:** spec.md: describes the overlay behavior (paused label overlays display without changing metadata status).
  - **Evidence:** scripts/apply-pr-state.mjs: when labels include 'factory:paused' the code leaves metadata.status unchanged and renderPrBody overlays display via buildControlPanel.
  - **Evidence:** README.md: reiterates that human review remains the merge gate and workflow protections must be set separately.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 2)</summary>

- ✅ **Satisfied**: Add control-panel.mjs view model and wire into PR body rendering and metadata plumbing.
  - **Evidence:** scripts/lib/control-panel.mjs: new view-model file implementing the control panel logic.
  - **Evidence:** scripts/lib/github-messages.mjs: imports and uses buildControlPanel in renderPrBody.
  - **Evidence:** scripts/apply-pr-state.mjs and scripts/finalize-plan.mjs: updated to set and pass new metadata fields (lastCompletedStage, lastRunId, lastRunUrl, pauseReason) used by the panel.
- ✅ **Satisfied**: Update workflows to persist metadata fields consumed by the control panel (e.g., last run id/url, last completed stage, pause reason).
  - **Evidence:** .github/workflows/factory-pr-loop.yml: writes FACTORY_LAST_RUN_ID, FACTORY_LAST_RUN_URL, and FACTORY_LAST_COMPLETED_STAGE into apply-pr-state steps (see workflow env usage).
  - **Evidence:** .github/workflows/factory-control-action.yml: uses FACTORY_LAST_COMPLETED_STAGE and FACTORY_PAUSE_REASON inputs/outputs for control action wiring.
  - **Evidence:** scripts/apply-pr-state.mjs: new applyLastRunId/applyLastRunUrl/applyPauseReason handlers accept the env vars and merge them into the metadata written to the PR body.

</details>
