## Problem statement
The current `factory:blocked` label description is serviceable, but it does not clearly say that the factory is waiting for explicit human intervention. That makes the blocked state slightly less clear for operators and is a good low-risk control-plane change to exercise the new self-modify intervention path.

## Goals
- Update the `factory:blocked` label description in `scripts/lib/factory-config.mjs`
- Make the new description explicitly say that the factory is blocked and waiting for human intervention
- Update or add tests so the label metadata assertion matches the new wording

## Non-goals
- Do not change label names, colors, or any other label definitions
- Do not change factory state semantics or blocked-state behavior
- Do not modify workflows, routing, intervention logic, or UI text outside the label metadata/tests needed for this description change

## Constraints
- Keep the change limited to protected control-plane files under `scripts/**` and any directly related tests
- Preserve backward-compatible behavior; only the description text should change
- Do not add or automate application of the `factory:self-modify` label
- Keep the implementation minimal and easy to review

## Acceptance criteria
- `factory:blocked` label metadata uses the new description text
- Tests covering label metadata pass with the updated wording
- No other label definitions or runtime behavior change
- The resulting PR touches protected control-plane paths so the self-modify guard can be exercised

## Risk
This is low risk because it changes only label metadata and its test coverage. The main operational risk is accidentally broadening the change beyond the intended description update, which would make the self-modify trial noisier and harder to review.

## Affected area
CI / Automation
