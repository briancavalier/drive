decision: pass
methodology: workflow-safety

📝 Summary
- Verified `.github/workflows/factory-pr-loop.yml` finalizes merged PRs by running the new `finalize-merged-pr` job with `contents`/`pull-requests` write scope and wiring `FACTORY_ARTIFACT_REF` into `scripts/apply-pr-state.mjs` so merged dashboards rewrite to the base branch.
- Reviewed `scripts/route-pr-loop.mjs`, `scripts/lib/pr-metadata.mjs`, and `scripts/lib/github-messages.mjs` to confirm the new `artifactRef` metadata is populated, canonicalized, and used for dashboard links without altering pre-merge behavior.
- Confirmed unit coverage in `tests/route-pr-loop.test.mjs`, `tests/apply-pr-state-metadata.test.mjs`, `tests/github-messages.test.mjs`, and `tests/pr-metadata.test.mjs` exercises the finalize path, metadata normalization, and link rendering.

✅ Workflow-Safety Checklist
- State changed: Added durable `artifactRef` metadata and finalize-merge workflow job.
- Writers reviewed: `scripts/apply-pr-state.mjs` applies `FACTORY_ARTIFACT_REF`; workflow job exports it; router emits `finalize_merge` with base branch.
- Readers reviewed: Dashboard link builder and PR metadata canonicalizer consume the new field; acceptance artifacts reference remains unchanged elsewhere.
- Workflow paths checked: pull_request closed → route → finalize job; ensured no recursion or unintended triggers.
- Cleanup paths checked: `applyArtifactRef` allows `__CLEAR__`/`__UNCHANGED__`; no leftover pending review state; concurrency keys unchanged.
- Tests/evidence checked: Updated unit tests cover routing, metadata normalization, and link rendering; CI retains actionlint and unit coverage.
- Residual risks: No additional workflow risks identified beyond existing token usage.

Findings: None.
