1. **Open PR dashboard keeps head-branch links**
   - Given a factory-managed PR is still open on branch `factory/126-example`
   - When `scripts/apply-pr-state.mjs` runs without `FACTORY_ARTIFACT_REF`
   - Then the rendered PR body (and control panel) link to `https://github.com/<repo>/blob/factory/126-example/.factory/runs/126/...`.

2. **Merged PR dashboard rewrites to base branch**
   - Given the same PR merges into `main` and triggers the `pull_request` closed event
   - When the new workflow job runs with `action == rewrite_artifact_links`
   - Then the PR body is updated so each artifact link uses `blob/main/.factory/runs/126/...`, and the links resolve successfully on GitHub.

3. **Non-merged closures do not rewrite**
   - Given a managed PR is closed without merge (e.g., manually closed)
   - When the `pull_request` event fires
   - Then the router returns `noop`, no rewrite job runs, and the PR body remains unchanged.
