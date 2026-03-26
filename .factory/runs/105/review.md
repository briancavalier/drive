decision: REQUEST_CHANGES · Method: `default`

📝 Summary
- Implementation is incomplete: the repository branch contains only the run artifacts in `.factory/runs/105/` and related usage events; there are no edits to the templates or helper code named in the spec (`scripts/templates/github-messages/*`, `scripts/lib/github-messages.mjs`, `scripts/lib/review-output.mjs`, or `.factory/prompts/review.md`).
- Because the code and template updates required by the spec and plan are not present, the acceptance tests cannot be satisfied by this branch as-is.

🚨 blocking findings
- Missing implementation: No code or template changes implementing the new `Factory Review` header and flattened traceability were found. See evidence: `git diff origin/main..HEAD` shows only `.factory/runs/105/*` artifact files were added and no `scripts/templates` or `scripts/lib` changes were committed.
- Acceptance tests cannot pass: The acceptance-tests.md describes changes to templates, message builders, and test snapshots; those source files and updated tests are not present in this branch, so acceptance criteria are unmet.
- Missing test updates / CI evidence for template behavior: While CI status (workflow id 23614136486) reports `unit: success` and other checks passed, there is no CI evidence demonstrating the new comment body format because the implementation files are absent.

⚠️ non-blocking notes
- If the implementation is intended to be delivered in a follow-up PR, please link it from this run and include a short note in `.factory/runs/105/approved-issue.md` indicating cross-PR dependencies.
- Suggested next steps: implement the templating changes in `scripts/templates/github-messages/review-pass-comment.md` and `review-request-changes.md`, update `scripts/lib/github-messages.mjs` and `scripts/lib/review-output.mjs` per the plan, and rebaseline tests in `tests/github-messages.test.mjs` and related snapshot files.

Methodology: `default`

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 3)</summary>

- ❌ **Not satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** .factory/runs/105/acceptance-tests.md
  - **Evidence:** git diff origin/main..HEAD: no changes to scripts/templates/github-messages/review-pass-comment.md or related template files
- ❌ **Not satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** .factory/runs/105/acceptance-tests.md
  - **Evidence:** git diff origin/main..HEAD: no changes to scripts/templates/github-messages/review-request-changes.md or helper code
- ❌ **Not satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** .factory/runs/105/acceptance-tests.md
  - **Evidence:** review.md in this run was generated as an artifact but source rendering helpers (scripts/lib/review-output.mjs) were not updated in the branch

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (❌ 1)</summary>

- ❌ **Not satisfied**: Update review authoring prompt to omit manual methodology instruction
  - **Evidence:** .factory/runs/105/spec.md
  - **Evidence:** git diff origin/main..HEAD: .factory/prompts/review.md not modified in this branch

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (❌ 1)</summary>

- ❌ **Not satisfied**: Refactor buildReviewConversationBody and update templates per plan.md
  - **Evidence:** .factory/runs/105/plan.md
  - **Evidence:** git diff origin/main..HEAD: no edits to scripts/lib/github-messages.mjs or scripts/templates/github-messages/*.md

</details>
