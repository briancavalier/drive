# Plan

1. Review the existing intervention-rendering logic in `scripts/lib/github-messages.mjs` to document how the current header, answer section, and details block are assembled, and identify all inputs (summary, recommended option, run id/url, detail, options).
2. Adjust `renderInterventionQuestionComment` in `scripts/lib/github-messages.mjs` so it produces the new dashboard-style header block, updates the heading to `### Answer With`, and conditionally emits summary, recommendation, and run context lines without disturbing metadata serialization or option ordering.
3. Update the unit coverage in `tests/github-messages.test.mjs` to lock in the new layout, including cases with recommended options, unknown effects, missing detail, and missing recommended/run context values; add assertions that the metadata comment still matches the prior JSON structure.
4. Run the relevant test subset (`npm test -- github-messages`) or full suite as needed to confirm formatting expectations and guard against regressions in other templates consuming `renderInterventionQuestionComment`.
