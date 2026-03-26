request_changes · Method: `default`

**📝 Summary**
- The branch implements a spec to rework the Factory Review comment templates and traceability rendering to a dashboard-first layout. I evaluated the code, templates, review-output helpers, authoring prompt, and test/CI evidence against the approved spec and acceptance tests.
- Outcome: Request changes — multiple acceptance criteria are not satisfied. See blocking findings below for concrete fixes.

**🚨 Blocking Findings**
- PASS and REQUEST_CHANGES GitHub message templates were not updated to the new `## Factory Review` header and compact summary block; they still use the legacy banners/footers. See `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md`.
- The canonical traceability renderer still emits nested `<details>` blocks (one per requirement group) rather than a single `<details>` wrapper whose `<summary>` is `🧭 Traceability`. See `scripts/lib/review-output.mjs`.
- The review authoring prompt still instructs reviewers to add a methodology line inside `review.md`, which would duplicate methodology once the new summary block is injected. See `.factory/prompts/review.md`.

**⚠️ Non-Blocking Notes**
- CI passed for unit tests (workflow run id: `23614423969`, unit: success, actionlint: success), indicating existing behavior remains stable but the CI run does not exercise the new template/layout changes required by the acceptance tests.
- Tests and rendering helpers (e.g., `tests/process-review.test.mjs` and `scripts/lib/review-output.mjs`) will require coordinated updates to adopt the single-`<details>` traceability model and the new summary tokens; update tests after applying code/template changes to avoid snapshot drift.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 4)</summary>

- ❌ **Not satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md contains legacy banner: "✅ Autonomous review completed with decision **PASS**"
  - **Evidence:** tests/process-review.test.mjs contains expectations for the old traceability layout and no assertion for a top-level '## Factory Review' header.
- ❌ **Not satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md retains legacy tokens such as '{{FULL_REVIEW_DETAILS}}' and a trailing 'Artifacts:' section.
  - **Evidence:** No template in scripts/templates/github-messages/ matches the target '## Factory Review' summary block.
- ❌ **Not satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** scripts/lib/review-output.mjs currently emits nested <details> blocks per requirement group rather than a single flattened <details> wrapper.
  - **Evidence:** tests/review-artifacts.test.mjs and tests/process-review.test.mjs continue to exercise multi-<details> rendering behavior.
- ❌ **Not satisfied**: Review authoring guidance omits manual methodology instruction
  - **Evidence:** .factory/prompts/review.md still instructs reviewers to include the methodology line inside review.md.
  - **Evidence:** No change to .factory/prompts/review.md was observed in the branch.

</details>
