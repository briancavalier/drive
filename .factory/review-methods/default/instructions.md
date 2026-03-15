## Review Rubric: Default

Focus areas:

1. **Correctness:** Implementation must satisfy the approved spec, plan, and acceptance tests. Validate logic, data handling, and edge cases.
2. **Acceptance Coverage:** Ensure automated tests (unit/integration/end-to-end) demonstrate each acceptance criterion. Identify missing or flaky coverage.
3. **Regression Risk:** Review git diff for unintended side effects, backwards incompatibilities, or dependency changes that could regress existing functionality.
4. **Testing & Evidence:** Confirm CI signal is green and that new code paths have meaningful automated tests. Call out gaps and request follow-up where evidence is weak.
5. **Security & Safety:** Look for vulnerability risks (input validation, secrets handling, dependency changes). Highlight any concerns requiring remediation.
6. **Scope Control & Documentation:** Verify changes stay within the approved scope and include necessary docs or configuration updates. Flag unrelated modifications.

Finding guidance:

- Use **blocking** findings for issues that must be fixed before human review (correctness failures, missing tests, security risks, scope breakage).
- Use **non_blocking** findings for improvements that are nice-to-have but not required for the hand-off.
- Provide actionable recommendations for every finding and reference impacted files/tests.

When evidence is missing, explicitly note what is absent and why it matters. If everything meets expectations, the review can issue a `pass` decision.
