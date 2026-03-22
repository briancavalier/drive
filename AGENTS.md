## Git / Worktree Policy

For every new user request that could result in code changes, always start in a fresh dedicated git worktree, even if the current branch is clean.

Treat each chat thread as a separate task unless the user explicitly says it continues prior work.

Required behavior:
- Never reuse the currently checked out branch for new work unless the user explicitly says to continue that exact task.
- Create a new branch with the `codex/` prefix for the task.
- Create new worktrees from `origin/main` unless the user explicitly asks to base the work on another branch.
- Create a new sibling worktree for that branch before making changes.
- Do all file edits, tests, and commits in that new worktree.
- If a suitable dedicated worktree already exists for the same task, reuse it. Otherwise create a new one.
- If worktree creation would fail or is unsafe, stop and ask instead of proceeding in the current worktree.

## Factory Review Policy

When reviewing pull requests that touch factory workflow or state-machine behavior, agents must use the workflow-safety review method at `.factory/review-methods/workflow-safety/instructions.md` and complete the factory review checklist at `.factory/review-methods/workflow-safety/factory-review-checklist.md` before concluding that there are no findings.

This requirement applies when the review touches any of:
- `.github/workflows/`
- `.factory/review-methods/`
- `scripts/apply-pr-state.mjs`
- routing, control-panel, intervention, or review-method logic under `scripts/`
- PR metadata, label, or workflow-contract tests under `tests/`

During those reviews:
- Trace the changed state surface, all relevant writers/readers, workflow transitions, cleanup paths, and test coverage using the checklist.
- Do not post a `pass` or “no findings” conclusion until the checklist is complete.
- When posting PR feedback with `gh`, use a file-backed body such as `gh pr comment --body-file <path>` instead of inline shell-quoted Markdown containing backticks or code fences.
