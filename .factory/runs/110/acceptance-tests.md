# Acceptance Tests

- **Scope/priority request ingestion**
  - Given `.factory/tmp/intervention-request.json` contains a tradeoff payload with `questionKind: "scope_priority"`, two resumable options (each with an instruction), and one manual fallback
  - When `detectStageInterventionRequest` runs in implement mode followed by `handleStageInterventionRequest`
  - Then the request is accepted, the produced intervention preserves `questionKind: "scope_priority"`, and the generated PR comment lists the resumable options with standard fenced commands.

- **Tradeoff validation failure**
  - Given an intervention request payload labelled `scope_priority` but missing an instruction on one resumable option
  - When `validateInterventionRequest` executes
  - Then it rejects the request with an error explaining that resumable tradeoff options must include instructions.

- **Persisting a tradeoff decision**
  - Given an open scope/priority question intervention with two resumable options
  - When `apply-intervention-answer` processes an answer selecting one resumable option
  - Then the child environment written to `scripts/apply-pr-state.mjs` includes `FACTORY_PENDING_STAGE_DECISION` JSON whose `kind` is `scope_priority`, records the option id/label, and captures the actor timestamp.

- **Prompt guidance for tradeoffs**
  - Given PR metadata whose `pendingStageDecision.kind` is `scope_priority`
  - When `buildStagePrompt` renders the implement prompt
  - Then the `Human Decision` section appears, showing the scope/priority decision kind, selected option id/label, and the stored instruction.

- **Decision cleared after completion**
  - Given metadata with a persisted scope/priority decision
  - When the success path (e.g., `process-review` handling a passing review) updates PR state
  - Then `FACTORY_PENDING_STAGE_DECISION` is cleared, ensuring no tradeoff decision remains in the metadata once the stage completes.
