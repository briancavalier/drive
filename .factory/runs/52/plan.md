# Implementation Plan

## Work Breakdown
1. **Introduce follow-up analysis helpers**
   - Create `scripts/lib/failure-followup.mjs` with classification, signature building, dedup lookup, and issue body rendering utilities described in the spec.
   - Capture regex allowlist constants here and export them for reuse in tests.
   - Provide pure functions that accept injected GitHub search/create functions so higher-level code can remain thin.
2. **Extend GitHub client for issue workflows**
   - Add `createIssue` and `searchIssues` helpers to `scripts/lib/github.mjs`, including transient retry handling mirroring existing request logic.
   - Cover new helpers with unit tests (e.g., `tests/github.test.mjs`) to assert method, path, and retry policy.
3. **Wire follow-up creation into failure handling**
   - Update `scripts/handle-stage-failure.mjs` to accept optional dependency overrides for testing.
   - After building the failure comment, invoke the follow-up classifier; when actionable, compute signature, check for an open issue, and create one if none exists.
   - Append a short "Factory follow-up" section (with signature marker) to the posted comment when an issue is created or already tracked.
   - Ensure errors in follow-up creation are caught/logged without preventing the PR metadata update.
4. **Add targeted tests**
   - New suite (e.g., `tests/failure-followup.test.mjs`) validating classification, signature stability, issue body content, and dedup lookup behavior via stubs.
   - Extend `tests/handle-stage-failure.test.mjs` to exercise actionable vs ineligible flows using injected mock GitHub clients and confirm comment augmentation.
   - Update or add snapshots/golden strings for the issue body builder and comment append logic.
5. **Document the workflow**
   - Update `README.md` (failure-handling section) to describe the automated follow-up path, gating cues, and dedup behavior.

## Testing Strategy
- Run targeted unit suites: `node --test tests/failure-followup.test.mjs`, updated `tests/handle-stage-failure.test.mjs`, and relevant additions in `tests/github.test.mjs`.
- Execute the full test suite (`npm test` or equivalent) to ensure no regressions.
