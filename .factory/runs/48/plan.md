# Implementation Plan

## Work Breakdown
1. **Update factory defaults and pricing metadata**
   - Edit `scripts/lib/factory-config.mjs` to set `DEFAULT_FACTORY_REVIEW_MODEL` to `"gpt-5-mini"`, ensuring derived exports (e.g., `DEFAULT_FACTORY_STAGE_MODELS`) inherit the change.
   - Refresh `scripts/lib/cost-estimation.mjs` so `MODEL_PRICING` includes pricing data for `gpt-5-mini` and no longer references `codex-mini-latest`.
   - Scan related helper modules for hard-coded `codex-mini-latest` strings and realign any discovered constants.
2. **Adjust GitHub workflow fallbacks**
   - Update both failure-diagnosis `model` fallbacks in `.github/workflows/factory-pr-loop.yml` to use `gpt-5-mini`.
   - Double-check `_factory-stage.yml` and other workflows for the obsolete model string, updating if present.
3. **Align documentation and automated tests**
   - Revise README sections describing default review/diagnosis behavior to mention `gpt-5-mini` while keeping override guidance intact.
   - Update expectations in `tests/factory-config.test.mjs` and `tests/factory-config-contracts.test.mjs` to assert the new default.
   - Run `rg "codex-mini-latest"` after edits to confirm no lingering default fallbacks remain.
4. **Verify the suite**
   - Execute targeted Node test files to confirm updated expectations.
   - Run the full `npm test` suite to guard against regressions.

## Testing Strategy
- `node --test tests/factory-config.test.mjs`
- `node --test tests/factory-config-contracts.test.mjs`
- `npm test`
- Manual `rg "codex-mini-latest"` to ensure all default fallbacks were replaced
