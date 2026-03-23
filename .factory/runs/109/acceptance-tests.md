# Acceptance Tests – Run 109

- **Repair exhaustion emits a question intervention**  
  Simulate a failed repair run where `nextRepairState` signals `blocked` (e.g., fourth attempt with `maxRepairAttempts=3`).  
  Run `scripts/handle-stage-failure.mjs` under that fixture and assert:  
  - `metadata.intervention` is a `question` with `questionKind: "repair_exhaustion"`.  
  - Summary reads “Automated repair retries are exhausted; choose the next step.” and the detail mentions `4/3 attempts used`.  
  - Options array contains `retry_repair`, `reset_plan_ready`, and `human_takeover` with effects `resume_current_stage`, `reset_to_plan_ready`, and `manual_only`.  
  - The posted comment (via `renderInterventionQuestionComment`) uses the question format and exposes individual `/factory answer` commands for each option.

- **Retry option resumes repair and resets counters**  
  With an open repair-exhaustion question on a blocked PR, invoke `scripts/apply-intervention-answer.mjs` selecting `retry_repair`.  
  Expect the resulting PR update to:  
  - Clear the intervention and set `FACTORY_STATUS=repairing` with `FACTORY_BLOCKED_ACTION=""`.  
  - Emit `FACTORY_REPAIR_ATTEMPTS=0` so the next repair run can proceed.  
  - Persist a `FACTORY_PENDING_STAGE_DECISION` entry noting `kind: "repair_exhaustion"` and the operator instruction.  
  - Produce a resolution comment that references resuming repair.

- **Reset option restores plan-ready state**  
  Answer the same question with `reset_plan_ready`.  
  Verify the PR metadata transitions to plan-ready (`FACTORY_STATUS=plan_ready`, `factory:plan-ready` label added, `factory:blocked`/`factory:implement` removed), `FACTORY_REPAIR_ATTEMPTS=0`, and automation is unblocked with the intervention cleared.

- **Human takeover leaves the PR paused but traceable**  
  Answer with `human_takeover`.  
  Confirm the PR remains `blocked`, `FACTORY_PAUSED=true` with a pause reason referencing the intervention, no resume action is scheduled, and the resolution comment states that automation stays blocked.
