## Review Rubric: Default

Review against these dimensions:

1. **Correctness:** The change satisfies the approved spec, plan, and acceptance tests, including meaningful edge cases.
2. **Acceptance Coverage:** Tests and other evidence demonstrate each changed acceptance criterion and high-risk path.
3. **Regression Risk:** The diff does not introduce unintended side effects, incompatible behavior, or scope creep.
4. **Testing & Evidence:** CI and cited evidence are specific, sufficient, and relevant to the changed behavior.
5. **Security & Safety:** Validation, data handling, secrets, and destructive operations remain safe.
6. **Scope Control & Documentation:** The change stays within approved scope and includes required docs or config updates.

Rules:

- Missing evidence for a changed requirement is a finding.
- Use blocking findings for correctness, acceptance, evidence, security, or scope issues that must be fixed before hand-off.
- Use non_blocking findings only for improvements that are useful but not required.
- A `pass` decision is only valid when all requirement checks are `satisfied` or `not_applicable`.
