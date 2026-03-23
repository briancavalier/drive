# Specification: Scope/Priority Tradeoff Implement Intervention

## Summary
- Extend the implement stage so it can pause with a structured scope/priority tradeoff question when multiple valid delivery shapes remain.
- Reuse the existing intervention plumbing so the PR comment surfaces bounded answer options without introducing new commands.
- Persist the chosen tradeoff decision as binding implement guidance and clear it when the run advances past the decision point.

## Functional Requirements
- Implement stage authored intervention requests must support a new `questionKind: "scope_priority"` alongside the current `"ambiguity"` flow. Requests continue to be written to `.factory/tmp/intervention-request.json` with the same envelope.
  - Tradeoff requests must define 2 or 3 options, with at least two `effect: "resume_current_stage"` choices that include non-empty `instruction` strings describing the scope to resume with. A single `manual_only` escape hatch remains optional.
  - `recommendedOptionId` must reference one of the resumable options so the PR comment can highlight the preferred scope.
- `scripts/detect-stage-intervention-request.mjs` must validate and normalize both ambiguity and scope/priority requests, rejecting malformed payloads (e.g., missing instructions, too few resumable options, unknown question kinds) and surfacing precise error messages.
- `scripts/handle-stage-intervention-request.mjs` must propagate the `questionKind` supplied by the request instead of hard-coding ambiguity so the posted intervention and comment preserve whether the pause was for ambiguity or a scope/priority tradeoff.
- Answering a scope/priority question with a resumable option must persist a `pendingStageDecision` entry whose `kind` mirrors the intervention `questionKind`, captures the selected option metadata, and records who answered.
  - The resumed implement prompt must already display the `Human Decision` block for `pendingStageDecision`; update copy if needed so `Decision kind` correctly reflects `scope_priority` values.
- When the factory advances past the tradeoff (e.g., resets to blocked via a new question, or completes and records a successful stage), `pendingStageDecision` must be cleared using the same cleanup paths that already clear ambiguity decisions. No regression to existing ambiguity or approval flows is allowed.

## Non-Functional Requirements
- Keep the question/answer GitHub comment template unchanged aside from reflecting the new `questionKind` metadata. The rendered options must remain fenced commands that align with existing operator expectations.
- All new logic should rely on existing helper utilities (`buildQuestionIntervention`, `defaultQuestionInterventionPayload`, `renderInterventionQuestionComment`) instead of duplicating serialization code.
- Validation errors raised for tradeoff questions should remain actionable and follow the existing tone (`Invalid implement-stage …`).

## Edge Cases & Data Handling
- Whitespace-only instructions or labels must be treated as empty and rejected during validation.
- Requests authored outside implement mode must still be rejected even if they set `questionKind: "scope_priority"`.
- Manual-only options included in tradeoff requests must not count toward the resumable-option minimum and must not require instructions.
- `pendingStageDecision` normalization (`scripts/lib/pr-metadata-shape.mjs`) already accepts arbitrary kinds; no schema changes are required, but tests must cover the new `scope_priority` value.

## Assumptions
- The implement stage will continue to author intervention requests by hand-writing JSON; no new CLI wrappers are necessary.
- Operators expect two concrete scope options for tradeoff questions, so we can require at least two resumable options before accepting the request.
- Existing stage-success workflows already clear `pendingStageDecision` via `FACTORY_PENDING_STAGE_DECISION="__CLEAR__"`; ensuring the new kind follows the same path keeps life-cycle behavior consistent.

## Risks & Mitigations
- **Risk:** Relaxing validation could let malformed requests through, breaking the question handler. **Mitigation:** Add targeted unit tests for both accepted and rejected scope/priority payloads.
- **Risk:** Forgetting to persist the new `kind` would drop guidance on resume. **Mitigation:** Extend `apply-intervention-answer` tests to assert the stored decision kind equals `scope_priority` for tradeoff answers.
- **Risk:** Decisions lingering after completion could cause outdated instructions to bleed into future runs. **Mitigation:** Confirm (and, if necessary, augment) cleanup paths with tests that simulate successful stage completion clearing `pendingStageDecision`.
