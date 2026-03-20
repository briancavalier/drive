# Spec: Factory Control Panel

## Summary
- Establish a durable "Factory Control Panel" inside every factory-managed pull request so operators can inspect state, blockers, and next steps without parsing labels, comments, or workflow history.
- Derive panel content from existing factory metadata plus live PR labels to keep the view authoritative and automatically refreshed as workflows run.
- Surface a constrained set of context-aware operator actions (state transitions or deep links) with consistent emoji affordances so the PR becomes the primary control surface.

## Current Behavior
- The PR body template renders separate "Status", "Artifacts", and "Operator Notes" sections. Status shows stage+CI strings, but no guidance on what to do next, why the PR is blocked, or which actions are safe.
- Operators must inspect labels (e.g. `factory:implement`, `factory:blocked`, `factory:paused`), workflow runs, and failure comments to piece together current state and recommended responses.
- There is no canonical place that ties together the latest workflow run, failure classification, retry counters, or available recovery actions, leading to inconsistent operator workflows once multiple PRs are active.

## Goals & Requirements
- Embed a single "Factory Control Panel" section with the fields requested in the issue (`State`, `Waiting on`, `Last completed stage`, `Reason`, `Recommended next step`, `Actions`).
- Keep the panel updated whenever `apply-pr-state.mjs`, `finalize-plan.mjs`, or other metadata writers touch the PR body so it reflects the latest automation state.
- Render `Reason` only when the PR is blocked, paused, or otherwise waiting on something non-obvious; map classified failure types to concise operator-facing text.
- Provide deep links to the latest relevant workflow run and artifacts when the metadata holds the necessary identifiers.
- Show only the actions that are valid for the current state, with consistent emoji semantics (transport emoji for state changes, document/search emoji for informational links).
- Preserve existing workflows (labels, safety gates, review handoff) and keep the implementation auditable.

## Proposed Changes
### Control Panel View Model
- Introduce `scripts/lib/control-panel.mjs` exporting a pure function that takes:
  - canonical PR metadata (including new fields described below),
  - the pull request labels,
  - repository context (`repositoryUrl`, `branch`, `prNumber`).
- The function returns a structured panel object: `state`, `waitingOn`, `lastCompletedStage`, optional `reason`, `recommendedNextStep`, `actions[]`, and supplemental links (latest run URL, artifact URLs).
- Compute `state` by overlaying metadata status with labels:
  - If `factory:paused` label is present, emit `paused` regardless of metadata status.
  - Otherwise use `metadata.status` (already normalized via `FACTORY_PR_STATUSES`).
- Derive `waitingOn` via the v1 mapping from the issue (operator, agent, human reviewer) with special cases for paused and blocked subtypes.
- Emit `lastCompletedStage` using a new metadata field updated when each stage succeeds (plan, implement, repair, review). When metadata lacks a value, fall back to the most recent actionable stage implied by `status`.
- Build `reason` text when:
  - status is `blocked` and `metadata.lastFailureType` (or `metadata.lastReviewArtifactFailure`) maps to a known failure subtype (`stage_noop`, `stage_setup`, `transient_infra`, `stale_branch_conflict`, self-modify guard, review artifact contract, exhausted repairs).
  - status is `paused` (reason: automation paused via label).
  - status is `ready_for_review` with pending review artifacts (reason referencing `pendingReviewSha` if set).
- Control the actions list by state:
  - Implement the matrix given in the issue, emitting objects `{ id, label, emoji, kind }` where `kind` distinguishes `mutation` versus `link`.
  - For mutation actions we will wire GitHub workflow-based shims (described below). For informational actions we generate direct URLs.
  - Ensure the function never surfaces actions outside the matrix; when optional data (latest run URL) is missing, drop the corresponding action instead of emitting a broken link.

### Metadata Enrichment & Persistence
- Extend `scripts/lib/pr-metadata.mjs` defaults with:
  - `lastCompletedStage: null`
  - `lastRunId: null`
  - `lastRunUrl: null`
  - `pauseReason: null` (for future extensibility; set to "manual" when the label is present).
- Update `scripts/apply-pr-state.mjs` to:
  - Capture the current PR labels (`pullRequest.labels`) and pass them to `renderPrBody`.
  - Accept new env vars (`FACTORY_LAST_COMPLETED_STAGE`, `FACTORY_LAST_RUN_ID`, `FACTORY_LAST_RUN_URL`, `FACTORY_PAUSE_REASON`) and merge them into metadata when provided.
  - When labels include `factory:paused` but metadata.status is not `paused`, leave metadata status unchanged; the control-panel overlay handles display while keeping the underlying state machine intact.
- Update factory workflows to persist the new metadata fields:
  - `finalize-plan.mjs`: set `FACTORY_LAST_COMPLETED_STAGE=plan` when the PR is created or updated.
  - `factory-pr-loop.yml`:
    - `mark-in-progress`: set `FACTORY_LAST_RUN_ID` to the current workflow run id and `FACTORY_LAST_RUN_URL` to `https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}` so “Open latest run” is immediately available.
    - `stage-succeeded` and `review-artifact-repair-succeeded`: set `FACTORY_LAST_COMPLETED_STAGE` according to the stage that succeeded (`implement` or `repair`) and keep the latest run metadata.
    - `process-review.mjs` success path: set `FACTORY_LAST_COMPLETED_STAGE=review` and retain the run metadata.
    - `handle-stage-failure.mjs`: supply `FACTORY_LAST_RUN_URL` and increment `FACTORY_LAST_RUN_ID` so blocked states point to the failing run.
- Ensure repeated repair exhaustion and self-modify guard failure already stored in metadata are surfaced through `lastFailureType` or `lastReviewArtifactFailure`; add a derived flag in metadata if needed (e.g., note when `repairAttempts` exceeded `maxRepairAttempts`).

### PR Body Rendering
- Insert a new `CONTROL_PANEL_SECTION` token into `scripts/templates/github-messages/pr-body.md`, positioned before the existing `STATUS_SECTION` so the panel is prominent while retaining compatibility with overrides.
- Extend `renderPrBody` to:
  - Build artifact links via existing helpers.
  - Call the new control panel view model with metadata + labels.
  - Render markdown resembling:
    ```markdown
    ## Factory Control Panel
    - **State:** 🛠️ Repairing
    - **Waiting on:** agent
    - **Last completed stage:** implement
    - **Reason:** Latest repair run exhausted automatic retries (failure: review_artifact_contract)
    - **Recommended next step:** Review diagnostics, decide whether to retry or escalate.
    - **Latest run:** [🏃 Open latest run](...)
    - **Artifacts:** [📄 Plan](...), [📄 Acceptance tests](...)

    **Actions**
    - ▶ Start implement (state change)
    - ⏸ Pause (state change)
    - 🧾 Open review artifacts
    ```
  - Suppress `Reason` line when not applicable and hide `Latest run` when metadata lacks an id/url.
  - Collapse informational links under the panel rather than repeating them in the lower `Artifacts` section; the existing section remains for backward compatibility but can be shortened to reference the panel.
- Update default operator notes to reference the control panel (“Use the control panel actions above…”) and prune redundant instructions once actions live in the panel.

### Action Handling
- Add a new reusable workflow `.github/workflows/factory-control-action.yml` with `workflow_dispatch` inputs:
  - `pr_number` (required), `action` (enum covering `start_implement`, `pause`, `resume`, `retry`, `reset`, `approve_self_modify`, `escalate`) and optional `comment`.
  - The workflow calls `node scripts/apply-pr-state.mjs` (or existing workflows) with the appropriate env/label changes, then exits.
  - For actions that already have dedicated workflows (`Factory Reset PR`), reuse them by redirecting via `workflow_call` or by running the existing action with the correct inputs.
- In the panel renderer, state-changing actions generate links to this workflow’s run page using anchor fragments (`.../actions/workflows/factory-control-action.yml?pr=<>&action=...`). Include explanatory hover text clarifying that the link opens the workflow dispatch form.
- For informational actions, link directly to:
  - Latest run (`metadata.lastRunUrl`).
  - Branch (`https://github.com/<repo>/tree/<branch>`).
  - Diagnostics or artifacts (existing artifact URLs built earlier).
- Ensure emoji usage matches the issue guidance: transport/play symbols for state transitions, document/search for informational links.

### Documentation & Operator Guidance
- Update `README.md` (or a dedicated operator doc) with a screenshot/description of the new panel, explaining each field and how the action workflow works.
- Document how the paused override behaves (label overlay) and how to interpret reasons for blocked states.

### Testing & Observability
- Add unit tests for the control-panel view model covering:
  - Each primary status (`plan_ready`, `implementing`, `repairing`, `reviewing`, `ready_for_review`, `blocked`, `paused`).
  - Blocked subtypes (`stage_noop`, `stage_setup`, `transient_infra`, `stale_branch_conflict`, self-modify guard, review artifact contract, exhausted repairs).
  - Action suppression when dependencies (run URL, artifacts) are missing.
- Update `tests/github-messages.test.mjs` to assert that `renderPrBody` embeds the control panel section and that metadata markers remain parseable.
- Extend workflow-related tests (e.g., `tests/apply-pr-state-metadata.test.mjs`, `tests/build-stage-prompt.test.mjs`) to cover the new metadata fields and paused overlay behavior.

## Assumptions
- GitHub workflow dispatch links are an acceptable mechanism for “one-click” operator actions (the operator lands on the dispatch form with inputs pre-populated and only needs to press Run).
- Existing automation already provides all failure classifications required for blocked reason text; no new classifiers are needed.
- `apply-pr-state.mjs` remains the single writer of PR metadata, so augmenting it keeps metadata consistent.

## Out of Scope
- Building an external web dashboard or GitHub App to render the panel outside of the PR body.
- Changing the underlying state machine transitions or adding new statuses beyond the overlay.
- Adding autonomous merge or deployment capabilities.

## Risks & Mitigations
- **Risk:** Incorrect state-to-action mapping could expose unsafe transitions. *Mitigation:* Centralize the matrix in one module with exhaustive tests per state.
- **Risk:** Metadata drift (e.g., run IDs not set on success paths) would break “Open latest run” links. *Mitigation:* Update every workflow transition to set run metadata and add tests ensuring the fields are populated when expected.
- **Risk:** Panel noise if we duplicate artifact links across sections. *Mitigation:* Keep the existing artifacts section concise and rely on the control panel for primary links.
- **Risk:** Workflow dispatch links may still require two clicks (open + run). *Mitigation:* Document the behavior and pre-fill defaults so operators only confirm.

## Open Questions
- Should we persist the paused reason (manual vs automation) in metadata so future automation can display richer explanations? Initial implementation will expose a generic "Automation paused via label" message unless further detail is requested.
- Does the repository prefer separate workflows per action instead of one multipurpose dispatcher? The spec assumes a single workflow to simplify maintenance, but we can split if needed once feedback arrives.
