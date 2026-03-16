Decision: request_changes — Emoji cues land well, but the new git rev-parse fallback can record bogus SHAs.

Methodology: default

Blocking Findings
- **git rev-parse fallback returns invalid SHA** — The updated `gitRevParse` now swallows non-zero exits and returns whatever stdout contained (scripts/process-review.mjs:26-43). `git rev-parse invalid-ref-name` exits 128 yet echoes the ref on stdout; with the new logic we would return `invalid-ref-name` and persist it as `FACTORY_LAST_READY_SHA` when we mark a PR ready for review (scripts/process-review.mjs:261-269). Please restore the fail-fast behavior or validate the output before accepting it.

## Traceability

<details>
<summary>Traceability: Acceptance Criteria</summary>

- Requirement: Stage status shows mapped emoji
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:61-77
- Requirement: CI status shows mapped emoji
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:61-77
- Requirement: Operator notes use required cues
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:95-109
- Requirement: Plan-ready comment is emoji-prefixed
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:129-163
- Requirement: Ready-for-review comment is emoji-prefixed
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:177-188
- Requirement: Failure comments are emoji-prefixed
  - Status: `satisfied`
  - Evidence: scripts/handle-stage-failure.mjs:21-74; tests/handle-stage-failure.test.mjs:26-59
- Requirement: Unmapped stage values stay readable
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:79-93

</details>

<details>
<summary>Traceability: Spec Commitments</summary>

- Requirement: Introduce deterministic maps for stage and CI states inside scripts/lib/github-messages.mjs covering the required values and update renderPrBody to prefix emojis while preserving fallback behavior.
  - Status: `satisfied`
  - Evidence: scripts/lib/github-messages.mjs:27-294; tests/github-messages.test.mjs:61-93
- Requirement: Adjust the operator notes bullets to prefix ▶️ for start/resume and ⏸️ for pause without altering label text.
  - Status: `satisfied`
  - Evidence: scripts/lib/github-messages.mjs:289-294; tests/github-messages.test.mjs:95-109
- Requirement: Update plan-ready and review-pass templates and prepend ⚠️ to buildFailureComment outputs so all human-facing failure comments share the cue.
  - Status: `satisfied`
  - Evidence: scripts/templates/github-messages/plan-ready-issue-comment.md:1; scripts/templates/github-messages/review-pass-comment.md:1-5; scripts/handle-stage-failure.mjs:21-74
- Requirement: Extend the test suite to cover emoji-enhanced rendering and failure comment prefixes, including fallback cases.
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:61-188; tests/handle-stage-failure.test.mjs:26-59

</details>

<details>
<summary>Traceability: Plan Deliverables</summary>

- Requirement: Introduce emoji mapping helpers
  - Status: `satisfied`
  - Evidence: scripts/lib/github-messages.mjs:27-272
- Requirement: Refresh operator notes copy
  - Status: `satisfied`
  - Evidence: scripts/lib/github-messages.mjs:289-294; tests/github-messages.test.mjs:95-109
- Requirement: Adjust automated comment templates
  - Status: `satisfied`
  - Evidence: scripts/templates/github-messages/plan-ready-issue-comment.md:1; scripts/templates/github-messages/review-pass-comment.md:1-5
- Requirement: Prefix failure comments
  - Status: `satisfied`
  - Evidence: scripts/handle-stage-failure.mjs:21-74; tests/handle-stage-failure.test.mjs:26-59
- Requirement: Expand regression tests
  - Status: `satisfied`
  - Evidence: tests/github-messages.test.mjs:61-188; tests/handle-stage-failure.test.mjs:26-59

</details>
