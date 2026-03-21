## Problem statement

The original PR-body redesign requested in #84 established a useful direction for consolidating duplicated PR status, but that issue does not yet represent merged production behavior. We want to continue iterating on the dashboard design before adopting it.

The current design direction still feels too heavy and too document-like. In particular, the table-based status presentation takes up too much visual space, the artifact section is more vertical than necessary, and the old clickable action model no longer fits the current slash-command control flow.

We want a lighter-weight `Factory Dashboard` design that uses compact grouped lines instead of a table, makes better use of horizontal space, keeps artifacts easy to scan, and presents operator controls as slash-command suggestions rather than non-functional clickable actions.

This issue should build on the problem framing from #84 but replace the proposed layout direction with the following target rendering shape:

```md
## Factory Dashboard

**⚠️ Blocked** · 🔍 `review` · 🧑 Human action required  
CI: ⏳ Pending · Repairs: `1 / 3`  
Cost: 🟢 `$0.0166` total · Estimate: `$0.0016` via `gpt-5-mini`

**Open:** [Latest run](https://github.com/briancavalier/drive/actions/runs/23360634823) · [Review summary](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/review.md) · [Review JSON](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/review.json)

**Suggested next actions**
- `/factory resume` Resume after reviewing the failure context.
- `/factory reset` Reset the PR to plan-ready if this run should restart.
- `/factory pause` Pause automation if you want to stop further activity.

## Artifacts

**Plan** [approved-issue.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/approved-issue.md) · [spec.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/spec.md) · [plan.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/plan.md) · [acceptance-tests.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/acceptance-tests.md)
**Run** [repair-log.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/repair-log.md) · [cost-summary.json](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/cost-summary.json)
**Review** [review.md](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/review.md) · [review.json](https://github.com/briancavalier/drive/blob/factory/84-redesign-factory-pr-body-to-consolidate-status-a/.factory/runs/84/review.json)

## Operator Notes

- Comment a slash command on the PR to control the run.
- Manual label fallbacks remain available.
- Cost estimates are advisory heuristics and may not match actual billed usage.

Closes #84

<!-- factory-state
...
-->
```

## Goals

- Preserve the consolidation goal from #84 while replacing the proposed visual design with a lighter-weight dashboard layout.
- Replace the table-based dashboard concept with a grouped-line layout.
- Group related information together in ways that feel intuitive and compact rather than rendering a generic key/value list.
- Make better use of horizontal space in the dashboard and artifact sections.
- Replace non-functional clickable actions with slash-command suggestions that reflect the current control model.
- Keep the overall PR body visually lightweight while still surfacing state, links, and next actions clearly.

## Non-goals

- Do not treat the unmerged design direction from #84 as the fixed live baseline.
- Do not reintroduce the old separate `Status` section.
- Do not use a Markdown table for the dashboard.
- Do not use a Markdown table for artifacts.
- Do not attempt to make slash commands themselves clickable if GitHub cannot actually submit them as comments.
- Do not remove artifact links from the PR body.
- Do not remove the machine-readable `factory-state` comment.
- Do not change the underlying factory state machine or slash-command routing behavior.

## Constraints

- The generated PR body must render cleanly in standard GitHub Markdown.
- The dashboard should use compact grouped text lines rather than a table.
- Status information should be grouped semantically, for example status/stage/waiting state on one line, CI/repairs on a second line, and cost/estimate on a third line.
- When the stage is shown in the top summary line, it should appear in the second position rather than the third.
- The stage should only be shown when it adds disambiguating context and should be omitted when redundant.
- The waiting-state text must be clearer than raw values like `operator` or `agent`.
- Emoji may be used in the top summary line to improve scanability, but the rest of the dashboard should remain visually restrained.
- Slash-command controls should be rendered as suggested next actions with the command shown first and a short explanation after it.
- Artifact groups should remain links, stay easy to scan, and use a compact one-line-per-group layout.
- The `Closes #<issue>` reference should appear near the bottom of the PR body just above the `factory-state` comment, not above the dashboard heading.
- Existing automation that depends on the `factory-state` comment must continue to work unchanged.

## Acceptance criteria

- Factory PR descriptions render a `Factory Dashboard` section without using a table.
- The top dashboard summary is rendered as compact grouped lines instead of a key/value list.
- The top summary line uses clearer human-facing waiting-state language such as `Human action required`, `Human review required`, or `Automation running` instead of raw internal terms like `operator` or `agent`.
- The top summary line may include emoji for state, stage, and waiting-state context when useful.
- The stage appears in the second slot of the summary line when shown.
- The stage is omitted from the summary line in states where it is redundant.
- CI and repair-attempt information are grouped on one line.
- Total cost and latest estimate are grouped together on a separate line.
- Read-only links remain grouped under an `Open:` line.
- Operator controls are rendered under `Suggested next actions` as slash-command suggestions, with the slash command shown first and a short explanatory phrase after it.
- Suggested actions are state-aware and limited to the actions that make sense for the current PR state.
- Artifacts remain links grouped under `Plan`, `Run`, and `Review`, with one compact line per group and no table.
- Operator notes include that slash commands control the run, manual label fallbacks remain available, and cost estimates are advisory heuristics that may not match actual billed usage.
- The issue-closing reference appears near the bottom of the PR body just above the `factory-state` comment.
- The machine-readable `factory-state` comment remains present and unchanged in purpose.

## Risk

Changing the PR-body renderer again could create churn in a sensitive operator-facing surface and may introduce formatting regressions across different factory states. There is also a risk that a visually lighter layout could accidentally hide important context if the grouping logic is not state-aware, or that stage/waiting-state wording could become inconsistent across statuses and make the dashboard harder to interpret.

## Affected area

CI / Automation
