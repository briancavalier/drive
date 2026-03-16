# Implementation Plan

1. **Introduce emoji mapping helpers**
   - Add stage and CI emoji lookup utilities in `scripts/lib/github-messages.mjs`, returning `${emoji} ${label}` only for known values.
   - Ensure unmapped values fall back to their raw text so unexpected statuses remain readable.

2. **Update PR body rendering**
   - Modify the `STATUS_SECTION` construction in `renderPrBody` to use the new helpers for stage and CI bullets while keeping repair attempt lines untouched.
   - Adjust operator guidance strings within `OPERATOR_NOTES_SECTION` to include the required emoji prefixes without changing label literals.
   - Confirm metadata serialization appended to the PR body stays unchanged.

3. **Refresh GitHub message templates**
   - Prefix plan-ready comment template (`scripts/templates/github-messages/plan-ready-issue-comment.md`) with `👀`.
   - Prefix review pass comment template (`scripts/templates/github-messages/review-pass-comment.md`) with `✅` while keeping dynamic content intact.
   - Validate no other templates require modification per requirements.

4. **Apply blocked comment emoji**
   - Update `buildFailureComment` in `scripts/handle-stage-failure.mjs` to prepend `⚠️` to every human-facing blocked message, accounting for all conditional branches.

5. **Update and extend tests**
   - Refresh expectations in `tests/github-messages.test.mjs` (and any other affected suites) to cover new emoji output for PR body stage/CI lines, operator notes, plan-ready comment, blocked comment, and review pass comment.
   - Add explicit assertions for status and CI emoji mappings so future regressions are caught.

6. **Self-review and verification**
   - Run relevant test suites (at minimum `node --test tests/github-messages.test.mjs`) to ensure deterministic emoji rendering and unchanged metadata.
   - Inspect generated PR body snapshot to confirm emoji presence and formatting.
