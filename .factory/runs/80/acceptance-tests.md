# Acceptance Tests: Factory Control Panel

## Automated
1. **Plan-ready panel snapshot** — Extend `tests/github-messages.test.mjs` (or add a dedicated fixture) to assert that rendering a PR body for `status: plan_ready` with no pause/block produces a `## Factory Control Panel` section containing the required fields (`State`, `Waiting on`, `Last completed stage`, `Recommended next step`) and the `▶ Start implement`, `⏸ Pause`, and `Open plan artifacts` actions only.
2. **Paused overlay** — Add a unit test for the control panel view model ensuring that when metadata indicates `implementing` but the labels include `factory:paused`, the panel reports `State: paused`, suppresses agent-only actions, and surfaces `Resume`/`Reset PR` links with the pause reason.
3. **Blocked reasons by subtype** — For each blocked subtype (`stage_noop`, `stage_setup`, `transient_infra`, `stale_branch_conflict`, self-modify guard, review artifact contract, exhausted repair cap), feed representative metadata into the view model and assert that:
   - The `Reason` text matches the human-friendly wording.
   - The action set matches the matrix from the issue (e.g., `Retry`, `Reset PR`, diagnostics/failure history links as appropriate).
4. **Ready-for-review actions** — Verify that `status: ready_for_review` renders `Waiting on: human reviewer`, recommends review handoff, and shows only `Open review artifacts` and `Pause automation` actions; confirm `Start implement` and `Retry` are absent.
5. **Latest run and artifact links** — Ensure that when `metadata.lastRunUrl` is set, the panel includes a `🏃 Open latest run` link, and when it is absent the link is omitted without leaving an empty bullet. Include assertions that plan/acceptance test artifact links resolve to the canonical `.factory/runs/<issue>/...` paths.
6. **Workflow action links** — Add a test verifying that mutation actions (e.g., `▶ Start implement`, `🔁 Retry`) point to the control-action workflow URL with the expected query parameters, while informational actions use repository/branch/artifact URLs.

## Documentation / Manual
- Update the operator documentation (README or dedicated guide) with a description or screenshot of the control panel. Manually confirm the instructions match the rendered panel after the feature lands.
