# Clarify `factory:blocked` Label Spec (Issue #98)

## Summary
- Update the `factory:blocked` label description so it explicitly states that the factory is blocked and waiting for human intervention before work can continue.
- Keep all other label metadata unchanged to avoid unintended control-plane configuration drift.
- Ensure automated tests that pin the label description are updated to the new wording.

## Current Behavior
- `scripts/lib/factory-config.mjs` lists all factory label definitions, including `factory:blocked` with the description "Factory execution is blocked and needs human attention".
- `tests/factory-config.test.mjs` asserts individual label metadata for selected labels but does not currently check the `factory:blocked` description string.

## Proposed Changes
- Change the `factory:blocked` entry in `LABEL_DEFINITIONS` to the new description text: "Factory execution is blocked and waiting for human intervention to proceed." This satisfies the requirement to stress that the factory is explicitly waiting on a person.
- Extend the factory configuration unit tests to assert the updated description, guaranteeing future regressions are caught.
- Limit all code edits to the control-plane module (`scripts/lib/factory-config.mjs`) and its companion tests under `tests/`.

## Testing Strategy
- Modify `tests/factory-config.test.mjs` to include an assertion that the `factory:blocked` label definition uses the new description string.
- Run the existing Node test suite (`npm test`) to confirm the updated assertion passes and no other scenarios regress.

## Assumptions
- No additional documentation or runtime behavior changes are required beyond the description string and corresponding test.
- Updating the description alone is sufficient to trigger the self-modify guard because the edit touches the protected control-plane file.
