## Scope

This directory is the factory control plane: GitHub workflows and the structured issue template live here.

## Workflow Rules

- Keep workflow names and trigger wiring aligned with script expectations, especially the `CI` workflow name used by PR-loop routing.
- Preserve reusable workflow inputs and env var names consumed by the scripts in `scripts/`.
- Keep label names and status transitions aligned with `scripts/lib/factory-config.mjs`, `scripts/lib/event-router.mjs`, and `scripts/apply-pr-state.mjs`.
- Do not rename stages, workflow inputs, or outputs without updating all dependent scripts and tests.

## Issue Template Rules

- Keep issue-template field ids and overall structure compatible with the issue-form parser and tests.
- When changing `.github/ISSUE_TEMPLATE/factory-request.yml`, update parsing and fixture coverage in `scripts/lib/issue-form.mjs` and `tests/issue-form.test.mjs` as needed.

## Validation

- For workflow changes, verify the control-plane contract still matches the scripts that read event payloads, env vars, and outputs.
- For issue-template changes, verify parsing and tests still reflect the live template shape.
