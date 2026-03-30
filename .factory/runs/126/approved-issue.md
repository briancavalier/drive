### Problem statement

The PR factory dashboard currently links run artifacts through the factory branch, for example `blob/<branch>/.factory/runs/<issue>/...`. When a pull request is merged in repositories with GitHub's automatic head-branch deletion enabled, the factory branch is removed and those dashboard links break. Operators lose direct access to the durable planning, repair, and review artifacts after merge even though the artifacts were merged to the base branch.

### Goals

- Keep factory dashboard artifact links valid after a pull request is merged and the head branch is deleted.
- Rewrite dashboard artifact links to the base branch after merge so merged artifacts remain reachable.
- Preserve the current pre-merge experience while the PR is still open.
- Apply the same durability fix anywhere factory-authored artifact links are expected to remain useful after merge.

### Non-goals

- Moving artifacts to a separate storage system, release assets, or a dedicated artifacts branch.
- Redesigning the factory dashboard layout or control panel beyond link-target updates.
- Replacing durable repository artifacts with GitHub Actions uploaded artifacts.
- Solving broader artifact retention or archival policy beyond post-merge link validity.

### Constraints

- Use the existing durable artifact contract under `.factory/runs/<issue>`.
- Respect repositories where GitHub automatically deletes the merged PR branch.
- Continue to support the current factory PR flow and metadata model without breaking open-PR behavior.
- The implementation should work regardless of merge strategy as long as the durable artifacts are present on the base branch after merge.
- Keep issue-template compatibility and add or update tests for renderer and post-merge behavior.

### Acceptance criteria

- When a factory-managed pull request is merged, the PR body is updated so dashboard artifact links point to the base branch instead of the deleted head branch.
- After merge, links for approved issue, spec, plan, acceptance tests, repair log, cost summary, review summary, and review JSON resolve successfully from the merged PR conversation.
- Before merge, artifact links still point to the active factory branch and continue to work during normal execution.
- Automated test coverage verifies the rendered artifact URLs for both open and merged PR states.
- Any workflow or event-router changes needed to perform the post-merge rewrite are covered by tests.

### Risk

- Post-merge PR-body mutation could race with other PR state updates or miss edge cases if the closed/merged event is not handled carefully.
- Rewriting links to the wrong ref could hide artifacts or create misleading dashboard output.
- Changes in shared PR metadata or message rendering could regress control-panel behavior for active factory PRs.
- Merge-strategy differences may expose assumptions about when durable artifacts are available on the base branch.

### Affected area

CI / Automation
