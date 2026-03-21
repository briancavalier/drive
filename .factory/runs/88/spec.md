# Factory Dashboard Redesign Spec (Issue #88)

## Summary
- Produce a lighter-weight `Factory Dashboard` section in generated PR bodies that replaces the current table-like control panel and status blocks with compact grouped lines.
- Present state, stage, waiting context, run health, and cost in concise horizontal groupings that make better use of space while remaining GitHub Markdown–compatible.
- Replace the old clickable action list with state-aware slash-command suggestions and keep artifacts grouped by purpose without tables.
- Relocate the `Closes #<issue>` reference near the bottom of the PR body, just above the existing `factory-state` HTML comment, without altering the metadata payload.

## Existing Implementation Overview
- `scripts/lib/github-messages.mjs` builds the PR body from the `pr-body.md` template, injecting a "Factory Control Panel" bullet list, a separate "Status" list, and an "Artifacts" bullet list.
- `buildControlPanel` (in `scripts/lib/control-panel.mjs`) normalizes metadata into `stateDisplay`, `waitingOn`, `lastCompletedStage`, `latestRun`, artifact link suggestions, and a list of command/link actions.
- Tests in `tests/github-messages.test.mjs` and `tests/control-panel.test.mjs` assert the current markdown structure and action labels.

## Proposed Layout
### Template Structure
- Update `scripts/templates/github-messages/pr-body.md` so the rendered body starts with `## Factory Dashboard` and drops the `# Factory Run` heading.
- Reorder template placeholders to output sections in this order: dashboard, suggested actions, artifacts, operator notes, `Closes #...`, then the serialized `factory-state` comment appended by `renderPrBody`.

### Dashboard Summary Line
- Render the first line as `**{stateDisplay}** · {stageDisplay?} · {waitingDescriptor}` where:
  - `stateDisplay` uses the existing emoji + label from `controlPanel.stateDisplay`.
  - `stageDisplay` appears in the second slot only when a stage adds context; format as `{stageEmoji} `{stageName}``.
  - `waitingDescriptor` uses friendlier phrases (e.g. `🧑 Human action required`, `🧑‍⚖️ Human review required`, `🤖 Automation running`, `⏸️ Automation paused`).
- Define a helper (e.g. `resolveDashboardStage`) in `github-messages.mjs` that selects the appropriate stage:
  - Prefer `metadata.blockedAction` when the status is `blocked`.
  - Otherwise map status → stage (`plan` for planning/planReady, `implement` for implementing/repairing, `review` for reviewing/ready_for_review).
  - Treat the stage as redundant (return `null`) for `planning`, `plan_ready`, and `paused` states so the summary line collapses to two segments; all other mapped stages remain visible.
  - Use the same helper to identify an optional stage emoji (`📝 plan`, `🏗️ implement`, `🔍 review`).
- Create a helper (e.g. `formatWaitingDescriptor`) that converts `controlPanel.waitingOn` into the required wording and emoji.

### Secondary Dashboard Lines
- Line 2: `CI: {emoji status text} · Repairs: `{repairAttempts} / {maxRepairAttempts}` using the existing CI status emoji mapping and numeric repair data.
- Line 3 (only when cost data exists): `Cost: {costEmoji?} ${totalEstimate} total · Estimate: ${stageEstimate} via {lastEstimatedModel}` using existing cost fields; if stage estimate/model is missing, replace the right-hand segment with `Estimate: —`.
- Line 4 (`Open:`): consolidate read-only links into a single line prefixed with `**Open:**` followed by dot-separated links when available. Include, in order, latest run (`controlPanel.latestRun`), review summary (`links.review`), and review JSON.

### Suggested Next Actions
- Replace the current "Actions" block with a `**Suggested next actions**` heading immediately after the dashboard lines.
- Convert each state-appropriate slash command into `- `/factory <verb>` — <short guidance>` (en dash separator) without markdown links.
- Build the list from `controlPanel.actions`, filtering for `kind === "mutation"` and translating known `action.id` values to human-readable explanations (e.g. resume, pause, reset, implement). Suppress duplicate or irrelevant commands per state.

### Artifacts Section
- Render `## Artifacts` followed by three compact lines:
  - `**Plan**` line with approved issue, spec, plan, acceptance tests linked and separated by ` · `.
  - `**Run**` line with repair log and cost summary when present.
  - `**Review**` line with review.md and review.json.
- Omit a group entirely when none of its links exist.

### Operator Notes & Issue Reference
- Keep `## Operator Notes` but trim to three bullets:
  - Slash commands control the run.
  - Manual label fallbacks remain available.
  - Cost estimates are advisory heuristics.
- Move `Closes #{{ISSUE_NUMBER}}` below the notes but above the serialized `factory-state` comment.

## Data and Logic Updates
- Extend `renderPrBody` to compute the new summary line, waiting descriptor, and suggested actions text while still relying on `buildControlPanel` for source metadata.
- Provide fallbacks when metadata is missing to avoid rendering blank separators (skip segments instead of emitting dangling dots).
- Ensure cost/estimate line handles zero/undefined values gracefully and is omitted entirely when no cost data is available.
- Maintain existing serialization of the `factory-state` comment unchanged to protect downstream automation.

## Impacted Files
- `scripts/lib/github-messages.mjs`
- `scripts/lib/control-panel.mjs` (if new helpers require exposing additional metadata such as stage/blocked action)
- `scripts/templates/github-messages/pr-body.md`
- `tests/github-messages.test.mjs`
- `tests/control-panel.test.mjs`

## Assumptions
- Available metadata already includes `blockedAction`, `repairAttempts`, cost estimates, and linked artifacts; no new data sources are required.
- All slash commands referenced currently exist in `FACTORY_SLASH_COMMANDS` and stay stable.
- Rendering remains plain GitHub Markdown; no HTML tables or custom CSS will be introduced.
