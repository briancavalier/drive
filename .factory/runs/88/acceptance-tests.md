# Acceptance Tests

1. Blocked run layout
   - Given metadata with `status: blocked`, `blockedAction: review`, one repair attempt, cost data, and latest run URL, the rendered PR body starts with `## Factory Dashboard` and the first line reads `**⚠️ Blocked** · 🔍 `review` · 🧑 Human action required`.
   - The second line reads `CI: ⏳ Pending · Repairs: `1 / 3`` and the third line shows both total cost and latest estimate with the model name.
   - The `Open:` line lists `Latest run`, `Review summary`, and `Review JSON` links separated by ` · `, and `Suggested next actions` lists only slash-command suggestions (`/factory resume`, `/factory reset`, etc.) with guidance text separated by an en dash.
2. Automation running state omits stage
   - Given metadata with `status: implementing` and running CI, the summary line renders `**🏗️ Implementing** · 🤖 Automation running` with no stage segment between them.
   - Suggested next actions include `/factory pause` and exclude commands that are not available in the current state (e.g. `/factory reset`).
3. Plan-ready state artifacts and suggestions
   - With `status: plan_ready`, the `Suggested next actions` section includes `/factory implement` and `/factory pause` entries with explanations, and the `**Plan**` artifact line lists approved issue, spec, plan, and acceptance test links separated by ` · `.
   - The `**Run**` line is omitted when there is no repair log or cost summary.
4. Bottom-of-body references
   - The `## Operator Notes` section lists exactly three bullets covering slash commands, manual labels, and advisory cost estimates.
   - `Closes #<issue>` appears immediately below the operator notes and directly above the serialized `<!-- factory-state ... -->` comment.

