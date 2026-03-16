## Review Rubric: Default

Review procedure:

1. Read the approved `spec.md`, `plan.md`, `acceptance-tests.md`, relevant CI evidence, and the current git diff before deciding.
2. Produce a compact **Traceability** section in `review.md` that covers:
   - every acceptance criterion
   - each major spec commitment touched by the change
   - each plan deliverable touched by the change
3. For every traceability item, record:
   - type: `acceptance_criterion`, `spec_commitment`, or `plan_deliverable`
   - requirement text
   - status: `satisfied`, `partially_satisfied`, `not_satisfied`, or `not_applicable`
   - concrete evidence such as changed files, tests, CI jobs, or artifact evidence
4. If evidence is missing for a changed requirement, record that gap explicitly and treat it as a finding.
5. Do not issue a `pass` decision if any requirement check is `partially_satisfied` or `not_satisfied`.

Focus areas:

1. **Correctness:** Implementation must satisfy the approved spec, plan, and acceptance tests. Validate logic, data handling, and edge cases.
2. **Acceptance Coverage:** Ensure automated tests demonstrate each acceptance criterion and changed high-risk path. Identify missing, weak, or flaky coverage.
3. **Regression Risk:** Review the diff for unintended side effects, backwards incompatibilities, migrations, dependency changes, and behavior changes outside the requested scope.
4. **Testing & Evidence:** Confirm CI signal is green and that the evidence cited in traceability is specific and relevant to the changed behavior.
5. **Security & Safety:** Look for security, privacy, validation, secrets-handling, and destructive-operation risks requiring remediation.
6. **Scope Control & Documentation:** Verify the change stays within the approved scope or clearly justifies safe deviations, and includes required docs/config updates.

Finding guidance:

- Use **blocking** findings for issues that must be fixed before human review, including correctness failures, unmet acceptance criteria, insufficient evidence for changed behavior, security risks, and scope breakage.
- Use **non_blocking** findings for improvements that are useful but not required for hand-off.
- Provide actionable recommendations for every finding and reference impacted files, tests, or CI evidence.
- Avoid speculative, stylistic, or low-confidence findings unless they materially affect correctness, safety, or operability.

If everything meets expectations, the review can issue a `pass` decision only when all requirement checks are `satisfied` or `not_applicable`.
