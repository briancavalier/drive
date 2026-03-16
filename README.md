# GitHub-Native Autonomous Factory Scaffold

This repository contains a reusable first-version scaffold for a GitHub-native
autonomous software factory built around GitHub Issues, Pull Requests, GitHub
Actions, and the Codex GitHub Action.

## What it includes

- A structured issue form for factory requests
- A `factory-intake` workflow that turns a labeled issue into a draft PR with
  planning artifacts
- A `factory-pr-loop` workflow that handles implementation, CI-driven repair,
  and repair after `changes_requested` reviews
- A reusable stage runner that invokes `openai/codex-action`
- A minimal `CI` workflow so the repair loop has a concrete workflow target
- Node-based helper scripts and tests with no runtime dependencies
- Repo-local GitHub message template overrides under `.factory/messages/`

## Required repository setup

Configure these before using the scaffold in a live repository:

1. Add the `OPENAI_API_KEY` repository secret.
2. Allow GitHub Actions to push branches and create pull requests, or replace
   `github.token` usage with a GitHub App token.
3. Keep the workflow name `CI` or update the `workflow_run` trigger in
   `.github/workflows/factory-pr-loop.yml`.
4. Protect your default branch and require normal human review for merges.
5. Run the `Factory Bootstrap` workflow once to create the required labels.

## Factory operator flow

1. Open a "Factory Request" issue.
2. Apply the `factory:start` label.
3. Review the generated draft PR and its planning artifacts.
4. Apply the `factory:implement` label to start coding.
5. Review the ready-for-review PR and merge manually when satisfied.

If a factory-managed PR gets stuck in the wrong state, run `Factory Reset PR`
from the Actions tab to restore it to `plan_ready`, clear stale repair
counters, and convert it back to draft before retrying `factory:implement`.

## Labels

The workflows create and manage these labels automatically:

- `factory:start`
- `factory:managed`
- `factory:plan-ready`
- `factory:implement`
- `factory:blocked`
- `factory:paused`

## GitHub message templates

Factory-posted GitHub messages use built-in markdown templates and can be
overridden repo-locally by adding files under `.factory/messages/`.

Supported override files:

- `pr-body.md`
- `plan-ready-issue-comment.md`
- `intake-rejected-comment.md`
- `review-pass-comment.md`
- `review-request-changes.md`

The renderer supports simple `{{TOKEN}}` replacement only. Unknown tokens or
missing required tokens cause the override to be ignored with a warning, and
the factory falls back to the built-in template for that message.

Common tokens include:

- identifiers such as `ISSUE_NUMBER`, `PR_NUMBER`, `BRANCH`, and `ARTIFACTS_PATH`
- status values such as `STATUS`, `CI_STATUS`, `REPAIR_ATTEMPTS`, and
  `MAX_REPAIR_ATTEMPTS`
- review values such as `REVIEW_METHOD`, `REVIEW_SUMMARY`, and
  `BLOCKING_FINDINGS_COUNT`

Composite tokens include:

- `STATUS_SECTION`
- `ARTIFACTS_SECTION`
- `OPERATOR_NOTES_SECTION`
- `REVIEW_MARKDOWN`

Required-token policy:

- `pr-body.md` must include `{{STATUS_SECTION}}` and `{{ARTIFACTS_SECTION}}`
- `review-request-changes.md` must include `{{REVIEW_MARKDOWN}}`
- the other message templates do not require specific tokens

Protocol-critical behavior stays in code:

- the hidden `factory-state` metadata comment is always appended to PR bodies by
  the renderer
- request-changes truncation behavior remains code-owned
- artifact link generation remains code-owned

Example `pr-body.md` override:

```md
# Custom Factory Run

Issue: #{{ISSUE_NUMBER}}

{{ARTIFACTS_SECTION}}

{{STATUS_SECTION}}

{{OPERATOR_NOTES_SECTION}}
```

## Local validation

Run the local test suite:

```bash
npm test
```
