✅ PASS

**📝 Summary**
- The change updates both PASS and REQUEST_CHANGES review templates to the dashboard-first `Factory Review` layout, adds the compact bold summary block (Summary / Findings / Artifacts), and surfaces traceability as a single collapsible block. Template tokens for full blocking details are preserved for REQUEST_CHANGES. Tests and tooling were updated to assert the new layout.

**🚨 Blocking Findings**
- None.

**⚠️ Non-blocking Notes**
- Consider removing the duplicated top-level `## 🧭 Traceability` heading emitted just before the single `<details>` wrapper in `scripts/lib/review-output.mjs` to avoid a small visual duplication in rendered comments/review.md.

## 🧭 Traceability

<details>
<summary>🧭 Traceability</summary>

#### Acceptance Criteria (✅ 4)

- ✅ **Satisfied**: PASS review renders new Factory Review header without legacy clutter
  - **Evidence:** scripts/templates/github-messages/review-pass-comment.md: contains '## Factory Review' and bold 'Summary', 'Findings', 'Artifacts' lines.
  - **Evidence:** CI workflow run 23618905389: unit tests passed (unit: success).
- ✅ **Satisfied**: REQUEST_CHANGES review shares layout and preserves detailed findings
  - **Evidence:** scripts/templates/github-messages/review-request-changes.md: same top-block and includes '{{FULL_BLOCKING_FINDINGS_DETAILS}}' token for full details.
  - **Evidence:** scripts/lib/github-messages.mjs: buildReviewConversationBody renders templates for both decisions.
- ✅ **Satisfied**: Traceability appears as a single collapsible block in both comment and review.md
  - **Evidence:** scripts/lib/review-output.mjs: renderCanonicalTraceabilityMarkdown returns a single '<details>' element with summary '🧭 Traceability' and plain Markdown subsections inside.
- ✅ **Satisfied**: Review authoring guidance omits manual methodology instruction
  - **Evidence:** .factory/prompts/review.md: contains 'Omit a manual methodology line; the control plane adds it to the published summary automatically.'

</details>
