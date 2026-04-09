## Problem statement

When repair attempts are exhausted, the factory currently blocks the PR as a failure but still has no structured way to ask the operator what to do next. That forces a human to infer the right follow-up action from failure context instead of answering a bounded decision question.

## Goals

- Add a repair-stage question producer for repeated repair failure / repair exhaustion
- Reuse the existing intervention and PR-comment Q/A flow already used for approvals and implement ambiguity
- Let the factory ask a bounded follow-up question instead of only blocking as failure when repair can no longer proceed autonomously
- Support explicit options such as retry with narrower scope, reset to plan-ready, or hand off to human-only handling
- Preserve clear resume/reset behavior and append-only PR history

## Non-goals

- Do not add free-form answer parsing
- Do not redesign the existing failure classification system
- Do not add multi-question support per PR
- Do not broaden this phase to plan-stage or implement-stage ambiguity beyond what already exists

## Constraints

- Keep `metadata.intervention` as the single open intervention source of truth
- Continue using `/factory answer <intervention-id> <option-id>` and append-only PR comments
- Preserve existing failure handling and retry accounting unless the repair-exhaustion path explicitly converts into a question intervention
- Keep the rollout narrow and policy-driven: repeated repair failure only

## Acceptance criteria

- When repair exhaustion is reached, the factory can create a canonical question intervention instead of only surfacing a blocked failure
- The question is posted in the PR comment stream with bounded answer commands
- A valid answer updates PR metadata correctly and drives the intended next action
- Existing repair failure and non-question failure flows continue to work
- Tests cover the new repair exhaustion question path, routing, metadata updates, and workflow contracts

## Risk

If the threshold or routing is wrong, the factory could ask too often, ask at the wrong time, or bypass failure handling that should remain automatic. Repair is also a sensitive area because incorrect state transitions can strand a PR between blocked, paused, and resumed states.

## Affected area

CI / Automation
