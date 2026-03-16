# Acceptance Tests

1. **Invalid review artifacts block the push**
   - Run the new validator-focused test (e.g., `node --test tests/prepare-stage-push.test.mjs`) with a fixture that omits the canonical traceability block; the test (and stage script) must throw before creating a commit.
2. **Valid review artifacts still produce a commit**
   - Execute the happy-path scenario in `tests/prepare-stage-push.test.mjs` to confirm review mode passes when `review.md`/`review.json` are valid and the stage reports the expected commit subject.
3. **Self-generated review commit does not retrigger review**
   - Run the updated `tests/event-router.test.mjs`; verify the case where `metadata.pendingReviewSha` matches `workflowRun.head_sha` returns `noop`.
4. **New branch updates still trigger review**
   - In the same router test suite, confirm the scenario with a different `head_sha` yields `action === "review"`.
5. **Process review clears the pending SHA**
   - Run the augmented `tests/apply-pr-state-metadata.test.mjs` (or the relevant new test) to ensure `process-review` success/request-changes paths set `pendingReviewSha` to `null`.
6. **Workflow documentation reflects the guard**
   - Inspect `_factory-stage.yml` and verify the added comment explains why the review job records and later clears `pendingReviewSha` so operators can diagnose suppressed reruns.
