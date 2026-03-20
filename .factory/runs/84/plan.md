# Implementation Plan

## Targeted Components
- `scripts/lib/control-panel.mjs` (refactor into a dashboard view-model generator)
- `scripts/lib/github-messages.mjs` (rewrite PR body assembly and template variables)
- `scripts/templates/github-messages/pr-body.md` and `MESSAGE_SPECS` token definitions
- Unit tests in `tests/github-messages.test.mjs` and `tests/event-router.test.mjs`
- Documentation in `README.md` describing customizable PR body templates

## Step-by-Step Tasks
1. **Refactor control panel builder into dashboard data**
   - Introduce a dashboard view model that exposes ordered row descriptors, `open` links, `actions`, and grouped artifact links.
   - Preserve existing logic for state labels, waiting-on values, recommended next steps, action resolution, and link generation.
   - Standardize fallbacks (`—`) at the data layer to simplify formatting.
   - Rename exports as needed (`buildDashboard`) and update call sites.

2. **Rebuild PR body renderer**
   - Update `renderPrBody` to request the dashboard view model and construct the Markdown table with blank headers.
   - Replace the previous bullet-list control panel and status output with table rows `State`, `Owner`, `Stage`, `CI`, `Repairs`, `Cost`, `Estimate`, and `Next`.
   - Generate `Open` and `Actions` lines from the dashboard links, appending ` *(state change)*` to mutation actions.
   - Restructure artifact rendering to emit phase-group lines (`Plan`, `Execution`, `Review`) using inline link lists.
   - Keep the operator notes and serialized metadata comment untouched.

3. **Update template tokens and defaults**
   - Change `MESSAGE_SPECS` required tokens to `DASHBOARD_SECTION`, `ARTIFACTS_SECTION`, and `OPERATOR_NOTES_SECTION`.
   - Rewrite the default `pr-body.md` template to reference the new dashboard token names.
   - Ensure template validation warns when overrides omit required tokens; adjust tests accordingly.

4. **Revise automated tests**
   - Update `tests/github-messages.test.mjs` expectations to look for `## Factory Dashboard`, table markup, new link lines, and grouped artifacts.
   - Add/adjust cases that cover missing data fallbacks and token validation changes.
   - Update `tests/event-router.test.mjs` fixtures that previously asserted on `## Factory Control Panel` / `## Status` sections to align with the new layout.

5. **Refresh documentation**
   - Update README guidance about PR body templates, token names, and example output to match the dashboard layout.

6. **Validation pass**
   - Run the existing automated test suite (`npm test` or equivalent) to confirm regression coverage.
   - Manually spot-check the rendered PR body string (if necessary in tests) to ensure the dashboard remains concise.
