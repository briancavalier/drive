decision: pass

📝 Summary
- Methodology: `default`.
- The branch implements automated follow-up issue creation for actionable control-plane and artifact-contract failures. It adds `scripts/lib/failure-followup.mjs`, extends GitHub helpers in `scripts/lib/github.mjs`, and wires follow-up creation into `scripts/handle-stage-failure.mjs` with unit tests covering the key paths.
- Unit tests for follow-up classification, signature stability, issue composition, deduplication lookup, and handler wiring are present and passing; CI unit job succeeded (workflow run id: 23263673307).

🚨 blocking findings
- None. All acceptance criteria mapped in `.factory/runs/52/acceptance-tests.md` are satisfied by code, tests, and CI evidence.

⚠️ non-blocking notes
- Comment/metadata marker mismatch: the follow-up issue metadata uses `<!-- factory-followup-meta: {...} -->` while the appended PR comment uses `<!-- factory-followup-signature: <sig> -->`. This does not break deduplication (which searches issues), but unifying the marker would improve traceability and make it easier to locate the signature in comments. Recommendation: use the same metadata marker in both issue bodies and comment annotations, or document the intentional difference in README.
- Consider adding a lightweight integration test (simulated GitHub search/create via a sandboxed stub) that asserts the full lifecycle end-to-end, including the exact search query used for dedupe, to reduce regression risk in future changes to the metadata format.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: When a factory-managed PR blocks on an actionable control-plane or artifact-contract failure, the factory can generate a structured Factory Request issue instead of only leaving an advisory comment.
  - Status: `satisfied`
  - Evidence:
    - tests/handle-stage-failure.test.mjs: 'main creates follow-up issue for actionable failure' asserts createIssue is called and the comment mentions the new issue.
    - scripts/handle-stage-failure.mjs: logic calls githubClient.createIssue and appends follow-up comment when followupAssessment.actionable is true.
    - CI: unit tests succeeded (workflow run id: 23263673307).
- Requirement: The created issue references the triggering PR number, workflow run, failure type, and a concise problem statement and evidence.
  - Status: `satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: 'buildFollowupIssue composes template with metadata block' asserts problem statement includes PR and metadata marker.
    - scripts/lib/failure-followup.mjs: buildFollowupIssue includes PR, run URL, failure type, category, evidence and metadata block.
- Requirement: Deduplicate by stamping each issue with a stable failure signature and skipping creation when an open issue already tracks the same signature.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-followup.mjs: buildFailureSignature derives SHA-256 from normalized fields; findOpenFollowup searches issues using the full metadata marker.
    - tests/handle-stage-failure.test.mjs: 'main skips creating follow-up when signature already tracked' confirms createIssue is not called for duplicates.
- Requirement: Ineligible failures are skipped and standard advisory comments are still posted.
  - Status: `satisfied`
  - Evidence:
    - tests/handle-stage-failure.test.mjs: 'main leaves comment unchanged for ineligible failures' asserts no follow-up and comment includes standard sections.
    - scripts/lib/failure-followup.mjs: INELIGIBLE_FAILURE_TYPES includes transient infra and other ineligible kinds.
- Requirement: Tests and evidence demonstrate each changed acceptance criterion and high-risk path.
  - Status: `satisfied`
  - Evidence:
    - CI: unit tests passed in workflow run id 23263673307.
    - tests/*: targeted unit tests cover allowlist patterns, duplication logic, and error handling in follow-up creation.

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Implement pure helper functions (classification, signature, issue builder) and wire them into failure handling with dependency injection for testability.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/failure-followup.mjs: exports classifyFollowup, buildFailureSignature, buildFollowupIssue, findOpenFollowup and buildFollowupCommentSection.
    - scripts/handle-stage-failure.mjs: accepts injected dependencies and uses followup helpers via dependency object.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Extend GitHub client with createIssue and searchIssues and add unit tests for these helpers.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/github.mjs: createIssue and searchIssues implemented with request retries and repo-prefixing behavior.
    - tests/github.test.mjs: tests covering createIssue behavior and searchIssues request formatting.
- Requirement: Add tests for classification, signature stability, issue body content, dedup lookup, and handler wiring.
  - Status: `satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: covers classification, signature normalization, issue body metadata and findOpenFollowup behavior.
    - tests/handle-stage-failure.test.mjs: covers end-to-end handler wiring for actionable, duplicate, and ineligible flows.
- Requirement: Update documentation to describe the automated follow-up path and dedup behavior.
  - Status: `satisfied`
  - Evidence:
    - README.md: contains lines describing follow-up issue content and comment linking (found in repository README).
    - .factory/runs/52/repair-log.md: records fix to follow-up search query and unit test to prevent duplicates.

</details>
