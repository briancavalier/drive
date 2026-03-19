# Plan: Improve Traceability Scanability

## Implementation Steps
1. **Refactor traceability rendering helpers**
   - Update `scripts/lib/review-output.mjs` to introduce status→icon/label helpers, compute per-group status counts, and emit the new bullet-oriented layout for both `renderCanonicalTraceabilityMarkdown` and `renderTraceabilityDetails`.
   - Ensure the canonical function still begins with `## 🧭 Traceability` and that `<details>` summaries include aggregated status counts ordered by severity.
2. **Propagate helper usage where traceability markdown is normalized**
   - Verify `scripts/lib/review-artifacts.mjs` and any other callers rely only on the canonical renderer output; adjust imports or helper usage if needed after the refactor.
3. **Refresh fixtures and assertions**
   - Update expectations in `tests/review-artifacts.test.mjs`, `tests/process-review.test.mjs`, `tests/prepare-stage-push.test.mjs`, and `tests/github-messages.test.mjs` to match the new canonical strings (status icons, evidence bullets, summary counts).
   - Add focused assertions that confirm summary count formatting and the presence of status icons for mixed-status groups.
4. **Documentation touch-up**
   - Revise the relevant section in `README.md` (or other docs referencing traceability layout) to describe the new status-forward format.
5. **Validation**
   - Run the existing automated test suite (`npm test`) and ensure updated snapshots/fixtures pass without additional regressions.

## Impacted Areas
- Traceability markdown rendering (`scripts/lib/review-output.mjs`).
- Review artifact normalization and conversation body composition (`scripts/lib/review-artifacts.mjs`, `scripts/lib/github-messages.mjs`).
- Unit and integration tests validating canonical review output (`tests/**`).
- Developer documentation describing traceability output (`README.md`).

## Assumptions & Dependencies
- No other components parse the literal "Requirement:"/"Status:" strings; updating tests suffices.
- Emoji icons render reliably in GitHub review comments and within `<details>` summaries.
- The plan reuses existing tooling; no new dependencies are required.

## Testing Strategy
- Rely on the updated automated tests in the listed files to exercise canonical rendering, normalization, and comment truncation behavior.
- Validate mixed-status rendering by adding a unit test that covers multiple status types in a single group.
- Spot-check generated markdown manually if necessary to confirm visual hierarchy (no automated screenshot testing available).
