decision: request_changes

📝 Summary
- Methodology: `default`
- Implemented changes match the spec: introduced an `artifactRef` override, threaded it through `renderPrBody` and message builders, added `routePullRequest` to emit `rewrite_artifact_links` on merged PRs, updated `route-pr-loop` outputs, and added a workflow `rewrite-artifact-links` job that calls `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` set to the PR base ref.
- Unit tests were added/updated to cover the new behavior and CI unit tests passed (see `CI Evidence`).

🚨 blocking findings
- Missing run artifacts required to validate the "links resolve successfully on GitHub" acceptance criterion: the run directory `.factory/runs/126/` does not include `repair-log.md`, `review.md`, or `review.json`. Because the acceptance criteria explicitly require that links for the repair log, review summary, and review JSON resolve after the rewrite, I cannot verify that requirement for this run. Action required: add the missing artifacts to `.factory/runs/126/` (or clarify the acceptance criterion to only require that the PR body is rewritten to point at the base branch, independent of artifact existence).

⚠️ non-blocking notes
- The implementation carefully preserves the pre-merge experience by defaulting `artifactRef` to the head branch, and unit tests exercise the override and routing logic.
- Consider adding an integration / smoke test that simulates the workflow job invocation (i.e., run `scripts/apply-pr-state.mjs` with `FACTORY_ARTIFACT_REF` in a CI-like environment) to validate the end-to-end rewrite in a repository fixture.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (❌ 1, ✅ 3)</summary>

- ✅ **Satisfied**: Open PR dashboard keeps head-branch links
  - **Evidence:** tests/pr-metadata.test.mjs: 'renderPrBody embeds parseable metadata' asserts artifact links point to blob/factory/...
  - **Evidence:** CI workflow run 23521213841: unit tests success (unit: success)
- ✅ **Satisfied**: Merged PR dashboard rewrites to base branch
  - **Evidence:** tests/event-router.test.mjs: 'routePullRequest emits rewrite action for merged managed PRs' asserts action 'rewrite_artifact_links' and artifactRef set to base ref
  - **Evidence:** tests/pr-metadata.test.mjs: 'renderPrBody uses artifactRef override when provided' asserts links use the provided ref
- ✅ **Satisfied**: Non-merged closures do not rewrite
  - **Evidence:** tests/event-router.test.mjs: 'routePullRequest ignores non-merged closures' returns action 'noop'
  - **Evidence:** tests/event-router.test.mjs: route-based unit tests covering closure handling
- ❌ **Not satisfied**: Links for repair log, review summary, and review JSON resolve successfully on GitHub after merge
  - **Evidence:** .factory/runs/126/ listing: only acceptance-tests.md, approved-issue.md, cost-summary.json, plan.md, spec.md are present; repair-log.md, review.md, and review.json are missing
  - **Evidence:** No unit tests in this run assert presence of review artifacts post-merge (tests validate rewrite but not the existence of files on disk)

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 3)</summary>

- ✅ **Satisfied**: Add artifact-ref override support in scripts/apply-pr-state.mjs
  - **Evidence:** scripts/apply-pr-state.mjs: reads FACTORY_ARTIFACT_REF from env and passes an 'artifactRef' field to renderPrBody
  - **Evidence:** tests/pr-metadata.test.mjs: unit test uses 'artifactRef' override when rendering PR body
- ✅ **Satisfied**: Extend routing to detect merged PRs and emit rewrite action
  - **Evidence:** scripts/lib/event-router.mjs: added 'routePullRequest' that returns action 'rewrite_artifact_links' with artifactRef set to pull_request.base.ref
  - **Evidence:** tests/event-router.test.mjs: unit tests for merged and non-merged closures
- ✅ **Satisfied**: Update workflow to trigger on pull_request closed and run rewrite job
  - **Evidence:** .github/workflows/factory-pr-loop.yml: new 'pull_request: types: [closed]' trigger and 'rewrite-artifact-links' job added
  - **Evidence:** CI evidence: actionlint success

</details>
