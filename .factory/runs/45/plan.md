# Implementation Plan

## Work Breakdown
1. **Extend factory label catalog**
   - Update `scripts/lib/factory-config.mjs` to add `FACTORY_LABELS.intakeRejected` and register it in `LABEL_DEFINITIONS` with the chosen color/description.
   - Adjust any derived constants or helpers that enumerate labels to keep type safety (e.g., update `FACTORY_LABELS` exports and confirm cost-label arrays remain unchanged).
   - Refresh documentation by adding the label to the "Labels" list in `README.md`.
   - Update `tests/factory-config.test.mjs` (and any other label enumeration tests) to cover the new label definition.
2. **Apply and clear the rejection label during intake**
   - Modify `scripts/prepare-intake.mjs` to import `FACTORY_LABELS`, `addLabels`, and `removeLabel`.
   - Before throwing for permission failures or missing form sections, call `addLabels(issue.number, [FACTORY_LABELS.intakeRejected])` to tag the issue; re-use the existing rejection comment flow for missing fields.
   - After validations pass and before returning outputs, call `removeLabel(issue.number, FACTORY_LABELS.intakeRejected)` so a successful intake clears any stale rejection label.
   - Consider factoring the label application/cleanup into minimal helper functions within the module for clarity and easier testing.
3. **Cover the new behavior with automated tests**
   - Add a focused test suite (e.g., `tests/prepare-intake.test.mjs`) that stubs `addLabels`, `removeLabel`, and `commentOnIssue` to verify: missing form applies the label, permission failure applies the label, and a successful run removes it.
   - Ensure existing fixtures or helpers that assume the old label set are updated to include `factory:intake-rejected` where appropriate.

## Testing Strategy
- Run the updated Node test suites via `npm test` (or `node --test` against the touched files) to confirm label definitions and intake flow tests pass.
