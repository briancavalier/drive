# Acceptance Tests: Improve Traceability Scanability

## Automated
1. **Canonical renderer emits status icons and counts** — Update `tests/review-artifacts.test.mjs` (or add a new case) to assert that `renderCanonicalTraceabilityMarkdown` produces:
   - `<summary>` lines that include aggregated status counts for each status present.
   - Requirement bullets that start with the mapped status icon + label (e.g., `- ✅ **Satisfied**:`) and no longer contain "- Requirement:" lines.
2. **Normalization rewrites drifted traceability to the new layout** — Ensure the existing normalization test in `tests/review-artifacts.test.mjs` verifies that replacing a drifted section yields the new status-first bullets and evidence labeling.
3. **Process review path accepts updated markdown** — Update `tests/process-review.test.mjs` to confirm that ingesting review artifacts results in `reviewMarkdown` containing the new format (icons + evidence bullets) and that no residual "Requirement:"/"Status:" strings remain.
4. **Prepare stage push normalizes outputs** — Update `tests/prepare-stage-push.test.mjs` to assert that the normalized `review.md` written to disk uses the new format (summary counts + status-first bullets) before staging.
5. **Review conversation body keeps new traceability section when truncated** — Adjust `tests/github-messages.test.mjs` expectations so the truncated body retains the new traceability summary + bullet layout when enforcing character limits.

## Manual (if needed)
- Spot-check a generated review comment in GitHub (or markdown preview) to verify that the summary status counts and status-first bullets improve scanability without collapsing `<details>` behavior.
