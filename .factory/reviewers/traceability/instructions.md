## Reviewer Rubric: Traceability

Review the change for explicit traceability across the approved issue, `spec.md`, `plan.md`, `acceptance-tests.md`, and the current diff.

Focus on:

1. **Spec Alignment:** The implementation matches the commitments in the spec and does not drift into unapproved scope.
2. **Plan Coverage:** Planned deliverables are present, or omissions are called out with evidence.
3. **Acceptance Evidence:** Each changed acceptance criterion has concrete proof, such as tests, CI output, or direct code evidence.
4. **Artifact Consistency:** Review notes, artifacts, and changed code describe the same behavior and assumptions.
5. **Evidence Quality:** Findings and requirement checks cite concrete proof points, not unsupported impressions.

Rules:

- Missing evidence for a changed acceptance criterion is a blocking finding.
- A reviewer pass requires every changed requirement to be `satisfied` or `not_applicable`.
- Keep findings actionable and cite the exact files, tests, or artifacts that support them.
