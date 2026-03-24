# Acceptance Tests

- **Repair exhaustion question surfaces**
  - Given a managed PR where `nextRepairState` reports `blocked` after a failing CI workflow run
  - When `routeWorkflowRun` handles the event
  - Then the returned intervention is a question with `questionKind: "repair_exhaustion"`, includes the three specified options, and the rendered comment posted by the workflow matches `renderInterventionQuestionComment` with the run link and recommended option.

- **Retry narrower resumes repair**
  - Given a blocked PR holding the repair exhaustion question with the `retry_narrower` option
  - When `/factory answer <id> retry_narrower` is applied
  - Then `apply-intervention-answer` clears the intervention, sets `FACTORY_STATUS` to `repairing`, records a `pendingStageDecision` with `kind: "repair_exhaustion"` and the provided instruction, and the resolution comment indicates repair will resume.

- **Reset to plan-ready path**
  - Given the same question intervention
  - When `/factory answer <id> reset_plan_ready` is applied
  - Then the PR metadata transitions to `plan_ready`, the pending stage decision is cleared, automation is unpaused, and the resolution comment states the PR was reset to plan-ready.

- **Human takeover pauses automation**
  - Given the same question intervention
  - When `/factory answer <id> human_takeover` is applied
  - Then the PR remains blocked but becomes paused with a pause reason referencing the human takeover choice, and the intervention is cleared.

- **Review artifact repair exhaustion**
  - Given repeated review artifact contract failures that cause `prepare-review-artifact-repair.mjs` to see a blocked repair state
  - When the review-processing workflow executes
  - Then the outputs include the question intervention and rendered comment, and the PR ends up blocked with that question visible while non-blocked cases continue to run the existing review repair flow.
