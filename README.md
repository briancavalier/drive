# GitHub-Native Autonomous Factory Scaffold

This repository contains a reusable first-version scaffold for a GitHub-native
autonomous software factory built around GitHub Issues, Pull Requests, GitHub
Actions, and the Codex GitHub Action.

## What it includes

- A structured issue form for factory requests
- A `factory-intake` workflow that turns a labeled issue into a draft PR with
  planning artifacts
- A `factory-pr-loop` workflow that handles implementation, autonomous review,
  CI-driven repair, and repair after `changes_requested` reviews
- A reusable stage runner that invokes `openai/codex-action`
- A minimal `CI` workflow so the repair loop has a concrete workflow target
- Node-based helper scripts and tests with no runtime dependencies
- A pluggable autonomous review methodology with durable `review.md` and
  `review.json` artifacts

## Required repository setup

Configure these before using the scaffold in a live repository:

1. Add the `OPENAI_API_KEY` repository secret.
2. Allow GitHub Actions to push branches and create pull requests.
3. Add the optional `FACTORY_GITHUB_TOKEN` repository secret if you want the
   factory to modify files under `.github/workflows/**`.
   Create a fine-grained personal access token scoped only to this repository
   with `Contents: Read/Write`, `Pull requests: Read/Write`, `Issues: Read/Write`,
   `Workflows: Read/Write`, and `Metadata: Read`.
   Self-modifying factory issues generally need this secret.
4. Keep the workflow name `CI` or update the `workflow_run` trigger in
   `.github/workflows/factory-pr-loop.yml`.
5. Protect your default branch and require normal human review for merges.
6. Run the `Factory Bootstrap` workflow once to create the required labels.
7. Optional: set the `FACTORY_CODEX_MODEL` Actions variable if you want to
   override the default `gpt-5-codex` model used by the stage runner.
8. The stage runner executes Codex with `--full-auto` so planning, coding, and
   repair runs stay non-interactive inside GitHub Actions.
9. Optional: tune prompt budgets with the following Actions variables:
   `FACTORY_PLAN_PROMPT_MAX_CHARS`, `FACTORY_IMPLEMENT_PROMPT_MAX_CHARS`,
   `FACTORY_REPAIR_PROMPT_MAX_CHARS`, `FACTORY_REVIEW_PROMPT_MAX_CHARS`,
   and `FACTORY_PROMPT_HARD_MAX_CHARS`.
10. Optional: set `FACTORY_REVIEW_METHOD` to select an autonomous review
    methodology under `.factory/review-methods/<method>/instructions.md`.
    Missing or invalid values fall back to the built-in `default` rubric.

## Factory operator flow

1. Open a "Factory Request" issue.
2. Apply the `factory:start` label.
3. Review the generated draft PR and its planning artifacts.
4. Apply the `factory:implement` label to start coding.
5. Review the ready-for-review PR and merge manually when satisfied.

## Autonomous review stage

After CI succeeds on a factory-managed pull request, the loop enters a dedicated
`review` stage. The stage loads the methodology specified by the
`FACTORY_REVIEW_METHOD` Actions variable (falling back to `default`) and
instructs the agent to produce two durable artifacts inside the run directory:

- `review.md` — human-readable summary with decisions and findings.
- `review.json` — machine-readable decision payload with severity-classified findings.

If the autonomous review issues a `pass` decision, the workflow promotes the PR
to `ready_for_review`, clears `factory:blocked`, marks the PR ready, and posts a
summary comment referencing the artifacts. When the decision is
`request_changes`, the workflow submits a GitHub `REQUEST_CHANGES` review using
the generated markdown so the existing repair loop can act on the feedback automatically.

If a factory run changes `.github/workflows/**` without `FACTORY_GITHUB_TOKEN`,
the stage will stop before `git push` with a setup error that tells you to add
the secret. Non-workflow changes continue to use the default `github.token`.

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

## Local validation

Run the local test suite:

```bash
npm test
```
