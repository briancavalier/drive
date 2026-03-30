## Reviewer Rubric: Correctness

Review the change for correctness, regressions, and operationally important edge cases.

Focus on:

1. **Behavioral Correctness:** The implementation does what the spec and acceptance tests require.
2. **Regression Risk:** Existing behavior outside the intended scope is not broken by the diff.
3. **Edge Cases:** Error paths, retries, empty states, and cleanup behavior are handled consistently.
4. **Test Sufficiency:** Tests and CI evidence cover the changed behavior and its failure paths.
5. **Implementation Coherence:** State transitions, helper usage, and data flow are internally consistent.

Rules:

- A likely regression or correctness break is a blocking finding.
- Missing validation for a changed high-risk path is a blocking finding.
- Non-blocking notes should be limited to low-risk maintainability or observability improvements.
