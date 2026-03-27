decision: pass

📝 Summary
- The change implements a durable `artifactRef` and a post-merge finalize path that rewrites PR dashboard artifact links to the base branch after merge while preserving pre-merge behavior.
- Verified router emits `finalize_merge` for merged PRs (`scripts/route-pr-loop.mjs`) and the workflow runs a `finalize-merged-pr` job which calls `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the base branch (`.github/workflows/factory-pr-loop.yml`).
- Confirmed `apply-pr-state.mjs` accepts `FACTORY_ARTIFACT_REF` and updates serialized metadata; rendering functions in `scripts/lib/pr-metadata.mjs` and `scripts/lib/github-messages.mjs` prefer `artifactRef` when provided so rendered dashboard links resolve to the durable ref.
- Unit tests exercising routing, metadata handling, rendering, and apply-pr-state behavior were added/updated and passed in CI. CI evidence: workflow run id `23666925807` (actionlint: success, unit: success, factory-artifact-guard: success).

🚨 blocking findings
- None.

⚠️ non-blocking notes
- Consider adding an integration-level test that simulates the full merged PR event through a minimal workflow runner to confirm end-to-end link rewrites in a live-like environment (test coverage is strong at unit level but this path is cross-cutting).
- The implementation assumes the base branch contains the merged artifacts after merge (spec assumption). If repos use non-standard merge workflows that delay artifact presence, consider a retry/backoff or an existence check before rewriting links.

<details>
<summary>🧭 Traceability</summary>

#### Acceptance Criteria (✅ 4)

- ✅ **Satisfied**: When a factory-managed pull request is merged, the PR body is updated so dashboard artifact links point to the base branch instead of the deleted head branch.
  - **Evidence:** Router emits finalize_merge with final_artifact_ref == base branch (scripts/route-pr-loop.mjs: lines ~60-80).
  - **Evidence:** Workflow runs finalize job that invokes apply-pr-state with FACTORY_ARTIFACT_REF set ( .github/workflows/factory-pr-loop.yml: finalize-merged-pr job ).
  - **Evidence:** apply-pr-state applies FACTORY_ARTIFACT_REF and updates serialized metadata (scripts/apply-pr-state.mjs: applyArtifactRef and usage at line ~482).
- ✅ **Satisfied**: After merge, links for approved issue, spec, plan, acceptance tests, repair log, cost summary, review summary, and review JSON resolve successfully from the merged PR conversation.
  - **Evidence:** Rendering code builds artifact URLs from artifactRef when present (scripts/lib/github-messages.mjs: buildArtifactLinks and renderPrBody).
  - **Evidence:** Unit tests assert renderPrBody uses artifactRef override for dashboard links (tests/github-messages.test.mjs: test 'renderPrBody uses artifactRef override for dashboard links').
  - **Evidence:** CI run 23666925807: unit tests passed (unit: success).
- ✅ **Satisfied**: Before merge, artifact links still point to the active factory branch and continue to work during normal execution.
  - **Evidence:** Default rendering falls back to head branch when artifactRef is null/absent (scripts/lib/pr-metadata.mjs and scripts/lib/github-messages.mjs buildArtifactLinks fallback).
  - **Evidence:** Unit tests validate default behavior includes head branch in URLs (tests/github-messages.test.mjs: test 'renderPrBody renders plan_ready dashboard layout').
- ✅ **Satisfied**: Automated test coverage verifies the rendered artifact URLs for both open and merged PR states.
  - **Evidence:** Tests added/updated: tests/pr-metadata.test.mjs, tests/github-messages.test.mjs, tests/apply-pr-state-metadata.test.mjs, tests/route-pr-loop.test.mjs include artifactRef and finalize_merge coverage.
  - **Evidence:** CI run 23666925807: unit tests passed (unit: success).

#### Spec Commitments (✅ 1)

- ✅ **Satisfied**: Route merged pull request events through the factory loop and emit finalize_merge including base branch and final_artifact_ref.
  - **Evidence:** routeEvent checks pull_request.closed & merged and returns action 'finalize_merge' with baseBranch/finalArtifactRef (scripts/route-pr-loop.mjs: routeEvent).
  - **Evidence:** setOutputs includes final_artifact_ref and base_branch for downstream jobs (scripts/route-pr-loop.mjs: setOutputs usage in main).

#### Plan Deliverables (✅ 1)

- ✅ **Satisfied**: Add a finalize-merged-pr job to the factory workflow that calls apply-pr-state.mjs with FACTORY_ARTIFACT_REF set to the base branch.
  - **Evidence:** Workflow contains finalize-merged-pr job gated on needs.reroute.outputs.action == 'finalize_merge' and invokes apply-pr-state.mjs with FACTORY_ARTIFACT_REF ( .github/workflows/factory-pr-loop.yml ).
  - **Evidence:** Finalize job has required write permissions for contents and pull-requests ( .github/workflows/factory-pr-loop.yml: finalize-merged-pr permissions ).

</details>
