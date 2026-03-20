# Acceptance Tests

1. **Dashboard replaces control panel and status sections**
   - Given the PR body is rendered with full metadata and default template,
   - When reading the Markdown, the content includes `## Factory Dashboard` followed by a two-column table with blank headers and rows for `State`, `Owner`, `Stage`, `CI`, `Repairs`, `Cost`, `Estimate`, and `Next`.
   - And no `## Factory Control Panel` or `## Status` headings are present.

2. **Open and Actions link grouping**
   - Given a plan-ready metadata payload that includes latest run and actionable commands,
   - The rendered body contains an `**Open:**` line listing read-only links (latest run, `review.md`, `review.json`) separated by ` · `,
   - And an `**Actions:**` line listing mutation commands with ` *(state change)*` appended, also separated by ` · `,
   - And either line is omitted entirely when it would otherwise be empty.

3. **Artifacts grouped by workflow phase**
   - The `## Artifacts` section contains bold phase labels (`Plan`, `Execution`, `Review`) with inline link lists matching the artifacts available in `.factory/runs/<issue>/`,
   - And no artifact links are rendered as a Markdown table.

4. **Graceful fallbacks for missing numeric data**
   - When metadata lacks cost or estimate values, the `Cost` and `Estimate` rows show `—` instead of malformed output,
   - Repair information displays `—` if either operand is missing.

5. **Template override validation respects new tokens**
   - A custom `pr-body.md` override that omits `{{DASHBOARD_SECTION}}` triggers a validation warning and falls back to the default template,
   - While an override including `{{DASHBOARD_SECTION}}`, `{{ARTIFACTS_SECTION}}`, and `{{OPERATOR_NOTES_SECTION}}` renders successfully with the redesigned layout.
