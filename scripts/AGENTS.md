## Scope

This directory contains top-level factory entrypoints used by GitHub Actions.

## Design Rules

- Keep entrypoint scripts thin. They should read env or event inputs, call shared helpers, and emit outputs or side effects with minimal inline logic.
- Move reusable parsing, routing, metadata, and policy logic into `scripts/lib/` instead of growing entrypoints.
- Preserve GitHub Actions contracts: env var names, `GITHUB_OUTPUT` behavior, exit semantics, and user-facing log messages.
- Treat `factory:self-modify` as a high-trust authorization control. Automation may apply it only as the direct result of a trusted answered factory approval intervention for a single resumed stage, with explicit cleanup after that stage finishes. Do not add implicit, default, preserve-by-default, or bulk application paths for `factory:self-modify`.

## Ownership

- `prepare-intake.mjs`, `finalize-plan.mjs`, and `apply-pr-state.mjs` orchestrate factory lifecycle transitions.
- `route-pr-loop.mjs`, `build-stage-prompt.mjs`, and `check-factory-run-artifacts.mjs` handle routing, prompt construction, and artifact policy enforcement.
- `ensure-labels.mjs` is a thin wrapper around label configuration.

## Validation

- When an entrypoint contract changes, update the corresponding helpers and tests in the same change.
- Avoid adding one-off behavior here when the same rule should be shared across multiple scripts.
