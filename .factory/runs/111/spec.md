# Shared Ask-Human Policy Helpers (Run 111)

## Overview
- Introduce a shared policy layer that decides when the factory should ask a human, auto-continue, or fail for question-producing flows.
- Preserve the deliverables and side-effects of the current implement ambiguity and self-modify approval behaviors while routing both through the shared policy helper.
- Capture decision rationales in structured metadata so future question producers can reuse the same policy surface without duplicating thresholds or logic.

## Current Behavior
- `scripts/handle-stage-intervention-request.mjs` builds and posts an ambiguity question whenever an implement-stage run writes `.factory/tmp/intervention-request.json`. It never considers repeated failure history or whether the request can be auto-resolved.
- `scripts/handle-stage-failure.mjs` embeds policy for self-modify guard failures inline, always converting them into approval interventions.
- Neither script exposes a common decision contract; thresholds such as repeated-failure limits are either absent or baked into separate utilities. Additional question producers must re-implement the same reasoning from scratch.

## Target Policy & Helper API
- Add `scripts/lib/question-policy.mjs` exporting:
  - `normalizeDecisionFactors(raw)` → validated factors `{ trigger, stage, ambiguity, reversible, expectedRework, requiresHumanAuth, repeatedFailureCount, repeatedFailureLimit }` with defaults.
  - `resolveQuestionPolicy(factors)` → `{ decision: "ask" | "auto_continue" | "fail", reasonCode, reasonText, repeatedFailureCount, repeatedFailureLimit }` using the rules below.
  - `buildAutonomyDecision({ policy, request, actor })` → optional payload describing which option should be auto-selected and how to annotate the PR when choosing `auto_continue`.
- Decision rules (shared across triggers):
  1. If `requiresHumanAuth` is true and `repeatedFailureCount < repeatedFailureLimit`, return `ask`; when the count meets/exceeds the limit, escalate to `fail` with reason `authorization_still_missing`.
  2. Otherwise, if `repeatedFailureCount >= repeatedFailureLimit`, return `fail` with reason `repeated_failure`.
  3. Otherwise, if `ambiguity === "high"`, `expectedRework === "high"`, or `reversible === false`, return `ask`.
  4. Otherwise, prefer `auto_continue` when a resumable option exists; fall back to `fail` with reason `no_resumable_option` when the helper cannot identify a safe option to resume autonomously.
- Default limits: `repeatedFailureLimit = 2` to match existing repair gating; triggers may override (e.g., self-modify approval keeps the same limit but still honours the helper for traceability).
- The helper emits structured `policyLog` entries that downstream scripts add to PR comments to explain why a question was asked or skipped.

## Decision Factor Sources
- Implement ambiguity requests extend the request schema with an optional `policyContext` block:
  ```json
  {
    "ambiguity": "high" | "medium" | "low",
    "reversible": true | false,
    "expected_rework": "high" | "medium" | "low",
    "requires_human_authority": true | false
  }
  ```
  Missing fields default to `{"ambiguity":"high","reversible":false,"expected_rework":"high","requires_human_authority":false}` so legacy requests continue working.
- Self-modify guard failures feed the helper with a derived context: `ambiguity:"low"`, `reversible:false`, `expectedRework:"medium"`, `requiresHumanAuth:true`, `repeatedFailureCount` from the current failure payload.

## Integration Targets
- `scripts/detect-stage-intervention-request.mjs`
  - Parse optional `policyContext`, validate enumerated values, and surface them alongside the legacy ambiguity payload.
  - Persist the normalized factors into the request JSON passed forward (so downstream scripts do not reparse raw strings).
  - Extend unit tests to cover valid and invalid `policyContext` inputs.
- `scripts/handle-stage-intervention-request.mjs`
  - Replace inline question-building with `resolveQuestionPolicy`.
  - When decision is `ask`, keep the existing ambiguity question behavior but include the helper's `reasonText` in the PR comment for traceability.
  - When decision is `auto_continue`, synthesize an automatic ambiguity decision (using `buildAutonomyDecision` and the request's recommended option) and immediately resume the blocked stage—no `metadata.intervention` should remain open.
  - When decision is `fail`, convert the request into a `stage_setup` failure using the helper-provided reason code and keep the PR blocked.
  - Ensure all outcomes preserve existing side effects (labels, resume context, `FACTORY_PENDING_STAGE_DECISION` when resuming).
- `scripts/handle-stage-failure.mjs`
  - Use `question-policy` with the derived factors before constructing the approval intervention.
  - Continue emitting an approval question today, but rely on the helper to document the decision and to guard future overrides (e.g., after repeated denials).
- `scripts/lib/github-messages.mjs`
  - Add helper renderers for automatic ambiguity resolutions and policy traceability notes so comments remain consistent.
- `.factory/prompts/implement.md`
  - Update operator instructions to mention the `policyContext` block and provide a quick reference for acceptable values so future runs populate the metadata.

## Testing Impact
- New `tests/question-policy.test.mjs` covering `resolveQuestionPolicy` decision boundaries (ask vs auto vs fail, repeated failure limit, missing resumable options).
- Update `tests/detect-stage-intervention-request.test.mjs` for the extended schema and validation errors.
- Extend `tests/handle-stage-intervention-request.test.mjs` to assert:
  - Policy-driven question flow still matches current behavior.
  - Auto-continue path clears interventions and resumes implementation with a pending decision from the recommended option.
  - Fail path emits a stage-setup failure and blocks the PR.
- Update `tests/handle-stage-failure.test.mjs` to confirm the helper is invoked (e.g., by stubbing it) and behavior remains unchanged.
- Add snapshot assertions for the new comment fragments in `tests/github-messages.test.mjs`.

## Assumptions & Open Questions
- Auto-continue is only valid when the ambiguity request includes a `resume_current_stage` option with an instruction; if missing, the helper must choose `fail`.
- Repeated failure counts for self-modify guard remain low enough that no new failure path is triggered in current workflows, but the helper still records the count for observability.
- No other question-producing scripts exist today; adopting the helper elsewhere in the future will require only assembling the appropriate factor payload.
- Need confirmation on preferred wording for policy traceability notes in PR comments; placeholder copy will be used unless maintainers provide alternatives during implementation.
