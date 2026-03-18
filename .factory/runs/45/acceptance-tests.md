# Acceptance Tests

1. **Factory label bootstrap defines the rejection label**
   - Run the label definition tests (e.g., `node --test tests/factory-config.test.mjs`) and verify they assert that `factory:intake-rejected` is present with the expected description/color.
2. **Missing form applies the rejection label**
   - Execute the new intake unit test that simulates an incomplete issue form; confirm it verifies `addLabels` receives `factory:intake-rejected` and the existing rejection comment still posts.
3. **Unauthorized requester applies the rejection label**
   - Run the intake test case where `getCollaboratorPermission` resolves to `read`; ensure the script attempts to add `factory:intake-rejected` before throwing.
4. **Successful intake clears the label**
   - In the happy-path intake test, assert that `removeLabel` is called for `factory:intake-rejected` after the validations pass.
5. **Documentation references the new label**
   - Inspect `README.md` (or an automated docs check if available) to confirm the Labels section lists `factory:intake-rejected` with the new description so operators understand the signal.
