decision: pass

📝 Summary
- Methodology: `default`.
- The changes introduce two new failure types (`stage_noop` and `stage_setup`), collect and render repo-local diagnostics, track bounded recovery counters, and short-circuit follow-up diagnostics for deterministic failures. Implementation is present across classification, diagnostics, PR-state wiring, and comment rendering; unit tests were added to cover the new behaviors and CI unit checks passed.

🚨 blocking findings
- None.

⚠️ non-blocking notes
- The artifact `.factory/runs/53/repair-log.md` referenced by the run metadata is missing in the branch. Add or update the repair-log entry to match the spec expectations or remove the artifact index entry.
- Consider adding an end-to-end integration test that exercises the full GitHub Action flow (checkout, route loop, stage run) under a synthetic repo to complement the comprehensive unit coverage.

**default**

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: A stage failure that finishes with no repository changes is classified distinctly and includes diagnostics and recovery guidance.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-classification.mjs: defines FAILURE_TYPES.stageNoop and matches STAGE_NOOP_PATTERNS.
    - scripts/lib/stage-diagnostics.mjs: provides renderStageDiagnostics output used to include diagnostics in failure messages.
    - tests/prepare-stage-push.test.mjs: tests that prepare-stage-push reports stage_noop diagnostics when branch is unchanged.
    - tests/failure-comment.test.mjs: asserts stage_noop failure comment includes diagnostics and targeted recovery text.
    - CI workflow run id: 23265468956 (unit: success)
- Requirement: A configuration/setup failure before branch output is prepared is classified distinctly and prompts targeted operator guidance.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-classification.mjs: defines FAILURE_TYPES.stageSetup and matches STAGE_SETUP_PATTERNS.
    - tests/prepare-stage-push.test.mjs: contains case asserting stage_setup diagnostics for workflow changes without factory token.
    - tests/failure-comment.test.mjs: asserts stage_setup failure comment includes prerequisite guidance and diagnostics.
    - scripts/lib/stage-diagnostics.mjs: diagnostics include FACTORY_GITHUB_TOKEN availability and workflow change detection.
- Requirement: Bounded recovery: counters for repeated stage_noop/stage_setup attempts are tracked and the second no-op blocks further automated retries.
  - Status: `satisfied`
  - Evidence:
    - scripts/handle-stage-failure.mjs: reads FACTORY_STAGE_NOOP_ATTEMPTS/FACTORY_STAGE_SETUP_ATTEMPTS and increments/caps attempts; buildStateUpdate blocks after limit.
    - tests/handle-stage-failure.test.mjs: verifies increments and transition to blocked after exhausting retries.
    - scripts/route-pr-loop.mjs: exposes stage_noop_attempts and stage_setup_attempts as workflow outputs.
- Requirement: Deterministic failures (stage_noop/stage_setup) are excluded from spawning Codex diagnosis follow-ups.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-followup.mjs: INELIGIBLE_FAILURE_TYPES includes 'stage_noop' so follow-up creation is skipped.
    - tests/failure-followup.test.mjs: contains test asserting classifyFollowup skips stage_noop failures.
    - .github/workflows/factory-pr-loop.yml: workflow passes stage_noop_attempts/stage_setup_attempts outputs and wiring for state transitions.

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Documentation updated to describe new failure types and operator guidance.
  - Status: `satisfied`
  - Evidence:
    - README.md: contains entries describing 'stage_noop' and 'stage_setup' behavior and the stageNoopAttempts metadata.
    - scripts/lib/failure-comment.mjs: renders Stage diagnostics section within failure comments.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Unit tests added/updated for failure-classification, prepare-stage-push, failure-comment, handle-stage-failure, build-stage-prompt, and followup gating.
  - Status: `satisfied`
  - Evidence:
    - tests/failure-classification.test.mjs: updated to cover new failure types.
    - tests/prepare-stage-push.test.mjs: added tests for stage_noop and stage_setup diagnostics.
    - tests/failure-comment.test.mjs: asserts new comment rendering for both types.
    - tests/handle-stage-failure.test.mjs and tests/build-stage-prompt.test.mjs: cover counters and prompt metadata.

</details>
