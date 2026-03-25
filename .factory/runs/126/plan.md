1. Update artifact link rendering helpers
   - Change `buildArtifactLinks` in `scripts/lib/pr-metadata.mjs` and `scripts/lib/github-messages.mjs` (plus any shared helpers such as `scripts/lib/failure-comment.mjs`) to accept an `artifactRef` that defaults to the current branch.
   - Thread the new ref through `renderPrBody`, control-panel builders, and other consumers so we can choose the blob/tree ref independently of the live branch.
2. Add artifact-ref override support to `scripts/apply-pr-state.mjs`
   - Read a `FACTORY_ARTIFACT_REF` environment variable.
   - Use the override when calling `renderPrBody` (falling back to `pullRequest.head.ref`).
   - Keep existing metadata updates untouched.
3. Extend routing to detect merged PRs
   - Add a `routePullRequest` handler in `scripts/lib/event-router.mjs` that emits a `rewrite_artifact_links` action when a managed PR closes via merge and includes the base ref in the result.
   - Update `scripts/route-pr-loop.mjs` to call the new router for `pull_request` events and expose the base ref via `artifact_ref` output.
4. Update workflow automation
   - Add the `pull_request` closed trigger to `.github/workflows/factory-pr-loop.yml`.
   - Introduce a job that runs when `action == 'rewrite_artifact_links'`, invoking `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the base branch.
5. Refresh automated tests
   - Add unit tests covering artifact ref overrides (`tests/pr-metadata.test.mjs`, `tests/github-messages.test.mjs`, `tests/control-panel.test.mjs` as needed).
   - Add routing tests for the new pull-request path (`tests/event-router.test.mjs`, `tests/route-pr-loop.test.mjs`).
6. Manual/CI verification
   - Validate the updated GitHub Actions workflow syntax locally (e.g., `act`/`yamllint` optional).
   - Spot-check that the dashboard render still embeds parseable metadata after the ref override.
