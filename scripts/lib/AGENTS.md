## Scope

This directory contains the shared contracts for factory behavior. Changes here usually affect multiple entrypoints and tests.

## Shared Invariants

- Factory branches use the `factory/<issueNumber>-<slug>` naming convention.
- Factory label names are defined centrally and must stay aligned with workflows and state transitions.
- PR metadata is stored inside the `factory-state` HTML comment marker as embedded JSON.
- Factory artifact paths use `.factory/runs/<issueNumber>`.
- Supported prompt modes live in `scripts/lib/factory-config.mjs` and are consumed by `scripts/build-stage-prompt.mjs`.
- Valid PR statuses and transition allowlists live in `scripts/lib/factory-config.mjs` and are consumed by routing/state code such as `event-router.mjs`, `pr-metadata.mjs`, and `apply-pr-state.mjs`.
- Repair-attempt tracking and repeated-failure accounting must remain consistent across routing and PR metadata updates.

## Design Rules

- Treat these modules as shared contracts, not isolated helpers.
- Prefer pure, testable functions for parsing, routing, metadata rendering, prompt construction, and policy checks.
- Preserve existing wire formats unless the task explicitly requires a contract change.
- If you change a shared contract, update every dependent caller, workflow assumption, fixture, and test in the same change.

## Validation

- Review downstream entrypoints in `scripts/` and targeted coverage in `tests/` before finalizing shared-library changes.
- Be especially careful with metadata shape, branch naming, and routing logic because small changes can break the control plane.
