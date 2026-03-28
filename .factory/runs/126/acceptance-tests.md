# Acceptance Tests – Run 126

- **Open PR retains head-branch dashboard links**  
  With a factory-managed PR still open, inspect the Factory Dashboard section of the PR body.  
  Confirm each artifact link targets `blob/<head-branch>/.factory/runs/<issue>/…`, matching the current branch behavior.

- **Merged PR rewrites artifact links to the base branch**  
  Merge the same PR (with GitHub configured to delete the head branch).  
  After the workflow completes, reload the PR conversation and verify every artifact link (`approved-issue.md`, `spec.md`, `plan.md`, `acceptance-tests.md`, `repair-log.md`, `cost-summary.json`, `review.md`, `review.json`) now points to `blob/<base-branch>/...` and loads successfully.

- **Durable artifact ref persists across subsequent metadata updates**  
  Trigger any follow-up automation that rerenders the PR body (e.g., re-running `scripts/apply-pr-state.mjs` or another factory action).  
  Confirm the serialized metadata continues to include the base-branch `artifactRef` and the rendered links remain on the base branch.

- **Factory PR Loop finalizes merged PRs automatically**  
  Observe the `Factory PR Loop` workflow run initiated by the merge.  
  Ensure the new `finalize-merged-pr` job executes `apply-pr-state.mjs`, succeeds, and logs setting `FACTORY_ARTIFACT_REF` to the base branch.
