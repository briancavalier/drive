# Acceptance Tests

- **PASS comment structure**: Run `npm test -- github-messages.test.mjs` and confirm the PASS scenario emits a single `🧭 Traceability` `<details>` block, wraps Summary/Blocking/Non-Blocking sections in `<details>`, and omits any `decision:` strings.
- **REQUEST_CHANGES structure**: Simulate a failing review via `tests/process-review.test.mjs` and verify the GitHub review body uses the curated layout with collapsible sections and exactly one traceability block.
- **Regression for PR #134**: Add or update a unit test that feeds a `review.md` containing manual `decision:` lines and duplicate traceability; ensure the composed body filters the extras and still links artifacts.
- **Truncation guardrail**: Execute the truncation-focused test in `tests/github-messages.test.mjs` to confirm the body trims safely while retaining the traceability anchor and the truncation notice.
