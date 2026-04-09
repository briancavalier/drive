decision: pass

**📝 Summary**
- The change implements a repair-exhaustion question flow that replaces the previous opaque failure block when repair retries are exhausted. It adds `exhaustedBy` to repair state, a reusable `buildRepairExhaustionQuestion()` helper, routes the question payloads through the PR loop, raises the question as an intervention comment, and supports operator answers including `reset_to_plan_ready` which clears repair counters. Unit tests exercise the new builder, routing, stage-failure branching, raise script, and answer handling. CI unit tests passed.

**🚨 blocking findings**
- None.

**⚠️ non-blocking notes**
- Add an integration or workflow-level smoke test that exercises the `repair-exhaustion-question` job path end-to-end (workflow routing -> `raise-repair-exhaustion-question` -> `apply-pr-state.mjs`), to reduce regression risk across the job boundary.
- Consider adding a short note in contributor docs or the PR description describing the new `questionKind: "repair_exhaustion"` intervention semantics and the `reset_to_plan_ready` effect so operators and integrators can discover the new answer options more easily.

<details>
<summary>🧭 Traceability</summary>

#### Acceptance Criteria (✅ 4)

- ✅ **Satisfied**: Repair exhaustion posts a decision question instead of only blocking.
  - **Evidence:** scripts/handle-stage-failure.mjs: branches to buildRepairExhaustionQuestion when repair state indicates exhaustion and sets FACTORY_INTERVENTION/FACTORY_COMMENT.
  - **Evidence:** tests/handle-stage-failure.test.mjs: test 'main emits repair exhaustion question' asserts a question intervention is produced.
- ✅ **Satisfied**: The question is posted in the PR comment stream with bounded answer commands.
  - **Evidence:** scripts/raise-repair-exhaustion-question.mjs: applies the question payload via apply-pr-state by setting FACTORY_INTERVENTION and FACTORY_COMMENT.
  - **Evidence:** .github/workflows/factory-pr-loop.yml: new job 'repair-exhaustion-question' invokes the raise script when routed outputs include a repair question.
  - **Evidence:** tests/raise-repair-exhaustion-question.test.mjs: verifies apply-pr-state invocation and env payload for raising the question.
- ✅ **Satisfied**: A valid answer updates PR metadata correctly and drives the intended next action (retry, reset, or human takeover).
  - **Evidence:** scripts/apply-intervention-answer.mjs: recognizes 'reset_to_plan_ready', clears intervention, sets FACTORY_STATUS=plan_ready and FACTORY_REPAIR_ATTEMPTS=0; handles resume_current_stage and manual takeover paths.
  - **Evidence:** tests/apply-intervention-answer.test.mjs: contains tests for resetting to plan-ready, persisting ambiguity pending decisions, resuming, and human takeover behavior.
- ✅ **Satisfied**: Non-exhausted repair failures continue to surface the legacy failure intervention (no question).
  - **Evidence:** scripts/lib/event-router.mjs: routeWorkflowRun and routePullRequestReview return a normal 'repair' action when nextRepairState().blocked is false.
  - **Evidence:** tests/event-router.test.mjs: tests validate repair routing for non-blocked states and show exhausted blocking only when expected.

#### Plan Deliverables (✅ 2)

- ✅ **Satisfied**: Add repair-state 'exhaustedBy' signal, repair-interventions helper, route/workflow outputs, ws job to raise question, and answer handler support (reset_to_plan_ready).
  - **Evidence:** scripts/lib/repair-state.mjs: exports exhaustedBy from nextRepairState().
  - **Evidence:** scripts/lib/repair-interventions.mjs: implements buildRepairExhaustionQuestion() and resumeContext composition.
  - **Evidence:** scripts/route-pr-loop.mjs & scripts/lib/event-router.mjs: emit repair_question_intervention, repair_question_comment, and repair_exhaustion_reason outputs.
  - **Evidence:** scripts/raise-repair-exhaustion-question.mjs & .github/workflows/factory-pr-loop.yml: workflow job added to call the raise script when a question payload is present.
  - **Evidence:** scripts/apply-intervention-answer.mjs: supports reset_to_plan_ready and clears repair counters; tests updated accordingly.
- ✅ **Satisfied**: Unit tests updated/added to cover new behavior: repair-state, repair-interventions builder, stage-failure question path, raise script, and answer handling.
  - **Evidence:** tests/repair-state.test.mjs: asserts exhaustedBy values for attempt_limit and repeated_failure.
  - **Evidence:** tests/repair-interventions.test.mjs: exercises summary and resumeContext produced by the builder.
  - **Evidence:** tests/handle-stage-failure.test.mjs, tests/raise-repair-exhaustion-question.test.mjs, tests/apply-intervention-answer.test.mjs: cover end-to-end branching for question creation and answer handling.

</details>
