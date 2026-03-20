### Problem statement

Factory-managed pull requests currently expose operator state through a mix of labels, PR draft status, workflow runs, comments, and artifacts. That is workable for a small number of runs, but it creates avoidable operator friction once multiple PRs are active or blocked at the same time.

We need a single, durable PR-level control panel that answers four questions without requiring the operator to inspect workflow logic or multiple comments:

1. What state is this factory PR in right now?
2. What is it waiting on?
3. Why is it blocked or paused, if applicable?
4. What are the valid next actions for the operator?

The control panel should combine contextual next-step guidance with state-appropriate one-click actions. The current repo already has most of the state inputs needed for this feature: factory labels and PR metadata, stage outputs from the reusable workflow, failure classifications, retry counters, review state, and artifact/run links. The missing piece is a canonical operator-facing rendering of that state and a small set of safe control actions.

This should be implemented as a first-class factory UX improvement for factory-managed PRs. The pull request should become the control surface for operators rather than requiring them to remember label/state conventions.

### Goals

- Add a canonical "Factory Control Panel" section to every factory-managed PR.
- Make the control panel durable and updated as the PR moves through plan, implement, repair, review, blocked, paused, and ready-for-review states.
- Show concise, operator-facing fields at minimum:
  - `State`
  - `Waiting on`
  - `Last completed stage` when available
  - `Reason` when blocked, paused, or otherwise waiting on a non-obvious condition
  - `Recommended next step`
  - `Actions`
- Render only the actions that are valid for the current state.
- Provide direct links to the latest relevant run and artifacts when available.
- Keep the pull request as the central operator surface.
- Preserve the existing GitHub-native workflow and human merge gate.
- Keep the implementation readable and auditable by maintainers.
- Use selective emoji on action controls to improve scan speed without making the panel noisy.

Suggested state/action matrix for v1:

- `plan_ready`
  - Waiting on: `operator`
  - Recommended next step: review plan artifacts, then start implement if acceptable
  - Actions: `Start implement`, `Pause`, `Open plan artifacts`
- `implementing`
  - Waiting on: `agent`
  - Actions: `Open latest run`, `Pause`
- `repairing`
  - Waiting on: `agent`
  - Actions: `Open latest run`, `Pause`, `Reset PR`
- `reviewing`
  - Waiting on: `agent`
  - Actions: `Open latest run`, `Pause`
- `ready_for_review`
  - Waiting on: `human reviewer`
  - Actions: `Open review artifacts`, `Pause automation`
- `blocked` with `stage_noop`
  - Waiting on: `operator`
  - Actions: `Retry`, `Reset PR`, `Pause`, `Open diagnostics`
- `blocked` with `stage_setup`
  - Waiting on: `operator`
  - Actions: `Retry`, `Reset PR`, `Pause`, `Open latest run`
- `blocked` with `transient_infra`
  - Waiting on: `operator`
  - Actions: `Retry`, `Pause`, `Open latest run`
- `blocked` with `stale_branch_conflict`
  - Waiting on: `operator`
  - Actions: `Open branch`, `Reset PR`, `Pause`
- `blocked` with self-modify guard failure
  - Waiting on: `operator`
  - Actions: `Approve self-modify`, `Reset PR`, `Pause`
- `blocked` with review artifact contract failure
  - Waiting on: `operator`
  - Actions: `Retry review`, `Reset PR`, `Pause`, `Open artifacts`
- `blocked` with repeated repair failures or exhausted repair cap
  - Waiting on: `operator`
  - Actions: `Escalate to human-only`, `Reset PR`, `Pause`, `Open failure history`
- `paused`
  - Waiting on: `operator`
  - Actions: `Resume`, `Reset PR`, `Open latest run`

Action semantics for v1:

- `Start implement`: trigger the existing implement transition using the repo's established control mechanism.
- `Pause`: apply the existing paused state using the repo's established control mechanism.
- `Resume`: clear paused state and restore the PR to the correct actionable state.
- `Retry`: re-trigger the appropriate current stage without the operator needing to remember label/state details.
- `Reset PR`: invoke the existing Factory Reset PR behavior.
- `Approve self-modify`: enable the existing self-modify gate for the PR when repository policy permits it.
- `Escalate to human-only`: mark the PR as outside autonomous handling with a durable PR-visible signal.
- `Open latest run`, `Open artifacts`, `Open diagnostics`, `Open failure history`, `Open branch`, `Open review artifacts`: these may be rendered as links rather than mutating actions.

Emoji guidance for v1 actions:

- Use emoji selectively on action controls to improve scan speed for operators.
- Do not add emoji to every line of the panel; keep `State`, `Waiting on`, `Reason`, and `Recommended next step` text-first and readable.
- Use consistent emoji semantics so operators can distinguish state-changing actions from read-only links at a glance.
- Prefer action/transport emoji for state-changing controls and document/navigation emoji for informational links.
- Do not rely on emoji alone; every control still needs a clear text label.

Suggested action labels for v1:

- `▶ Start implement`
- `⏸ Pause`
- `▶ Resume`
- `🔁 Retry`
- `🧹 Reset PR`
- `🔓 Approve self-modify`
- `🧑 Escalate to human-only`
- `🏃 Open latest run`
- `📄 Open artifacts`
- `🔎 Open diagnostics`
- `🧾 Open review artifacts`
- `🌿 Open branch`
- `🧭 Open failure history`

Suggested implementation direction:

- Reuse the existing PR body/comment templating path if possible instead of creating a second independent operator surface.
- Prefer one stable control-panel section that is rewritten in place rather than a stream of ad hoc comments.
- Derive panel state from existing authoritative workflow/metadata sources instead of duplicating state.
- Keep the renderer logic centralized so the state/action matrix is easy to audit and update.
- Add tests for the rendering and the state-to-actions mapping.

Likely implementation touchpoints include, but are not limited to:

- PR state/comment/body rendering utilities under `scripts/lib/**`
- `scripts/apply-pr-state.mjs`
- failure handling/comment generation scripts
- workflow transitions in `.github/workflows/factory-pr-loop.yml`
- any existing template override support under `.factory/messages/**`
- tests covering PR state rendering, failure comments, and workflow routing

### Non-goals

- Building a separate web dashboard in this issue.
- Replacing the existing GitHub-native control plane with an external service.
- Multi-repo orchestration.
- Autonomous merge or deploy behavior.
- Redesigning the entire factory state machine.
- Adding arbitrary new approval roles beyond the repository's existing permissions model.
- Implementing full inline per-file review actions.

### Constraints

- Must run entirely inside GitHub Actions and the repository itself.
- Must preserve the existing human review gate for merges.
- Must keep the current factory state machine behavior intact unless a change is required to support the control panel semantics.
- Must not require an external database, queue, or web service.
- Must work for factory-managed PRs only.
- Must not expose destructive or invalid actions for the current state.
- Must make it obvious when an action is informational-only (link) versus state-changing.
- Must remain compatible with existing factory message template overrides or extend them carefully without breaking current behavior.
- Must keep the implementation readable and testable.
- Must not require operators to remember hidden label conventions in order to use the panel.

### Acceptance criteria

- Every factory-managed PR shows a stable "Factory Control Panel" section in a single canonical location.
- The control panel updates as the PR moves through `plan_ready`, `implementing`, `repairing`, `reviewing`, `ready_for_review`, `blocked`, and `paused` states.
- The panel includes `State`, `Waiting on`, `Recommended next step`, and `Actions` for all supported states.
- When blocked, the panel includes a specific operator-facing `Reason` derived from the classified failure rather than a generic blocked message.
- The panel includes links to the latest relevant run and artifacts whenever those links are available.
- The panel renders only actions that are valid for the current state.
- The panel supports the v1 action set described above, either as real state transitions or clearly labeled links where appropriate.
- Emoji, if used, are limited to actions or other clearly intentional scan aids and remain consistent with the semantics defined above.
- Existing operator workflows still work if someone continues using labels or existing workflows directly.
- Existing non-control-panel PR/status/comment behavior remains correct for plan, implement, repair, review, and failure handling.
- Tests cover rendering for the main states and at least these blocked subcases:
  - `stage_noop`
  - `stage_setup`
  - `transient_infra`
  - `stale_branch_conflict`
  - self-modify gate failure
  - review artifact contract failure
  - exhausted repair cap or repeated repair failure state
- Tests verify that invalid actions are not shown for a given state.
- Documentation explains the control panel behavior and action semantics for operators.

### Risk

- If panel state derivation is wrong, operators may be shown the wrong action and push the PR into a confusing state.
- If the implementation duplicates state instead of deriving it from existing metadata, the control panel can drift from actual workflow behavior.
- If actions are too permissive, operators could bypass intended safety controls.
- If actions are too weak or inconsistent, the panel will become decorative and operators will fall back to labels/comments.
- If the control panel is implemented as noisy comment spam, it will make PRs harder to read instead of easier.
- If template integration is handled carelessly, existing message override behavior could regress.

### Affected area

CI / Automation
