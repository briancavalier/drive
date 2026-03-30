# Implementation plan

- **Repair state signals**
  - Extend `scripts/lib/repair-state.mjs` (and tests) to return an `exhaustedBy` reason when repairs block.
  - Update `scripts/lib/event-router.mjs` and `scripts/route-pr-loop.mjs` to propagate `maxRepairAttempts`, the exhaustion reason, and the updated counters through routed outputs.

- **Question builder and stage failure path**
  - Add `scripts/lib/repair-interventions.mjs` with a helper that composes the repair-exhaustion question, summary, detail, options, and resume context.
  - Wire `scripts/handle-stage-failure.mjs` to detect repair exhaustion (using counters and the reason) and invoke the helper instead of emitting a failure intervention; ensure it passes the resulting comment and intervention to `apply-pr-state.mjs`.

- **Routing & workflow integration**
  - Enhance `routeWorkflowRun()` / `routePullRequestReview()` to emit the question payload when exhaustion is reached, skipping duplicates if an open question already exists.
  - Teach `scripts/route-pr-loop.mjs` and `.github/workflows/factory-pr-loop.yml` to surface the question payload: add a new job (e.g. `repair-exhaustion-question`) that calls a wrapper script to apply the question intervention, and leave the legacy block job for true failure interventions.

- **Answer handling & operator messaging**
  - Extend `scripts/apply-intervention-answer.mjs` to support `reset_to_plan_ready`, resetting counters/status/labels appropriately; update `OPTION_EFFECT_HINTS` (and any control-panel hints) so the question comment advertises the new option.
  - Ensure resume options still emit pending stage decisions and that manual takeover continues to pause the PR with an explanatory note.

- **Regression tests**
  - Update/extend unit tests: `tests/repair-state.test.mjs`, `tests/handle-stage-failure.test.mjs`, `tests/event-router-commands.test.mjs`, `tests/apply-intervention-answer.test.mjs`, `tests/github-messages.test.mjs`, and add coverage for the new helper module.
  - Add workflow-oriented tests or fixtures as needed to exercise the new routing outputs and wrapper script.
