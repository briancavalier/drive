## Overview
- Pull-request dashboard links are built with the factory branch (`blob/<head>/<artifactsPath>`), so the links 404 once GitHub deletes the head branch after merge. Operators lose access to plan/review artifacts from the merged PR conversation.
- We will teach the factory control plane to re-render the dashboard with durable artifact refs (base branch) immediately after a managed PR merges, while keeping the current head-branch experience before merge.

## Current Behavior
- `scripts/lib/github-messages.mjs` and `scripts/lib/pr-metadata.mjs` generate artifact URLs via `buildArtifactLinks({ branch })`, always pointing at the head branch passed to `renderPrBody`.
- `scripts/apply-pr-state.mjs` is the single writer that re-renders the PR body. It always passes `pullRequest.head.ref` as the branch argument.
- `factory-pr-loop.yml` ignores `pull_request` events, so no automation runs when the PR closes/merges.

## Proposed Changes

### Artifact link rendering
- Introduce an explicit `artifactRef` (defaults to the current branch) when rendering artifact URLs.
  - Update `buildArtifactLinks` in `scripts/lib/pr-metadata.mjs`, `scripts/lib/github-messages.mjs`, and downstream consumers to accept `{ repositoryUrl, ref, artifactsPath }`.
  - Update `renderPrBody` to pass the new ref through to the dashboard/control-panel builders while preserving the branch parameter for other UI affordances.
  - Add a `FACTORY_ARTIFACT_REF` environment override in `scripts/apply-pr-state.mjs`; when set, use that ref for artifact links while leaving metadata/control-panel behavior unchanged.

### Post-merge dashboard rewrite
- Extend the event router to handle `pull_request` events:
  - For `action === "closed"` with `pull_request.merged === true`, validate factory trust and emit a new `rewrite_artifact_links` action with the PR number, issue number, canonical artifacts path, head branch, and base branch ref.
  - Ignore non-merged closures and non-managed PRs.
- Update `scripts/route-pr-loop.mjs` to route `pull_request` events and surface the base ref via a new `artifact_ref` output.
- Expand `.github/workflows/factory-pr-loop.yml`:
  - Add the `pull_request` (closed) trigger.
  - Add a lightweight job that runs when `action == 'rewrite_artifact_links'`. It should execute `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the base branch so the PR body rewrites to `blob/<base>/<artifactsPath>/…`.

### Durability coverage
- Because other factory auth’d surfaces (e.g., failure comments) are emitted while the head branch is authoritative, we will not retroactively edit historical comments. We document this as an assumption and continue to rely on the dashboard rewrite for post-merge navigation.

## Assumptions
- Artifact directories remain identical on the base branch immediately after merge, so pointing at the base ref keeps the links valid.
- Post-merge branch deletion does not remove the `pull_request.head.ref` string from the API payload, so control-panel copy may still reference the historic branch name.
- Existing automation that reads `FACTORY_ARTIFACT_REF` is non-existent; introducing it behind a default preserves current flows.

## Risks & Mitigations
- **Race with branch deletion**: the closed event fires only after merge completes; by targeting the base ref we avoid relying on the head branch’s lifetime.
- **Untrusted events**: we continue to run trust validation before rewriting to avoid touching non-factory PRs.
- **Workflow drift**: adding a new trigger/job increases workflow complexity; unit tests for routing plus a focused workflow sanity check mitigate regressions.

## Test Strategy
- Extend `tests/pr-metadata.test.mjs` and `tests/github-messages.test.mjs` with cases covering `artifactRef` overrides (open vs merged dashboards).
- Add `tests/event-router.test.mjs` (and `tests/route-pr-loop.test.mjs`) coverage for the new `pull_request` closed/merged routing.
- Ensure snapshot-style assertions in `tests/control-panel.test.mjs` still hold when links are rendered from an alternate ref.
