# Factory PR Dashboard Specification

## Summary
- Replace the current "Factory Control Panel" and "Status" sections with a single "Factory Dashboard" that presents run state in a compact two-column table and separates navigation links from actions.
- Refresh artifact linking so plan, execution, and review files remain first-class but render as lightweight grouped link lists instead of a flat bullet table.
- Preserve downstream automation by keeping the hidden `factory-state` metadata block and continuing to expose all existing state data, just reformatted.

## Current Behavior
- `renderPrBody` builds two top-of-body sections: `## Factory Control Panel` (plain list) and `## Status` (separate bullet list). The duplication makes the PR body noisy and pushes links below the fold.
- The control panel formats artifacts as a comma-separated inline list and intermixes link-style actions with state-changing workflow triggers, so operators must scan bullets to find the control they need.
- `scripts/templates/github-messages/pr-body.md` requires `{{CONTROL_PANEL_SECTION}}` and `{{STATUS_SECTION}}`; overrides that follow this contract cannot opt into the new dashboard layout without code changes.
- Tests in `tests/github-messages.test.mjs` and docs in `README.md` assert or describe the old structure, so changing the layout without updating them will cause regressions.

## Proposed Changes

### 1. Build a unified Factory Dashboard block
- Update `renderPrBody` (and related helpers in `scripts/lib/github-messages.mjs`) to assemble a `Factory Dashboard` section that renders a two-column Markdown table with blank headers:
  - Rows cover at least: **State**, **Owner**, **Stage**, **CI**, **Repairs**, **Cost**, **Estimate**, **Next**.
  - Show optional rows when relevant, e.g., **Reason** when `buildControlPanel` supplies text, and skip Cost/Estimate when no data is available.
  - Use existing emoji-enhanced values where they add clarity (state, CI) and normalize textual values (e.g., title-case owner/waiting-on, map CI statuses to `Passing`/`Pending`/`Failing`).
  - Inline-code technical values (stage name, repair counters, numeric cost/estimate totals) to match the provided mockup.
- Collapse the redundant `STATUS_SECTION` by emitting a new `{{DASHBOARD_SECTION}}` token; remove the old control-panel/status sections from the default template.
- Keep the post-body serialized metadata comment exactly as today.

### 2. Separate navigation and state-changing controls
- Derive two link lists from `buildControlPanel` output:
  - `Open:` includes read-only links such as the latest run, review artifacts, plan artifacts, and other `kind === "link"` controls, rendered without leading emoji and joined with ` · `.
  - `Actions:` includes `kind === "mutation"` workflow triggers, likewise stripped of emoji for a cleaner look; hide the line when no actions exist.
- Ensure link text stays concise and human-readable (e.g., `Latest run`, `Review summary`, `Pause automation`). Provide fallback text derived from existing action labels when no custom wording is available.

### 3. Regroup artifact links by workflow phase
- Replace the bullet list in `ARTIFACTS_SECTION` with grouped markdown blocks:
  - `**Plan**` line listing `approved-issue.md`, `spec.md`, `plan.md`, and `acceptance-tests.md` links separated by ` · `.
  - `**Execution**` line listing `repair-log.md` and `cost-summary.json` when present.
  - `**Review**` line listing `review.md` and `review.json` when present.
- Maintain plain-markdown formatting (no tables) and omit empty groups to keep the section lightweight.

### 4. Refresh templates, tests, and documentation
- Update `scripts/templates/github-messages/pr-body.md` to reference `{{DASHBOARD_SECTION}}`, the new Open/Actions lines, and the regrouped artifacts while still including `{{OPERATOR_NOTES_SECTION}}`.
- Adjust `MESSAGE_SPECS` so `pr-body.md` requires `DASHBOARD_SECTION` and `ARTIFACTS_SECTION` instead of the previous control-panel/status tokens; ensure override validation warnings stay informative.
- Revise `tests/github-messages.test.mjs` to assert the dashboard table, Open/Actions formatting, artifact grouping, and continued metadata serialization.
- Update `tests/control-panel.test.mjs` expectations if label normalization changes (e.g., stripping emoji for Action/Open display).
- Rewrite the corresponding README copy to describe the new Factory Dashboard concept and updated override tokens.

## Assumptions & Risks
- Assumes existing metadata fields (`lastCompletedStage`, `costEstimateUsd`, `lastStageCostEstimateUsd`, etc.) remain the source of truth; no new data sources are required.
- We will capitalize `waitingOn` strings for display; if downstream code parses the value (unlikely), we need to confirm tests don't rely on case-sensitive matches.
- Stripping emoji from action labels should not break operator muscle memory, but we will keep the underlying action IDs and workflow URLs untouched.
- The dashboard table must degrade gracefully when values are missing; ensure tests cover empty/falsy fields so the output does not show `undefined` or double spaces.

## Out of Scope
- Changing how `buildControlPanel` determines state, reasons, or available actions.
- Modifying the machine-readable `factory-state` payload or any automation that consumes it.
- Introducing additional artifacts, collapsible sections, or HTML-based styling beyond standard Markdown.
