## Problem statement

The current factory PR body duplicates overlapping run state across `Factory Control Panel` and `Status`. That makes the top of the PR feel noisy and generated rather than intentional. We want a single top-level status surface that is easier to scan and feels more like a lightweight application control panel, while keeping artifact links and operator actions easy to access.

For context, this is the intended shape of the redesigned PR body:

```md
Closes #<issue>

## Factory Dashboard

| | |
| --- | --- |
| **State** | ✅ Ready for review |
| **Owner** | Human reviewer |
| **Stage** | `review` |
| **CI** | ✅ Passing |
| **Repairs** | `0 / 3` |
| **Cost** | 🟢 `$0.0238` total |
| **Estimate** | `$0.0016` via `gpt-5-mini` |
| **Next** | Review and approve if ready |

**Open:** [Latest run](...) · [Review summary](...) · [Review JSON](...)
**Actions:** [Pause automation](...)

## Artifacts

**Plan**  
[approved-issue.md](...) · [spec.md](...) · [plan.md](...) · [acceptance-tests.md](...)

**Execution**  
[repair-log.md](...) · [cost-summary.json](...)

**Review**  
[review.md](...) · [review.json](...)

## Operator Notes

- Use the control panel for operational actions.
- Manual label fallbacks remain available.
- Cost figures are advisory estimates, not billed usage.

<!-- factory-state
...
-->
```

## Goals

- Consolidate duplicated run/PR status into a single `Factory Dashboard` section.
- Make the top of the PR read like a compact dashboard rather than two separate status lists.
- Keep artifact links directly accessible in the PR body.
- Separate read-only navigation links from state-changing operator actions.
- Improve wording and structure so the PR looks more polished and modern within standard GitHub Markdown constraints.
- Keep the overall presentation visually lightweight.

## Non-goals

- Do not replace artifact links with embedded summaries or collapsible prose.
- Do not render artifacts in a table.
- Do not remove the machine-readable `factory-state` comment.
- Do not introduce HTML-only styling tricks or rely on unsupported GitHub rendering behavior.
- Do not change the underlying factory state model, workflow behavior, or artifact contract.
- Do not remove manual label-based operator fallbacks.

## Constraints

- The generated PR body must render cleanly in standard GitHub Markdown.
- Artifact files under `.factory/runs/<issue>/` must remain linked from the PR body.
- The top section should avoid duplicated status fields appearing in multiple places.
- The design should stay compact enough to remain readable on GitHub PR pages without excessive scrolling.
- Existing automation that depends on the `factory-state` comment must continue to work unchanged.
- The overall layout should remain visually lightweight rather than overly grid-heavy.

## Acceptance criteria

- Factory PR descriptions no longer render separate `Factory Control Panel` and `Status` sections.
- All live run/PR status is presented in a single `Factory Dashboard` section.
- The dashboard uses a two-column Markdown table with blank header cells.
- The dashboard includes, at minimum: state, owner/waiting-on, stage, CI, repair attempts, cost, latest estimate, and recommended next step.
- Read-only links are grouped under an `Open` line and state-changing controls are grouped under an `Actions` line.
- Artifacts remain links in the PR body and are grouped by workflow phase such as `Plan`, `Execution`, and `Review`.
- Artifact links are not rendered as a table.
- Labels and values are concise and human-readable, for example `State`, `Owner`, `Stage`, `Repairs`, `Cost`, `Next`, `Human reviewer`, and `Passing`.
- The machine-readable `factory-state` comment remains present and unchanged in purpose.

## Risk

Changing the PR body generator could accidentally break expected operator workflows, omit important links, or create layout regressions that make factory PRs harder to use. There is also some risk of unintentionally removing fields that humans rely on during review or of introducing a format that looks cleaner but becomes brittle as state/action combinations evolve.

## Affected area

CI / Automation
