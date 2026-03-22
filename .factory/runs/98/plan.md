# Implementation Plan

1. Update label description
   - Edit `scripts/lib/factory-config.mjs` to replace the `factory:blocked` label description with the new wording that explicitly mentions waiting for human intervention.
2. Refresh unit test coverage
   - Amend `tests/factory-config.test.mjs` to assert the updated description for the `factory:blocked` label so future regressions are caught.
3. Validate suite
   - Run `npm test` to confirm the revised description and tests pass without affecting other label metadata.

