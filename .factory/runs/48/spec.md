# Review & Diagnosis Model Default Update Specification

## Summary
- Replace the hard-coded `codex-mini-latest` fallback with `gpt-5-mini` for autonomous review and failure-diagnosis execution paths so the factory never selects an invalid model by default.
- Align documentation, helper libraries, and cost metadata with the new lightweight default while preserving all existing override knobs (`FACTORY_REVIEW_MODEL`, `FACTORY_FAILURE_DIAGNOSIS_MODEL`, and shared codex variables).
- Update automated tests and contract checks to assert the corrected fallback and guard against regressions where `codex-mini-latest` might reappear.

## Current Behavior
- `scripts/lib/factory-config.mjs` exports `DEFAULT_FACTORY_REVIEW_MODEL = "codex-mini-latest"`, so `resolveFactoryStageModel` picks an invalid model whenever review-specific overrides are unset.
- The failure-diagnosis steps in `.github/workflows/factory-pr-loop.yml` fall back to `'codex-mini-latest'` in two separate jobs, causing Codex runs to fail unless operators preconfigure `FACTORY_FAILURE_DIAGNOSIS_MODEL`.
- README guidance advertises `codex-mini-latest` as the lightweight review and diagnosis default, reinforcing the incorrect configuration.
- Cost estimation logic (`scripts/lib/cost-estimation.mjs`) carries pricing metadata keyed by `codex-mini-latest`, so future pricing displays would be inconsistent if the default changes without updating the table.
- Tests (`tests/factory-config.test.mjs` and `tests/factory-config-contracts.test.mjs`) encode the outdated fallback, so they currently enforce the invalid value.

## Proposed Changes

### Factory Configuration & Pricing
- Update `DEFAULT_FACTORY_REVIEW_MODEL` in `scripts/lib/factory-config.mjs` to `"gpt-5-mini"`, leaving the shared Codex default untouched.
- Ensure any helper exports (e.g., `DEFAULT_FACTORY_STAGE_MODELS`) automatically pick up the new value and document the rationale with a nearby comment if needed.
- Refresh the `MODEL_PRICING` map in `scripts/lib/cost-estimation.mjs` so it contains a `"gpt-5-mini"` entry with the appropriate pricing assumption and remove or deprecate the obsolete `codex-mini-latest` key.

### Workflow Defaults
- Change both failure-diagnosis steps in `.github/workflows/factory-pr-loop.yml` to fall back to `gpt-5-mini` when `FACTORY_FAILURE_DIAGNOSIS_MODEL` is unset.
- Confirm no other workflow (including `_factory-stage.yml`) references `codex-mini-latest`; update any additional fallbacks discovered during implementation.

### Documentation
- Revise README guidance so operators see `gpt-5-mini` as the default review/diagnosis model while leaving the shared codex defaults unchanged.
- Note that overrides via Actions variables remain available and unchanged.

### Automated Tests & Safeguards
- Update `tests/factory-config.test.mjs` expectations to assert the new review default and keep override precedence behavior intact.
- Adjust `tests/factory-config-contracts.test.mjs` regex checks to look for `'gpt-5-mini'` in the workflow fallbacks.
- After code changes, run an in-repo search (e.g., `rg "codex-mini-latest"`) to ensure no default fallbacks remain; consider adding a lightweight test or linters if appropriate.

## Assumptions & Open Questions
- Pricing for `gpt-5-mini` will be approximated using the best available public guidance; if precise rates are unavailable, default to matching the prior lightweight tier and document the assumption.
- No other scripts rely on `codex-mini-latest` semantics beyond the locations already identified; any additional references discovered will be treated as within scope for replacement.

## Out of Scope
- Changing the shared `gpt-5-codex` defaults for plan/implement/repair stages.
- Reworking override resolution logic or introducing new model-selection environment variables.
- Broader documentation rewrites beyond clarifying the default model name and its usage.
