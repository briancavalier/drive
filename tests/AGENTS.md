## Scope

This directory verifies factory control-plane behavior. Tests and fixtures here are part of the contract for autonomous self-work.

## Working Rules

- When factory behavior changes, update or add tests in the same change.
- Keep fixtures realistic and aligned with current workflow, prompt, and metadata contracts.
- Prefer focused tests around the changed contract instead of broad incidental rewrites.

## Change Mapping

- Routing changes belong in `tests/event-router.test.mjs`.
- Prompt assembly or budget changes belong in `tests/build-stage-prompt.test.mjs` and `tests/fixtures/prompt/*`.
- GitHub message renderer or template-contract changes belong in `tests/github-messages.test.mjs`.
- PR metadata or state rendering changes belong in `tests/pr-metadata.test.mjs`.
- Artifact guard changes belong in `tests/factory-artifact-guard.test.mjs`.
- Issue form changes belong in `tests/issue-form.test.mjs` and related fixtures.

## Validation

- If a shared-library change in `scripts/lib/` is not reflected here, assume coverage is incomplete and add the missing test updates.
