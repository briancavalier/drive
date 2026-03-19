✅ Decision: pass

📝 Summary
- The changes implement a bounded recovery path for malformed autonomous review artifacts (review.json/review.md) by: adding a dedicated failure type, storing structured failure metadata, scheduling bounded repair attempts, and surfacing clearer failure comments and repair prompts.
- Unit tests cover the new classification, repair preparation, prompt inclusion, and PR-state plumbing. CI unit jobs passed for this branch (see review.json evidence).

🚨 Blocking findings
- No blocking findings. Unit tests and workflow contract tests exercise the new behaviour and CI signal is green.

⚠️ Non-blocking notes
- The artifact list in `scripts/build-stage-prompt.mjs` includes `repair-log.md` but `.factory/runs/54/` does not contain `repair-log.md` in this run; consider adding a minimal `repair-log.md` to the run artifacts to make generated prompts reference an explicit file when present.
- This change touches workflow orchestration (`.github/workflows/factory-pr-loop.yml`) and multiple scripts; while unit tests and contract tests are thorough, recommend an integration smoke test of the end-to-end review→repair→resume flow on a non-critical PR to validate live behaviour.

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: If autonomous review emits invalid review.json content, the failure is detected and routed into a bounded repair path instead of immediately blocking the PR.
  - Status: `satisfied`
  - Evidence:
    - tests/prepare-review-artifact-repair.test.mjs :: validates repair attempts increment and blocking behavior
    - scripts/prepare-review-artifact-repair.mjs :: implements repair-state derivation and outputs
    - .github/workflows/factory-pr-loop.yml :: review-processing-failed job invokes prepare-repair and conditionally schedules review-artifact-repair
    - CI: workflow run id 23307124739 — unit: success
- Requirement: Repair prompts include stored review-artifact failure context so repair runs see the failure message.
  - Status: `satisfied`
  - Evidence:
    - tests/build-stage-prompt.test.mjs :: 'repair prompt surfaces stored review artifact failure details'
    - scripts/build-stage-prompt.mjs :: reads metadata.lastReviewArtifactFailure and includes it in repair prompt
    - CI: workflow run id 23307124739 — unit: success
- Requirement: Successful repair resumes the review flow (metadata reset, review re-run and pass handling).
  - Status: `satisfied`
  - Evidence:
    - tests/process-review.test.mjs :: 'processReview marks PR ready and comments on pass decision'
    - .github/workflows/factory-pr-loop.yml :: review-artifact-repair-succeeded job records successful repair metadata
    - CI: workflow run id 23307124739 — unit: success
- Requirement: Exhausted repair attempts block the PR with an explicit failure comment referencing malformed artifacts.
  - Status: `satisfied`
  - Evidence:
    - tests/prepare-review-artifact-repair.test.mjs :: 'blocks when repair attempts exceed limit'
    - scripts/lib/failure-comment.mjs :: comment headline and artifact links for review_artifact_contract
    - .github/workflows/factory-pr-loop.yml :: review-artifact-repair-failed falls back to handle-stage-failure when blocked
    - CI: workflow run id 23307124739 — unit: success
- Requirement: Delivery/configuration failures (e.g., unresolved methodology) still block immediately and are not routed to artifact repair.
  - Status: `satisfied`
  - Evidence:
    - scripts/process-review.mjs :: classifyReviewArtifactsFailure maps methodology resolution failures to configuration + review_delivery phase
    - tests/process-review.test.mjs :: 'classifyReviewArtifactsFailure keeps invalid methodology failures in review_delivery'
    - CI: workflow run id 23307124739 — unit: success

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Add a dedicated failure type for review-artifact contract errors and propagate it through classification and comments.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-classification.mjs :: defines FAILURE_TYPES.reviewArtifactContract
    - scripts/process-review.mjs :: classifyReviewArtifactsFailure returns FAILURE_TYPES.reviewArtifactContract for content failures
    - tests/failure-comment.test.mjs :: asserts failure-comment handles FAILURE_TYPES.reviewArtifactContract

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Implement scripts/prepare-review-artifact-repair.mjs to derive repair state and outputs for workflow orchestration.
  - Status: `satisfied`
  - Evidence:
    - scripts/prepare-review-artifact-repair.mjs :: new implementation and exported helpers
    - tests/prepare-review-artifact-repair.test.mjs :: unit tests for normal, exhausted, and invalid-type cases
- Requirement: Include stored failure details in repair prompts via build-stage-prompt.mjs.
  - Status: `satisfied`
  - Evidence:
    - scripts/build-stage-prompt.mjs :: includes metadata.lastReviewArtifactFailure when present
    - tests/build-stage-prompt.test.mjs :: covers repair prompt failure-context inclusion

</details>
