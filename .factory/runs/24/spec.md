# Selective Emoji For Factory Status Surfaces

## Summary
- Add a fixed emoji vocabulary to factory-managed PR surfaces so stage, CI, and operator cues scan quickly without removing existing text labels.
- Prefix automated status comments with their assigned emoji while keeping the message content and automation semantics unchanged.
- Back the mapping with tests so status rendering and comment copy remain deterministic.

## Current Behavior
- The PR body status block renders plain text values such as `plan_ready` and `pending` in `scripts/lib/github-messages.mjs:246-255`, making critical state changes easy to skim past.
- Operator guidance bullets in `scripts/lib/github-messages.mjs:268-272` have no visual distinction, so "start" vs. "pause" vs. "resume" instructions look identical.
- Plan-ready notifications use the template in `scripts/templates/github-messages/plan-ready-issue-comment.md`, while review-pass (CI green) comments use `scripts/templates/github-messages/review-pass-comment.md`—neither includes emoji.
- Blocked/failed stage comments are built directly in `buildFailureComment` inside `scripts/handle-stage-failure.mjs:21-70` and currently emit text-only copy.
- `tests/github-messages.test.mjs` verifies template rendering but does not assert any emoji-enhanced output, so regressions would go unnoticed.

## Proposed Changes

### 1. Status and CI Emoji Mapping
- Introduce deterministic maps for stage and CI states inside `scripts/lib/github-messages.mjs` (co-located with `renderPrBody`) that cover the required values:
  - Stage: `planning→📝`, `plan_ready→👀`, `implementing→🏗️`, `repairing→🛠️`, `blocked→⚠️`, `ready_for_review→✅`.
  - CI: `pending→⏳`, `success→✅`, `failure→❌`.
- Update the `STATUS_SECTION` assembly in `renderPrBody` (`scripts/lib/github-messages.mjs:246-255`) to prefix the emoji while keeping the existing text label (e.g., `- Stage: 🏗️ implementing`). For unmapped values (like `reviewing`), fall back to the plain text to avoid speculative icons.
- Ensure the hidden JSON metadata appended after the PR body remains unchanged so downstream parsing keeps working.

### 2. Operator Notes Cues
- Adjust the operator notes bullets (`scripts/lib/github-messages.mjs:268-272`) to prefix the specified single emoji for each instruction (`▶️` for start/resume, `⏸️` for pause) without altering the label text or required backticks.

### 3. Automated Comment Prefixes
- Update the plan-ready template (`scripts/templates/github-messages/plan-ready-issue-comment.md`) to begin with `👀` while preserving existing guidance and tokens.
- Update the review-pass template (`scripts/templates/github-messages/review-pass-comment.md`) so the first line starts with `✅`, highlighting ready-for-review status without changing the rest of the message structure.
- Prepend `⚠️` to the strings returned by `buildFailureComment` in `scripts/handle-stage-failure.mjs:21-70`, covering all blocked/failure scenarios in one place so every human-facing failure comment shares the same visual cue.

### 4. Tests
- Extend `tests/github-messages.test.mjs` to assert that `renderPrBody` renders the emoji-enhanced stage and CI lines for mapped values and falls back cleanly for an unmapped status.
- Update existing expectations for `renderPlanReadyIssueComment` and `renderReviewPassComment` in `tests/github-messages.test.mjs` to include the new emoji prefixes.
- Add coverage for `buildFailureComment` (exported for testing or exercised via a thin wrapper) in `tests/handle-stage-failure.test.mjs` to ensure blocked/failure comments start with `⚠️` regardless of failure type.

## Assumptions & Open Questions
- The `reviewing` status remains rare; displaying it without emoji is acceptable unless product direction changes.
- CI statuses other than `pending`, `success`, or `failure` (e.g., `skipped`) continue to display without emoji; we can extend the map later if needed.
- Prefixing failure comments with `⚠️` is appropriate even when we reset to `plan_ready` after content/logical failures, since the message still communicates a blocking outcome; confirm during implementation if operators prefer a different icon in that path.
- No changes are required to `.factory/prompts/*.md` or `.github/ISSUE_TEMPLATE/factory-request.yml`, keeping prompts machine-focused as mandated by the constraints.
