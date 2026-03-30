# Acceptance tests

- **Repair exhaustion posts decision question**
  - Reproduce a repair run that exceeds `maxRepairAttempts` (or hits the repeated-failure guard).
  - Expected: PR status becomes `blocked` with `blockedAction: repair`, the comment thread shows a “Factory Question” entry with retry/reset/human options, and `metadata.intervention` stores the new question payload.

- **Retry answer resumes repair stage**
  - From the previous state, issue `/factory answer <question-id> retry_repair`.
  - Expected: `apply-intervention-answer` clears the intervention, status changes to `repairing`, pending-stage decision targets a repair run, and automation can launch the next repair job.

- **Reset answer returns to plan-ready**
  - Answer the same question with `reset_plan`.
  - Expected: PR status becomes `plan_ready`, repair-attempt counters reset to 0, blocked labels are removed, and the control panel invites `/factory implement`.

- **Human takeover keeps automation paused**
  - Answer the question with `human_takeover`.
  - Expected: PR stays `blocked`, `paused` becomes `true` with a pause reason referencing the intervention, and no new stage dispatch occurs until resumed manually.

- **Non-exhausted repair failure remains a failure intervention**
  - Trigger a first-attempt repair failure (below the threshold).
  - Expected: The factory posts the existing failure comment/intervention (type `failure`) without creating a question, proving that non-exhaustion flows are unchanged.
