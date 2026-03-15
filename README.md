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

## Required repository setup

Configure these before using the scaffold in a live repository:

1. Add the `OPENAI_API_KEY` repository secret.
2. Allow GitHub Actions to push branches and create pull requests, or replace
   `github.token` usage with a GitHub App token.
3. Keep the workflow name `CI` or update the `workflow_run` trigger in
   `.github/workflows/factory-pr-loop.yml`.
4. Protect your default branch and require normal human review for merges.
5. Run the `Factory Bootstrap` workflow once to create the required labels.
6. Optional: set the `FACTORY_CODEX_MODEL` Actions variable if you want to
   override the default `gpt-5-codex` model used by the stage runner.
7. The stage runner executes Codex with `--full-auto` so planning, coding, and
   repair runs stay non-interactive inside GitHub Actions.
8. Optional: tune prompt budgets with the following Actions variables:
   `FACTORY_PLAN_PROMPT_MAX_CHARS`, `FACTORY_IMPLEMENT_PROMPT_MAX_CHARS`,
   `FACTORY_REPAIR_PROMPT_MAX_CHARS`, and `FACTORY_PROMPT_HARD_MAX_CHARS`.

## Factory operator flow

1. Open a "Factory Request" issue.
2. Apply the `factory:start` label.
3. Review the generated draft PR and its planning artifacts.
4. Apply the `factory:implement` label to start coding.
5. Review the ready-for-review PR and merge manually when satisfied.

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
