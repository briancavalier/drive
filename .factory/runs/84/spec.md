# Factory PR Dashboard Redesign

## Overview
- Replace the two top-level sections (`Factory Control Panel` and `Status`) in factory-generated pull request bodies with a single, scan-friendly `Factory Dashboard`.
- Preserve all existing metadata semantics, artifact links, and the trailing `factory-state` HTML comment while improving information density and readability.
- Keep the factory PR body compatible with override templates by updating required tokens in tandem with the new layout.

## Functional Requirements
- Render the heading `## Factory Dashboard` immediately after the issue reference line.
- Display status details inside a two-column Markdown table with blank header cells. The left column shows bold labels and the right column shows human-readable values.
- Include the following rows, in order, with sensible fallbacks when data is missing:
  1. `State` — emoji-enhanced state text from the existing state display logic.
  2. `Owner` — human-readable `waitingOn` label (capitalize sentence case).
  3. `Stage` — last completed stage, rendered in inline code if present, or `—`.
  4. `CI` — emoji-enhanced CI status (`pending`, `success`, `failure`).
  5. `Repairs` — `repairAttempts/maxRepairAttempts` with slash separator; show `—` when unknown.
  6. `Cost` — include cost emoji if provided plus formatted total estimate (e.g., `🟢 $0.0238 total (low)`), otherwise `—`.
  7. `Estimate` — latest stage estimate using `$<amount> via <model>` when both the value and model exist, otherwise `—`.
  8. `Next` — recommended next step sentence from existing guidance (default to generic monitoring text).
- Render two inline link lines directly under the table:
  - `**Open:**` followed by read-only navigation links separated by ` · `. Include, when available, the latest run, review summary (`review.md`), review JSON, and canonical artifacts/home URLs that are purely navigational. Omit missing items gracefully.
  - `**Actions:**` followed by state-changing links (pause/resume/reset/etc.) separated by ` · `. Append ` *(state change)*` to mutation actions to retain prior emphasis.
- Maintain an `## Artifacts` section with subsections grouped by workflow phase:
  - `**Plan**` on its own line, followed by a new line of inline links separated by ` · ` to plan-related artifacts (`approved-issue.md`, `spec.md`, `plan.md`, `acceptance-tests.md`) if they exist.
  - `**Execution**` line with links for execution artifacts (`repair-log.md`, `cost-summary.json`) when present.
  - `**Review**` line with links for review artifacts (`review.md`, `review.json`) when present.
- Retain the `## Operator Notes` section content unless future requirements remove it; update references inside the notes only if wording must change to match the new dashboard terminology.
- Ensure the serialized `factory-state` comment remains unchanged at the end of the body.

## Non-Functional Requirements
- The rendered Markdown must stay within GitHub’s standard formatting capabilities (no HTML tables, nested HTML, or custom styling).
- Keep the body under existing character limits enforced by current tests.
- Preserve compatibility with template overrides by:
  - Introducing new required tokens (e.g., `DASHBOARD_SECTION`, `ARTIFACTS_SECTION`) and updating documentation/tests accordingly.
  - Maintaining validation errors when overrides omit required tokens.

## Detailed Design
- Refactor the control panel builder to produce a dashboard view model (state label/value pairs, open links, action links, artifact groups) while reusing its existing logic for state interpretation, recommended next steps, and action resolution.
- Update `renderPrBody` to:
  - Call the new dashboard builder.
  - Construct the Markdown table and link lines described above.
  - Provide `DASHBOARD_SECTION`, `ARTIFACTS_SECTION`, and `OPERATOR_NOTES_SECTION` variables to the template renderer; retire the old `CONTROL_PANEL_SECTION` and `STATUS_SECTION` variables.
- Replace the default `pr-body.md` template with one that renders `{{DASHBOARD_SECTION}}` immediately after the `Closes #...` line, followed by `{{ARTIFACTS_SECTION}}` and `{{OPERATOR_NOTES_SECTION}}`.
- Adjust artifact link rendering to support phase groupings and omit entries cleanly when files are missing.
- Review downstream consumers (`extractPrMetadata`, command routing, tests) to ensure they still rely solely on the serialized metadata comment rather than the visual layout, updating fixtures where they assert on section headings or bullets.
- Update documentation (e.g., README guidance on templates) to reflect the new token names and dashboard structure.

## Assumptions
- Downstream automation reads operational metadata exclusively from the HTML comment and not from the human-readable sections.
- All artifact files remain in the same paths; the redesign affects only presentation.
- Existing emoji and formatting helpers (cost, state, CI) continue to apply without behavioral changes.

## Open Questions
- Do we need to expose additional read-only links (e.g., branch URL) in the `Open` line, or is the latest run and review set sufficient? (Default to current control panel link set unless product direction clarifies otherwise.)
- Should the `Actions` line include non-mutating informational buttons (like “Open diagnostics”) when they’re primarily for investigation? (Assume yes if they were previously categorized as actions; re-evaluate during implementation.)

## Risks & Mitigations
- **Risk:** Template overrides fail after token renaming.  
  **Mitigation:** Update validation rules, document new tokens, and add tests verifying helpful warnings when overrides omit required tokens.
- **Risk:** Missing data produces awkward placeholders.  
  **Mitigation:** Standardize fallbacks (`—`) and cover edge cases in tests.
- **Risk:** Link lines become empty for certain states.  
  **Mitigation:** Suppress the entire line when no links exist and cover in unit tests.
