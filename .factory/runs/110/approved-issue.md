## Problem statement

The factory can now pause implement for ambiguity, but it still lacks a structured way to ask for scope or priority tradeoffs when more than one valid delivery shape exists. In those cases the difference is not design ambiguity so much as choosing between competing goals such as speed vs completeness or narrow vs broader scope.

## Goals

- Add an implement-stage question producer for scope and priority tradeoffs
- Reuse the existing intervention and PR-comment Q/A machinery without new command syntax
- Let the factory ask for a bounded tradeoff decision when two valid implementation scopes remain
- Feed the answered decision back into the resumed implement prompt as binding guidance

## Non-goals

- Do not replace the existing ambiguity intervention flow
- Do not add free-form or conversational answer parsing
- Do not add broad planning-stage policy work in this issue
- Do not attempt multi-intervention inbox UX

## Constraints

- Continue using one open intervention per PR
- Keep `pendingStageDecision` or equivalent single-use decision handoff semantics for resumed implement runs
- Use bounded options with stable IDs and explicit instructions
- Preserve current implement success, failure, and self-modify behavior outside the new scope/priority path

## Acceptance criteria

- Implement can emit a canonical question intervention for scope/priority tradeoffs
- The PR comment shows bounded answer commands using the standard intervention template
- A chosen answer is persisted and included in the resumed implement prompt as binding direction
- The selected decision is cleared on the appropriate cleanup paths
- Tests cover request validation, metadata persistence, prompt inclusion, and workflow routing

## Risk

If the policy is too loose, the factory may ask questions that should have been resolved from the issue or plan. If the option instructions are vague, the resumed implement stage may still drift or produce partial work that does not match operator intent.

## Affected area

CI / Automation
