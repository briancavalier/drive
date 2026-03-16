# Emoji-Enhanced Factory Status Specification

## Summary
- Add deterministic emoji prefixes to factory PR status text so high-signal states stand out while keeping the existing wording.
- Apply the same emoji vocabulary to CI status text, operator notes, and automated status comments for consistency.
- Guarantee emoji usage is additive (emoji + explicit text) and covered by tests so rendered outputs stay stable over time.

## Current Behavior
- `scripts/lib/github-messages.mjs` renders the PR body with plain-text lines such as `Stage: plan_ready` and `CI: pending`; the only differentiation is the raw status string.
- Operator notes in the PR body are bullet points without visual prefixes, making it easy to miss start/pause instructions.
- `scripts/templates/github-messages/plan-ready-issue-comment.md` and `review-pass-comment.md` begin directly with prose, so notification previews lack a visual cue.
- `scripts/handle-stage-failure.mjs` builds blocked/failure comments without a leading indicator, producing dense paragraphs in timelines.
- Tests in `tests/github-messages.test.mjs` and `tests/handle-stage-failure.test.mjs` only assert structural behavior (tokens, labels, status updates) and do not pin any emoji-enhanced output.

## Proposed Changes

### Shared Display Helpers
- Introduce constant maps in `scripts/lib/github-messages.mjs` for stage/CI emoji (`planning → 📝`, `plan_ready → 👀`, `implementing → 🏗️`, `repairing → 🛠️`, `blocked → ⚠️`, `ready_for_review → ✅`, `pending → ⏳`, `success → ✅`, `failure → ❌`).
- Add a local utility (e.g., `formatWithEmoji(mapping, value)`) that returns `"<emoji> <value>"` when mapped and falls back to the raw value otherwise, preserving text for unlisted statuses like `reviewing`.

### PR Body Rendering
- Update the `STATUS_SECTION` builder so the Stage line becomes `Stage: <emoji> <status>` using the stage map, keeping the exact status token after the emoji.
- Update the CI line to `CI: <emoji> <ciStatus>` using the CI map; other CI states still render without emoji.
- Prefix operator note bullets with the specified icons while retaining the existing explanatory text:
  - `▶️` for “Apply \`factory:implement\`...” and “Remove \`factory:paused\`...” instructions.
  - `⏸️` for the pause instruction.
- Leave `.factory/prompts/*.md` untouched to satisfy the constraint on machine-facing prompts.

### Automated Comments
- Update `scripts/templates/github-messages/plan-ready-issue-comment.md` to start with `👀 ` while keeping the current text and tokens.
- Update `scripts/templates/github-messages/review-pass-comment.md` so the opening sentence begins with `✅ ` without altering the underlying review metadata.
- Modify `scripts/handle-stage-failure.mjs` so every comment returned by `buildFailureComment` is prefixed with `⚠️ `. Export `buildFailureComment` for targeted testing, ensuring the prefix is applied exactly once across all branches.

### Testing
- Extend `tests/github-messages.test.mjs` to assert that the default PR body renders `Stage: 👀 plan_ready`, `CI: ⏳ pending` (or relevant mappings), and operator note bullets with the prescribed emoji.
- Update existing plan-ready comment and review-pass tests to expect the new emoji prefixes.
- Add a focused test (via the newly exported helper) verifying `buildFailureComment` returns strings that start with `⚠️` for blocked scenarios and content failures.
- Cover an unknown status fallback case to confirm the helper returns text without an emoji when the status is not in the map.

## Assumptions & Questions
- The exposed status values remain the canonical snake_case identifiers; adding emojis should not introduce human-friendly aliases.
- CI states beyond `pending`, `success`, and `failure` should remain rare; they will degrade gracefully without emoji until a future enhancement.
- Exporting `buildFailureComment` is acceptable because the module is only consumed internally, and the extra export does not affect CLI usage.
