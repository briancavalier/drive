### Problem statement

PR #44 exposed another failure class that the factory does not yet handle well: stage runs that fail without producing a useful branch update. The observed failures included a configuration problem before branch output could be prepared and an implementation run that completed without producing repository changes.

Today those outcomes are surfaced to operators, but the system has limited ability to distinguish whether the root cause is prompt/task mismatch, model no-op behavior, missing configuration for self-modifying changes, or a control-plane contract error. That makes recovery slower and turns some potentially recoverable runs into blocked or reset states too early.

### Goals

- Detect no-op stage outcomes and misconfiguration failures as first-class failure modes with clearer classification.
- Improve investigation of these failures using repo-local evidence so the factory can distinguish branch-local problems from control-plane defects.
- Add a bounded recovery path for recoverable no-op/misconfiguration cases, such as targeted retry prompts, explicit setup guidance, or safer state transitions.
- Keep hard safety checks for missing credentials or unsafe self-modification preconditions.
- Make the resulting operator guidance more specific than the current generic content/configuration failure comments.

### Non-goals

- Do not remove the requirement for explicit credentials and permissions when the factory modifies workflow files.
- Do not allow unlimited retries for no-op runs.
- Do not treat every empty diff as recoverable; some requests may genuinely be impossible or already satisfied.
- Do not redesign the entire stage runner or model-selection system in this change.

### Constraints

- The solution must fit the existing stage-runner, failure-classification, and PR-state architecture.
- Recovery logic must remain bounded and deterministic enough for CI execution.
- The implementation must preserve repo safety for self-modifying workflow changes.
- The factory should continue to surface durable artifact and run links for human operators.
- Tests should cover at least the concrete failure shapes already observed in PR #44.

### Acceptance criteria

- A stage failure that finishes with no repository changes is classified distinctly from ordinary implementation errors and produces targeted recovery guidance.
- A configuration/setup failure before branch output is prepared is classified distinctly from logic failures and points operators to the specific missing precondition when possible.
- Recoverable no-op or setup failures can take a bounded retry path instead of immediately collapsing into a generic blocked/reset outcome.
- Non-recoverable cases still stop safely and keep clear operator-visible evidence.
- Tests cover the no-op implementation case and the configuration-before-branch-output case observed in PR #44.
- Documentation explains the new failure classes and how operators should interpret the resulting states.

### Risk

If no-op detection is too eager, the factory may retry pointless work and waste cost. If it is too shallow, the system will continue to collapse distinct root causes into the same operator-facing outcome, which makes autonomous recovery and human triage harder. Because these failures happen early in execution, classification mistakes can send the run down the wrong path quickly.

### Affected area

CI / Automation
