# Preserve Dashboard Artifact Links After Merge (Run 126)

## Overview
- Ensure PR dashboard artifact links remain valid after a factory-managed pull request is merged and the head branch is deleted.
- Introduce a durable reference for artifact URLs so post-merge rewrites target the base branch while keeping pre-merge behavior unchanged.
- Automate the post-merge rewrite through the factory PR loop to cover all factory-authored links consistently.

## Current Behavior
- `renderPrBody` (`scripts/lib/github-messages.mjs:648`) builds artifact URLs by combining `repositoryUrl`, the live head `branch`, and `artifactsPath`. Metadata does not track which ref was used.
- `apply-pr-state.mjs` always renders the PR body with the head branch (`pullRequest.head.ref`). There is no mechanism to override the link target.
- The factory workflows (`.github/workflows/factory-pr-loop.yml`) never handle `pull_request` close/merge events; `route-pr-loop.mjs:34` explicitly returns `noop` for all `pull_request` events.
- After merge, GitHub auto-deletes the head branch, turning dashboard links such as `review.md` or `plan.md` into 404s even though the artifacts exist on the base branch.

## Target Experience
- While a PR is open, dashboard links continue to target the active factory branch exactly as they do today.
- When GitHub sends a merged `pull_request` event, the factory rewrites the PR body so every artifact link (`approved-issue.md`, `spec.md`, `plan.md`, `acceptance-tests.md`, `repair-log.md`, `cost-summary.json`, `review.md`, `review.json`) points to the PR's base branch.
- Operators viewing the merged PR conversation retain working links to all durable artifacts without manual intervention. Rewrites happen only after a confirmed merge to avoid disrupting the pre-merge workflow.
- Any other surfaces that consume the stored metadata (e.g., control panel actions) continue to work because the artifact ref is tracked explicitly.

## Detailed Changes
- **Metadata & Rendering**
  - Extend the canonical PR metadata shape (`scripts/lib/pr-metadata-shape.mjs`, `scripts/lib/pr-metadata.mjs`) with an `artifactRef` string (or `null`) representing the git ref used for artifact links. Canonicalization should trim whitespace, coerce empty strings to `null`, and persist the value across renders.
  - Update `renderPrBody` in both `scripts/lib/pr-metadata.mjs` and `scripts/lib/github-messages.mjs` to accept an `artifactRef` parameter. `buildArtifactLinks` should prefer `artifactRef` when present and fall back to the provided `branch` for backwards compatibility.
  - Ensure serialized metadata embedded in the PR body includes the new field so future runs reuse the durable ref.

- **apply-pr-state Support**
  - Add an `applyArtifactRef` helper to `scripts/apply-pr-state.mjs` that honors a new `FACTORY_ARTIFACT_REF` environment variable. Support the existing `__UNCHANGED__` and clearing semantics used by other fields.
  - Invoke this helper during metadata normalization so stage jobs (and the post-merge rewrite) can set or clear the durable ref without altering unrelated fields.

- **Merge Event Routing**
  - Teach `scripts/route-pr-loop.mjs` to detect `pull_request` events with `action === "closed"` and `payload.pull_request.merged === true`. For managed PRs with valid factory metadata, emit a new action (e.g., `finalize_merge`) along with the PR number, issue number, artifacts path, head branch, and base branch.
  - Update `resolveConcurrencyKey`/`setOutputs` to propagate the base branch (e.g., `final_artifact_ref`) so downstream jobs can access it. Add tests in `tests/route-pr-loop.test.mjs` to cover the new routing branch and guard against non-factory PRs.

- **Workflow Automation**
  - Modify `.github/workflows/factory-pr-loop.yml` to subscribe to `pull_request` events of type `closed`. Respect the workflow-safety checklist when editing.
  - Add a `finalize-merged-pr` job (after the reroute lock) that runs `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the base branch supplied by the router. The job should require the same permissions as other PR-mutating steps (`contents: write`, `pull-requests: write`) and reuse the existing concurrency group.

- **Validation & Tests**
  - Expand `tests/github-messages.test.mjs` (and related helpers) to assert that providing `artifactRef` yields URLs rooted at the override while defaulting to the head branch otherwise.
  - Add coverage in `tests/pr-metadata.test.mjs` for metadata round-tripping the new field.
  - Extend `tests/apply-pr-state-metadata.test.mjs` to verify `applyArtifactRef` honors `FACTORY_ARTIFACT_REF` inputs, clearing, and `__UNCHANGED__` behavior.
  - Update any fixtures that decode serialized metadata (e.g., `tests/control-panel.test.mjs`, `tests/event-router*.test.mjs`) if they depend on exact object shapes.

## Testing & Validation
- Unit tests: `npm test` focusing on updated suites (`github-messages`, `pr-metadata`, `apply-pr-state-metadata`, `route-pr-loop`).
- Workflow tests: Run a dry-run (`act` or staging repo) to confirm the `pull_request` closed event schedules the new job and rewrites the PR body without altering other metadata.
- Manual spot check: Merge a factory-managed PR, confirm the PR body now references `blob/<base-branch>/...` for every artifact, and verify the links resolve successfully.

## Assumptions & Open Questions
- GitHub's merged `pull_request` payload still includes the original PR body, allowing metadata extraction without an additional API fetch. If missing, the implementation will fall back to `getPullRequest`.
- The base branch always contains the `.factory/runs/<issue>` artifacts after merge; no extra synchronization is required.
- Updating the PR body after merge continues to be allowed with the bot credentials used elsewhere (no extra scopes needed).
- We do not change the control panel "Open branch" action in this issue; it may still point to the deleted head branch if GitHub removes it immediately.
