# Implementation Plan

## Work Breakdown
1. **Assemble dashboard-friendly state data**
   - Extend `scripts/lib/github-messages.mjs` with helpers to derive dashboard rows (state, owner, stage, CI, repairs, cost, estimate, next, optional reason) using existing metadata/control-panel outputs.
   - Normalize display strings (e.g., title-case `waitingOn`, map CI statuses to `Passing`/`Pending`/`Failing`, inline-code technical values) and ensure missing fields collapse cleanly.
2. **Render the Factory Dashboard layout**
   - Replace the current control-panel and status concatenation in `renderPrBody` with a single `DASHBOARD_SECTION` string that renders the two-column table plus `Open:` and `Actions:` lines derived from control-panel actions.
   - Update `MESSAGE_SPECS` required tokens and refresh `scripts/templates/github-messages/pr-body.md` so the default template—and overrides—expect `{{DASHBOARD_SECTION}}` instead of the legacy sections.
3. **Group artifacts by workflow phase**
   - Rework artifact rendering in `renderPrBody` to emit grouped markdown blocks for Plan, Execution, and Review, skipping empty groups while preserving all existing links.
4. **Synchronize tests and documentation**
   - Update `tests/github-messages.test.mjs` (and any other affected tests) to match the new dashboard/table, Open/Actions formatting, and artifact grouping.
   - Adjust `tests/control-panel.test.mjs` expectations if action labels are consumed differently, and revise the README section describing the PR body/override tokens.

## Testing Strategy
- Run `node --test tests/github-messages.test.mjs` to validate the regenerated PR body layout and metadata serialization.
- Run `node --test tests/control-panel.test.mjs` (and any newly added tests) to confirm action formatting remains correct.
- Execute `npm test` as a final smoke check once all suite updates compile.
