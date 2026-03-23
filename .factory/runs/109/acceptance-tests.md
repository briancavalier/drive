# Acceptance Tests – Run 109

- **Repair exhaustion question appears with bounded options**  
  Trigger a repair flow where `nextRepairState` reports `blocked` due to repeated identical failures.  
  Expect the intervention rendered on the PR to have `type: "question"`, `payload.questionKind: "repair_exhaustion"`, summary referencing repeated failures, and options `retry_narrow_scope`, `reset_plan_ready`, `manual_takeover`.

- **Retry answer resumes repair and clears intervention**  
  Simulate `/factory answer <id> retry_narrow_scope` on an open repair-exhaustion question.  
  Assert `apply-intervention-answer` sets status to `repairing`, keeps `repairAttempts` unchanged from resume context, clears `metadata.intervention`, and posts a resolution comment noting automation will resume.

- **Reset answer moves PR to plan-ready and resets counters**  
  Answer with `reset_plan_ready`.  
  Verify status becomes `plan_ready`, `repairAttempts` resets to `0`, failure signature counters clear, blocked/pause fields are empty, and the resolution comment highlights the reset.

- **Manual takeover pauses automation with explicit reason**  
  Answer with `manual_takeover`.  
  Confirm status remains `blocked`, metadata `paused` is `true` with pause reason mentioning manual takeover, and the intervention is cleared.

- **Review artifact pathway emits the same question**  
  Drive `prepare-review-artifact-repair` to an exhausted state.  
  Ensure outputs surface the repair-exhaustion question payload and downstream comments reuse it, while non-exhausted paths still emit failure interventions.

- **CI workflow exhaustion route produces question and preserves metadata**  
  Simulate a `workflow_run` failure that exceeds the repair limit.  
  Confirm `routeWorkflowRun` returns action `blocked`, includes the question intervention payload, and carries forward resume context (repair attempts, repeated failure count, failure signature).
