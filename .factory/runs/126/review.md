decision: request_changes

📝 Summary
- Implemented durable `artifactRef` metadata, rendering and apply-time support so artifact links can be rewritten to a stable ref after merge.
- `route-pr-loop` emits `finalize_merge` for merged PRs and the workflow now runs `apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the PR base branch.
- Unit tests were added/updated to cover `artifactRef` behavior, router finalization, and the `apply-pr-state` helper; CI unit and actionlint checks passed.

🚨 blocking findings
- Missing run artifacts required by the acceptance tests: `.factory/runs/126/repair-log.md` is not present. The acceptance criteria require that post-merge dashboard links (including `repair-log.md`) "load successfully". Without the artifact file the link cannot resolve and the acceptance test cannot be verified for this run.
  - Recommendation: Add the missing artifact at `.factory/runs/126/repair-log.md` (it may be an empty stub if no content is needed) or update the acceptance tests/spec to reflect which artifacts must exist for this run.

- Workflow-safety checklist / review artifact not present: the change touches `.github/workflows/factory-pr-loop.yml` and automation control-plane logic, so the repository's Factory Review Policy requires completing the `workflow-safety` checklist at `.factory/review-methods/workflow-safety/factory-review-checklist.md` and publishing the completed review JSON (`.factory/runs/<issue>/review.json`) before concluding there are no findings. I do not see `.factory/runs/126/review.json` or `review.md` for this run, so the required checklist completion evidence is missing.
  - Recommendation: Submit a `workflow-safety` review (pass or request_changes) recorded into `.factory/runs/126/review.json` that includes the completed `factory-review-checklist.md` booleans, and/or attach a `review.md` entry that references the checklist. Only after the checklist is present can reviewers close without findings on workflow changes.

⚠️ non-blocking notes
- Positive: Unit tests cover the new `artifactRef` rendering, normalization, and `applyArtifactRef` semantics; the router includes a targeted `finalize_merge` action and the workflow step wires `FACTORY_ARTIFACT_REF` into `apply-pr-state.mjs` as specified.
- Suggestion: Add an integration-style test that simulates the end-to-end path (route -> workflow job env outputs -> apply-pr-state -> updatePullRequest) to exercise the actual `updatePullRequest` call path, or provide a smoke script demonstrating end-to-end behavior in a staging repo.
- Suggestion: Document the requirement for the `FACTORY_GITHUB_TOKEN` secret (used by the finalize job) and confirm least-privilege placement in repository/secrets documentation.

<details>
<summary>🧭 Traceability</summary>

#### Acceptance Criteria (⚠️ 1, ✅ 3)

- ✅ **Satisfied**: Open PR retains head-branch dashboard links
  - **Evidence:** tests/github-messages.test.mjs: renderPrBody renders plan_ready dashboard layout asserting head-branch blob links
  - **Evidence:** scripts/lib/github-messages.mjs: buildArtifactLinks falls back to provided branch when artifactRef is null
- ⚠️ **Partially satisfied**: Merged PR rewrites artifact links to the base branch
  - **Evidence:** scripts/route-pr-loop.mjs: routeEvent emits action 'finalize_merge' with finalArtifactRef=baseBranch
  - **Evidence:** .github/workflows/factory-pr-loop.yml: finalize job sets FACTORY_ARTIFACT_REF=$final_artifact_ref and runs scripts/apply-pr-state.mjs
  - **Evidence:** tests/route-pr-loop.test.mjs: unit test 'routeEvent emits finalize_merge for merged pull request events'
  - **Evidence:** tests/apply-pr-state-metadata.test.mjs: applyArtifactRef tests show apply-pr-state supports __UNCHANGED__/__CLEAR__ and trims values
  - **Evidence:** MISSING_ARTIFACT: .factory/runs/126/repair-log.md is not present, so link resolution for this run cannot be verified
- ✅ **Satisfied**: Durable artifact ref persists across subsequent metadata updates
  - **Evidence:** scripts/lib/pr-metadata-shape.mjs: defaultPrMetadata includes artifactRef and normalizeArtifactRef
  - **Evidence:** tests/pr-metadata.test.mjs: canonicalizePrMetadata normalizes artifactRef and renderPrBody preserves artifactRef in serialized metadata
- ✅ **Satisfied**: Factory PR Loop finalizes merged PRs automatically
  - **Evidence:** tests/route-pr-loop.test.mjs: finalize_merge routed for merged PRs with factory metadata
  - **Evidence:** .github/workflows/factory-pr-loop.yml: workflow is triggered on pull_request: closed and runs the finalize job wiring the artifact ref

#### Spec Commitments (✅ 1)

- ✅ **Satisfied**: Extend PR metadata shape with artifactRef and canonicalize it
  - **Evidence:** scripts/lib/pr-metadata-shape.mjs: adds artifactRef to defaultPrMetadata and canonicalizePrMetadataShape
  - **Evidence:** scripts/lib/pr-metadata.mjs: renderPrBody wires artifactRef into rendered metadata

#### Plan Deliverables (✅ 2)

- ✅ **Satisfied**: apply-pr-state supports FACTORY_ARTIFACT_REF and applyArtifactRef helper
  - **Evidence:** scripts/apply-pr-state.mjs: applyArtifactRef implementation and main() uses FACTORY_ARTIFACT_REF to update metadata
  - **Evidence:** tests/apply-pr-state-metadata.test.mjs: applyArtifactRef unit tests (respect __UNCHANGED__, __CLEAR__, trimming)
- ✅ **Satisfied**: Update rendering to prefer artifactRef when present
  - **Evidence:** scripts/lib/github-messages.mjs: buildArtifactLinks accepts artifactRef and prefers it over branch
  - **Evidence:** tests/github-messages.test.mjs: 'renderPrBody uses artifactRef override for dashboard links' asserts links use 'main' when artifactRef provided

</details>
