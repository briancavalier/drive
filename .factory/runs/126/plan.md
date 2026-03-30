# Implementation Plan – Run 126

- Extend PR metadata and rendering to respect a durable artifact ref:
  - Update `scripts/lib/pr-metadata-shape.mjs` and `scripts/lib/pr-metadata.mjs` to add the `artifactRef` field, canonicalize it, and pass it through to `renderPrBody`.
  - Adjust `scripts/lib/github-messages.mjs` so `buildArtifactLinks` prefers `artifactRef` when present and continues to use the head branch otherwise. Verify the control panel still renders correctly.

- Teach `apply-pr-state.mjs` to set or clear the ref used for artifact links:
  - Introduce an `applyArtifactRef` helper keyed off a new `FACTORY_ARTIFACT_REF` env var with `__UNCHANGED__` support.
  - Call it before canonicalization and ensure serialized metadata retains the value for future runs.

- Route merged pull request events through the factory loop:
  - Update `scripts/route-pr-loop.mjs` to emit a `finalize_merge` action (or similar) for `pull_request` closed events on managed PRs, including the base branch in its outputs.
  - Extend `resolveConcurrencyKey`/`setOutputs` and `tests/route-pr-loop.test.mjs` to cover the new branch while guarding against non-managed PRs.

- Automate the post-merge rewrite in the workflow:
  - Add the `pull_request` closed trigger and a `finalize-merged-pr` job to `.github/workflows/factory-pr-loop.yml`, reusing the per-target concurrency lock and running `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the base branch.
  - Confirm permissions match other PR-updating jobs and note workflow-safety checklist compliance during implementation.

- Refresh automated tests for the new contract:
  - Update `tests/github-messages.test.mjs`, `tests/pr-metadata.test.mjs`, and `tests/apply-pr-state-metadata.test.mjs` for the `artifactRef` behavior.
  - Adjust any fixtures or assertions in `tests/control-panel.test.mjs`, `tests/event-router*.test.mjs`, or related helpers that deserialize PR metadata.
