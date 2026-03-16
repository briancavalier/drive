✅ Pass

## 📝 Summary
- Shared the canonical review artifact validator via `scripts/lib/review-artifacts.mjs` and reused it inside `prepare-stage-push` and `process-review`, with new unit coverage ensuring malformed artifacts fail fast.
- Added a pending-review SHA guard that records the freshly pushed review commit, suppresses duplicate reruns in the router, and clears the marker during `process-review`, all backed by workflow wiring and tests.
- Updated `_factory-stage.yml` and `README.md` to document the two-stage guard; CI (`npm test`) is green per workflow run 23170355729.

## 🚨 Blocking Findings
- None.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: Invalid review artifacts block the push
  - Status: `satisfied`
  - Evidence: scripts/prepare-stage-push.mjs:153; tests/prepare-stage-push.test.mjs:120
- Requirement: Valid review artifacts still produce a commit
  - Status: `satisfied`
  - Evidence: scripts/prepare-stage-push.mjs:167; tests/review-artifacts.test.mjs:56
- Requirement: Self-generated review commit does not retrigger review
  - Status: `satisfied`
  - Evidence: scripts/lib/event-router.mjs:105; tests/event-router.test.mjs:214
- Requirement: New branch updates still trigger review
  - Status: `satisfied`
  - Evidence: scripts/lib/event-router.mjs:118; tests/event-router.test.mjs:236
- Requirement: Process review clears the pending SHA
  - Status: `satisfied`
  - Evidence: scripts/process-review.mjs:45; tests/process-review.test.mjs:393; tests/process-review.test.mjs:422
- Requirement: Workflow documentation reflects the guard
  - Status: `satisfied`
  - Evidence: .github/workflows/_factory-stage.yml:188; README.md:171

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Shared Review Artifact Validation
  - Status: `satisfied`
  - Evidence: scripts/lib/review-artifacts.mjs:1; scripts/process-review.mjs:149; tests/review-artifacts.test.mjs:56
- Requirement: Pre-Push Review Guard in prepare-stage-push
  - Status: `satisfied`
  - Evidence: scripts/prepare-stage-push.mjs:120; .github/workflows/_factory-stage.yml:160; tests/prepare-stage-push.test.mjs:144
- Requirement: Review Rerun Suppression
  - Status: `satisfied`
  - Evidence: .github/workflows/_factory-stage.yml:188; scripts/lib/event-router.mjs:105; scripts/apply-pr-state.mjs:55; tests/event-router.test.mjs:214; tests/apply-pr-state-metadata.test.mjs:71; scripts/process-review.mjs:45
- Requirement: Documentation & Observability
  - Status: `satisfied`
  - Evidence: README.md:171; .github/workflows/_factory-stage.yml:188

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Lift review validation into a shared helper
  - Status: `satisfied`
  - Evidence: scripts/lib/review-artifacts.mjs:1; scripts/process-review.mjs:149; tests/review-artifacts.test.mjs:56
- Requirement: Gate review commits with pre-push validation
  - Status: `satisfied`
  - Evidence: scripts/prepare-stage-push.mjs:120; .github/workflows/_factory-stage.yml:160; tests/prepare-stage-push.test.mjs:144
- Requirement: Track pending review SHAs in metadata
  - Status: `satisfied`
  - Evidence: scripts/apply-pr-state.mjs:55; scripts/lib/github-messages.mjs:207; scripts/lib/pr-metadata.mjs:22; tests/apply-pr-state-metadata.test.mjs:71; tests/pr-metadata.test.mjs:10
- Requirement: Suppress redundant review reruns
  - Status: `satisfied`
  - Evidence: .github/workflows/_factory-stage.yml:188; scripts/lib/event-router.mjs:105; tests/event-router.test.mjs:214
- Requirement: Document the guard
  - Status: `satisfied`
  - Evidence: .github/workflows/_factory-stage.yml:188; README.md:171

</details>

Methodology: default
