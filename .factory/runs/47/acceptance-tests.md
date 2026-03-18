# Acceptance Tests

1. **Model metadata helper covers all resolution paths**
   - Run `node --test tests/factory-config.test.mjs`; confirm the new tests verify the helper returns the expected `model`, `source`, and `sourceVariable` values for override, stage-specific, shared, and default cases.
2. **Invalid model alias fails preflight with actionable guidance**
   - Execute `node --test tests/validate-stage-model.test.mjs` and check the case that simulates a 404 response asserts the failure message names the resolved model and the appropriate configuration variable.
3. **Authorization errors surface configuration guidance**
   - In the same test suite, ensure the 401 path reports a configuration failure rather than silently succeeding, matching the acceptance criteria for actionable operator feedback.
4. **Workflow wiring exports preflight failures**
   - Run `node --test tests/factory-config-contracts.test.mjs`; confirm it now asserts the validation step exists and that job outputs prefer `steps.model_preflight` for `failure_message` / `failure_type`.
5. **Blocked comment renders the specific failure message**
   - Execute `node --test tests/failure-comment.test.mjs` and verify the configuration failure test checks that custom messages appear inside the fenced code block so the PR comment shows the operator guidance verbatim.
