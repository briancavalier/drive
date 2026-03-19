# Harden review artifact recovery

## Problem
- Autonomous review already normalizes and validates artifacts, but malformed `review.json` or inconsistent `review.md` still cause the review stage to fail immediately.
- Current workflow responds by blocking the pull request, leaving recoverable contract failures (bad field shapes, mismatched traceability) without an automated retry path.
- Failure comments do not distinguish contract violations from review-delivery errors, so operators lack precise guidance.

## Goals
- Detect review-artifact contract violations, classify them separately from delivery/configuration failures, and enter a bounded repair path instead of blocking outright.
- Keep validation strict: malformed artifacts must never ship, but should trigger focused retries when recoverable.
- Surface clear operator messaging that identifies whether the failure was a schema violation, irreconcilable traceability drift, or delivery/configuration error.
- Fall back to the existing block-and-comment behaviour once repair attempts are exhausted.

## Non-goals and constraints
- Do not weaken artifact validation rules or alter the `review.md`/`review.json` contract.
- Do not redesign autonomous review methodology selection.
- Reuse the factory’s existing repair-attempt counters and safety limits rather than introducing an unbounded retry loop.
- Fit changes into the current GitHub Actions and Node script architecture.

## Proposed solution

### 1. Add a dedicated failure type for review-artifact contract errors
- Extend `scripts/lib/failure-classification.mjs` with a new `FAILURE_TYPES.reviewArtifactContract`.
- Update `classifyReviewArtifactsFailure()` in `scripts/process-review.mjs` to map JSON/markdown validation failures to the new type while keeping methodology resolution issues in `configuration`.
- Ensure `classifyProcessReviewFailure()` propagates the explicit type/phase when `loadValidatedReviewArtifacts()` throws.
- Update related consumers (e.g. `scripts/lib/failure-comment.mjs`, `tests/failure-classification.test.mjs`) to recognise and describe the new type.

### 2. Capture structured failure details for repair context
- Add a metadata field (e.g. `lastReviewArtifactFailure`) to `scripts/lib/pr-metadata.mjs` and `scripts/apply-pr-state.mjs`.
- Store the failure message, type, phase, and timestamp when review processing fails.
- Teach `scripts/build-stage-prompt.mjs` to surface the last artifact failure inside the repair prompt’s “Failure Context” when the repair run is reacting to a review-artifact contract error.

### 3. Schedule bounded repair attempts from the workflow
- Introduce `scripts/prepare-review-artifact-repair.mjs` that:
  - Loads the current PR metadata via `scripts/lib/github.mjs`.
  - Uses `nextRepairState()` with a deterministic signature derived from the failure classification to increment repair attempts and detect exhaustion.
  - Emits outputs (next `repairAttempts`, `repeatedFailureCount`, `lastFailureSignature`, `blocked`) for workflow orchestration.
- Modify `.github/workflows/factory-pr-loop.yml` within the `review-processing-failed` job:
  - After diagnosis, run the new script when the failure type is `review_artifact_contract`.
  - If repair remains within limits, call `scripts/apply-pr-state.mjs` to move the PR to `repairing`, update metadata (including `lastReviewArtifactFailure`), and clear `factory:blocked`.
  - Launch a new job (e.g. `review-artifact-repair`) that invokes `./.github/workflows/_factory-stage.yml` in `repair` mode with the updated attempt counts.
  - Skip the existing `handle-stage-failure.mjs` call in this path so the PR is not blocked prematurely.
  - If attempts are exhausted, fall back to the current behaviour (call `handle-stage-failure.mjs`), ensuring the resulting comment cites malformed artifacts explicitly.

### 4. Improve failure comments
- Update `scripts/lib/failure-comment.mjs` headline and recovery guidance for the new failure type so comments clearly state “autonomous review artifacts were invalid” and point operators to `review.json`/`review.md`.
- Ensure `handle-stage-failure.mjs` clears `factory:blocked` only when a repair run has been scheduled; otherwise retain existing blocking semantics.

### 5. Maintain deterministic repair bounds
- The new script will reuse `maxRepairAttempts` from PR metadata so artifact repairs count against the same cap as other repairs.
- When `nextRepairState().blocked` is true (exceeded attempts or repeated signature), the workflow posts the improved failure comment and leaves the PR blocked to require human action.

### 6. Testing and verification
- Extend unit tests:
  - `tests/process-review.test.mjs` for the new failure classification behaviour and outputs.
  - New tests for `scripts/prepare-review-artifact-repair.mjs` covering normal, exhausted, and repeated-signature cases.
  - `tests/failure-comment.test.mjs` to validate the updated messaging.
  - `tests/build-stage-prompt.test.mjs` (or new coverage) to assert repair prompts include stored failure context.
- Add workflow-focused tests (where feasible) that simulate the scripted state transitions.

## Open questions / assumptions
- Assumes repair attempts for artifact recovery should share the existing `max_repair_attempts` budget; if a separate limit is required it can be parameterised later.
- Assumes repair runs can safely modify only the review artifacts; existing guards against unintended repo drift will continue to apply.
- Assumes storing the last failure message in PR metadata is acceptable; no downstream consumers currently rely on a fixed set of metadata keys.
