decision: request_changes

📝 Summary
- Methodology: `default`
- Change introduces automated follow-up issue creation for actionable control-plane and artifact-contract failures. It adds `scripts/lib/failure-followup.mjs`, extends `scripts/lib/github.mjs` with issue/search helpers, and wires follow-up creation into `scripts/handle-stage-failure.mjs`.
- Unit tests were added and the local test run passes; README updated to document the behavior.

🚨 blocking findings
- Malformed search query used by `findOpenFollowup` may prevent deduplication and cause duplicate follow-up issues to be opened. The code builds a search query string in `scripts/lib/failure-followup.mjs` that appears to omit the closing quote/terminator for the search phrase: the query literal is `state:open "factory-followup-meta: {\"signature\":\"${signature}` which can produce an unterminated quoted phrase. This increases the risk of creating duplicate issues in production. Recommendation: fix the query to include the full, correctly escaped metadata JSON (for example: `state:open "<!-- factory-followup-meta: {\\"signature\\":\\"${signature}\\"} -->"` or search for the signature token without relying on partial JSON quoting) and add a unit test that asserts the outgoing query string.

⚠️ non-blocking notes
- Tests: All new unit tests pass locally (`node --test`), and CI shows `unit: success`. Evidence paths below.
- Suggestion: add a label (e.g., `Factory Request`) when creating follow-up issues so operators can filter follow-ups more easily; this is not required by the spec but would improve usability.
- Suggestion: add an integration or end-to-end test that exercises `handle-stage-failure` with a mocked GitHub client to assert the dedupe path and the appended PR comment in one flow.

**Done**

🧭 Traceability
- See `.factory/runs/52/review.json` for machine-readable traceability and findings.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: Actionable failure opens a follow-up issue
  - Status: `partially_satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: unit test asserts createIssue flow via findOpenFollowup + createIssue paths
    - tests/handle-stage-failure.test.mjs: asserts that actionable failures result in comment augmentation and createIssue called in the handler
    - CI workflow run 23263316270: unit tests passed (unit: success)
- Requirement: Duplicate signature suppresses new issue creation
  - Status: `partially_satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: findOpenFollowup unit test returns matching issue when searchIssues returns items containing the signature
    - scripts/lib/failure-followup.mjs: findOpenFollowup uses searchIssues and inspects issue bodies for the signature marker
- Requirement: Ineligible failures skip follow-up
  - Status: `satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: classifyFollowup returns actionable=false for transient_infra
    - scripts/lib/failure-followup.mjs: INELIGIBLE_FAILURE_TYPES includes transient_infra
- Requirement: Generated issue body matches template and evidence requirements
  - Status: `satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: buildFollowupIssue snapshot assertions for headings and metadata block
    - scripts/lib/failure-followup.mjs: buildFollowupIssue composes Problem statement and Evidence sections and appends factory-followup-meta
- Requirement: Documentation reflects automated follow-up behavior
  - Status: `satisfied`
  - Evidence:
    - README.md: 'Actionable control-plane or artifact-contract failures now trigger an automatic Factory Request issue' section present
    - .factory/runs/52/acceptance-tests.md: includes acceptance test to verify README updates

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Refactor handle-stage-failure to wire follow-up creation and deduplication
  - Status: `satisfied`
  - Evidence:
    - scripts/handle-stage-failure.mjs: imports followup helpers, builds signature, calls findOpenFollowup and createIssue, appends follow-up comment section
    - tests/handle-stage-failure.test.mjs: exercises flows with mocked dependencies
- Requirement: Add unit tests for follow-up classification and signature stability
  - Status: `satisfied`
  - Evidence:
    - tests/failure-followup.test.mjs: classification and signature stability tests present and passing
    - local test run: node --test output shows all three test suites passing

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Extend GitHub client with createIssue and searchIssues
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/github.mjs: exports createIssue and searchIssues functions
    - tests/github.test.mjs: tests for createIssue and searchIssues behavior

</details>
