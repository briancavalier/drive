# Acceptance Tests

1. Configuration description update
   - When `LABEL_DEFINITIONS` is inspected, the `factory:blocked` entry has the description `Factory execution is blocked and waiting for human intervention to proceed.` and all other fields remain unchanged.
2. Test coverage alignment
   - Running `npm test` passes, demonstrating `tests/factory-config.test.mjs` asserts the new description without breaking existing label metadata checks.

