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
