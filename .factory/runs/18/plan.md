# Implementation Plan

## Work Breakdown
1. **Introduce commit message helper**
   - Create `scripts/lib/commit-message.mjs` with `buildCommitMessage` plus internal helpers for parsing staged diffs, categorising files, and composing descriptors.
   - Reuse `parseChangedFiles` from `scripts/lib/stage-push.mjs` and add focused utilities for handling rename entries and branch/slug fallbacks.
2. **Implement descriptor heuristics**
   - Encode bucket weights (`code`, `tests`, `docs`, `artifacts`) and fixed mappings for planning files.
   - Build deterministic descriptor selection utilities (base-name extraction, parent fallback, camel/kebab/snake splitting, test merging).
   - Add verb determination logic handling add/remove/update cases.
3. **Update stage commit script**
   - In `scripts/prepare-stage-push.mjs`, gather `git diff --cached --name-status` after staging and hand it to `buildCommitMessage` with `{ mode, issueNumber, branch }`.
   - Use the returned subject for `git commit -m` and emit a log line showing the final summary while preserving existing guardrails.
4. **Add unit tests**
   - Create `tests/commit-message.test.mjs` covering implement, repair, fallback, rename, and truncation flows (including verb selection).
   - Include helper fixtures for staged diff lines and verify repair mode appends the issue number.
5. **Regression checks**
   - Run the existing test suite to confirm no regressions in other stage helpers.

## Dependencies & Notes
- `scripts/lib/stage-push.mjs` already parses name-status entries; ensure new helper consumes the same shape to avoid duplication.
- The helper must avoid non-deterministic output (sorting, tie-breaking) to keep history readable.
- When updating `prepare-stage-push.mjs`, take care not to break existing output wiring (`setOutputs`, remote head checks).
- Logging must stay concise so GitHub Actions logs remain readable.
