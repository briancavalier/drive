## Scope

This directory contains top-level factory entrypoints used by GitHub Actions.

## Design Rules

- Keep entrypoint scripts thin. They should read env or event inputs, call shared helpers, and emit outputs or side effects with minimal inline logic.
- Move reusable parsing, routing, metadata, and policy logic into `scripts/lib/` instead of growing entrypoints.
- Preserve GitHub Actions contracts: env var names, `GITHUB_OUTPUT` behavior, exit semantics, and user-facing log messages.
- Do not add or automate application of the `factory:self-modify` label. That label must remain a human-applied control for explicit self-modifying runs. If a change would cause workflows, scripts, or agents to add, infer, preserve-by-default, or bulk-apply `factory:self-modify`, stop and require explicit human direction instead.

## Ownership

- `prepare-intake.mjs`, `finalize-plan.mjs`, and `apply-pr-state.mjs` orchestrate factory lifecycle transitions.
- `route-pr-loop.mjs`, `build-stage-prompt.mjs`, and `check-factory-run-artifacts.mjs` handle routing, prompt construction, and artifact policy enforcement.
- `ensure-labels.mjs` is a thin wrapper around label configuration.

## Validation

- When an entrypoint contract changes, update the corresponding helpers and tests in the same change.
- Avoid adding one-off behavior here when the same rule should be shared across multiple scripts.
