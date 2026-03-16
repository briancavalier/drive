# Emoji Status Enhancements

## Summary
Introduce a fixed emoji vocabulary to factory-managed PR bodies and automated comments so that high-signal states (stage, CI, operator cues) are easier to scan while preserving existing text, metadata, and automation semantics.

## Current Behavior
- `renderPrBody` in `scripts/lib/github-messages.mjs` renders status lines without emoji (e.g., `- Stage: planning`).
- Operator guidance in the PR body is plain text without visual cues.
- Automated comments produced by `scripts/finalize-plan.mjs`, `scripts/handle-stage-failure.mjs`, and `scripts/process-review.mjs` do not prefix messages with distinctive icons.
- Tests in `tests/github-messages.test.mjs` and related suites assert the current plain-text copy.

## Requirements
- Stage line in the PR body must render the emoji + text mapping:
  - `planning` → `📝 planning`
  - `plan_ready` → `👀 plan_ready`
  - `implementing` → `🏗️ implementing`
  - `repairing` → `🛠️ repairing`
  - `blocked` → `⚠️ blocked`
  - `ready_for_review` → `✅ ready_for_review`
- CI line in the PR body must render the emoji + text mapping:
  - `pending` → `⏳ pending`
  - `success` → `✅ success`
  - `failure` → `❌ failure`
- Operator note bullets use emoji prefixes only for the prescribed actions:
  - start coding after plan review → `▶️ Apply …`
  - pause autonomous work → `⏸️ Apply …`
  - resume autonomous work → `▶️ Remove …`
- Plan-ready issue comment is prefixed with `👀 `.
- Blocked-state comments emitted from `scripts/handle-stage-failure.mjs` are prefixed with `⚠️ ` while keeping their explanatory copy.
- CI green / ready-for-review comments emitted by `renderReviewPassComment` are prefixed with `✅ `.
- All additions are additive: existing text remains intact, metadata markers continue to parse, and `.factory/prompts/*.md` plus `.github/ISSUE_TEMPLATE/factory-request.yml` stay untouched.
- Tests cover the emoji mappings so regressions are caught.

## Proposed Changes
- Extend `renderPrBody` to decorate stage and CI values via deterministic lookup helpers defined in `scripts/lib/github-messages.mjs`. Values outside the mapping (e.g., `reviewing`) retain plain text.
- Adjust the `STATUS_SECTION` template strings so the rendered bullets include both emoji and existing text plus maintain metadata serialization at the bottom of the body.
- Update the operator notes copy in the variables block that feeds `pr-body.md` to insert the specified emoji prefixes without altering label names.
- Patch `scripts/templates/github-messages/pr-body.md` only if needed for clarity; primary changes live in the rendering logic so overrides inherit emoji automatically.
- Update `scripts/templates/github-messages/plan-ready-issue-comment.md` and `review-pass-comment.md` to include the required emoji prefixes.
- Prepend emoji in `buildFailureComment` within `scripts/handle-stage-failure.mjs`, ensuring shared helper applies for all blocked comment variants.
- Add targeted unit coverage in `tests/github-messages.test.mjs` (and other affected suites) to assert the new emoji rendering for PR body stage/CI lines and automated comment outputs.

## Assumptions
- `reviewing` (and any future unmapped status) should continue to display without emoji; only the enumerated statuses gain icons.
- Existing comment overrides in `.factory/messages/` should inherit emoji because the base templates change; no overrides currently inject conflicting emoji.
- Notification feeds respect Unicode emoji without breaking formatting.

## Risks & Mitigations
- **Risk:** Emoji clutter or reduced seriousness. Mitigation: restrict usage to the mandated prefix list and keep all underlying text.
- **Risk:** Downstream parsing of comment text. Mitigation: confirm automation only reads hidden metadata and not human-facing copy.

## Open Questions
- None identified; requirements are explicit.
