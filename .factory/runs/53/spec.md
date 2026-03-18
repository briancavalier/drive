# Stage No-Op and Setup Failure Recovery Specification

## Summary
- Introduce dedicated `stage_noop` and `stage_setup` failure types so no-change runs and setup errors are no longer lumped into generic logic/configuration failures.
- Collect branch-local diagnostics (working tree status, head comparison, staged diff summary) during stage preparation and surface them in failure messages and operator comments.
- Track bounded recovery metadata for repeated no-op/setup failures and adjust state transitions plus failure comments to steer targeted retries instead of immediate blocking.
- Update prompts, failure-handling workflows, and documentation so operators understand the new classifications and the factory can skip advisory re-diagnosis when it already has deterministic evidence.

## Current Behavior
- `scripts/prepare-stage-push.mjs` throws `Codex completed without producing repository changes.` when HEAD matches `origin/<branch>` after a stage run. The message is classified as `content_or_logic`, leaving operators without diagnostics that explain whether it was a no-op or a logic failure.
- Setup failures that occur before a branch update (missing PAT for workflow edits, missing review artifacts, Codex execution abort) all bubble up as `configuration` without distinguishing branch preconditions from control-plane defects.
- `handle-stage-failure.mjs` records the failure type but provides identical recovery steps for content failures, so operators cannot tell when a rerun is safe or when configuration needs attention.
- There is no metadata that bounds repeated no-op/setup retries. The factory either blocks immediately or requires manual investigation to decide whether re-labeling `factory:implement` is safe.
- Failure diagnosis prompts still run Codex for these deterministic cases, consuming tokens without adding value.

## Proposed Changes

### 1. Failure taxonomy and detection
- Extend `FAILURE_TYPES` in `scripts/lib/failure-classification.mjs` with:
  - `stage_noop` for runs that finish with no repo delta.
  - `stage_setup` for configuration/setup errors discovered before stage output is prepared.
- Add explicit classifiers:
  - Match the new `prepare-stage-push` no-op message (`Stage run completed without preparing repository changes.`) before falling back to `content_or_logic`.
  - Match setup guardrails (missing `FACTORY_GITHUB_TOKEN`, workflow guardrail messages, Codex bootstrap failures) and map them to `stage_setup`.
- Update `.github/workflows/_factory-stage.yml` to emit `failure_type=stage_setup` for the `codex_failure` step so Codex launch failures are typed consistently.
- Ensure `scripts/prepare-stage-push.mjs`:
  - Gathers `git status --short`, `git diff --name-status origin/<branch>...HEAD`, commit head hashes, and staged file counts before deciding no-op vs setup failure.
  - Throws a structured error for no-op runs that includes a diagnostics block (e.g., working tree clean, staged files 0, head equality).
  - Preserves existing guardrail errors but wraps them with a `Stage setup prerequisites failed:` prefix, allowing the classifier to recognize them.
- Skip failure diagnosis for the new types by adding them to the short-circuit list in `factory-pr-loop.yml` (`case ... in` block) so deterministic failures do not spawn Codex advisories.

### 2. Evidence and operator guidance
- Add a `renderStageDiagnostics` helper (either within `prepare-stage-push.mjs` or a new `scripts/lib/stage-diagnostics.mjs`) that returns a short multi-line summary of:
  - Local vs remote head.
  - Commit distance (`git rev-list --count origin/<branch>..HEAD`).
  - Staged/worktree file counts and sample file list (first 5 entries).
  - Whether `FACTORY_GITHUB_TOKEN` was available when workflow changes were detected.
- Include this diagnostics summary in the thrown error for both `stage_noop` and `stage_setup`.
- Update `scripts/lib/failure-comment.mjs`:
  - Provide dedicated headlines and recovery steps for `stage_noop` (“Factory stage completed without any repository updates.”) and `stage_setup` (“Factory stage cannot start until setup prerequisites are satisfied.”).
  - Detect diagnostics blocks inside failure messages and render them as a collapsible “Stage diagnostics” section below “Failure detail” so operators can see evidence without scanning raw logs.
- Update `scripts/build-stage-prompt.mjs`:
  - Extend Run Metadata to include last failure type and the new bounded-attempt counters when present.
  - For implement/repair prompts, append a short note when the last failure was `stage_noop` explaining that Codex must make substantive changes on the next attempt.

### 3. Recovery metadata and state management
- Extend PR metadata (`scripts/lib/pr-metadata.mjs`) with `stageNoopAttempts` and `stageSetupAttempts`, defaulting to `0`.
- Have `scripts/route-pr-loop.mjs` expose the current counters via workflow outputs so downstream jobs can access them.
- Update `scripts/apply-pr-state.mjs` to accept `FACTORY_STAGE_NOOP_ATTEMPTS` and `FACTORY_STAGE_SETUP_ATTEMPTS`, storing them back into PR metadata (treat `"__UNCHANGED__"` as pass-through, mirroring existing fields).
- In `scripts/handle-stage-failure.mjs`:
  - When the failure type is `stage_noop`, increment the counter (capped at 2) and set `FACTORY_STATUS` back to `plan_ready` while leaving `factory:implement` cleared. Add a comment section describing whether another automated retry is allowed (e.g., “Factory will treat the next implement run as the last auto-retry” when attempts == 1).
  - When attempts exceed the bound (≥2), treat it as non-recoverable by setting status to `blocked` and call that out in the comment.
  - For `stage_setup`, increment its counter, keep status `blocked`, and add targeted guidance listing the missing preconditions gleaned from diagnostics. Reset the counter to zero on successful runs (handled in the success path of `factory-pr-loop` via `stage-succeeded`).
- Ensure `stage-succeeded` job in `factory-pr-loop.yml` clears both counters (set env variables to `"0"`) so past issues do not linger after recovery.
- Update `scripts/lib/failure-followup.mjs` so `stage_noop` is considered ineligible for automated follow-up, while `stage_setup` continues to be actionable under the existing configuration logic (no change needed beyond extending the ineligible set).

### 4. Documentation and tests
- Update `README.md` failure-handling section to describe the new failure types, the diagnostics surfaced, and how operators should respond.
- Refresh `.factory/runs/53/repair-log.md` expectations (if any existing tests reference failure types) once implementation adds entries.
- Add/modify tests:
  - `tests/failure-classification.test.mjs`: cover new classifications.
  - `tests/prepare-stage-push.test.mjs`: assert diagnostics content and `stage_noop` failure type when the working tree is clean; cover setup guardrail mapping to `stage_setup`.
  - `tests/failure-comment.test.mjs`: verify headline/recovery text and diagnostics rendering for each new type.
  - `tests/handle-stage-failure.test.mjs`: exercise counter increments, state transitions, and comment augmentation for both failure types.
  - `tests/build-stage-prompt.test.mjs`: confirm Run Metadata mentions the counters and last failure note.
  - Update workflow gating tests (if present) or add a smoke test ensuring `factory-pr-loop` diagnosis gate skips new types.
- Ensure CI coverage includes the no-op implementation case and setup failure similar to PR #44 scenarios.

## Assumptions & Open Questions
- PR metadata already tolerates additional keys; rendering them in the PR body will not break existing clients because the metadata is encapsulated in a hidden comment.
- Branches that genuinely require no change are rare; when they occur repeatedly, treating the branch as blocked after two attempts is acceptable.
- Setup failures emitted by Codex (action failing before prompts run) can share the same `stage_setup` guidance as repository guardrails.
- No additional workflow secrets are needed; diagnostics gather only local repo state.
