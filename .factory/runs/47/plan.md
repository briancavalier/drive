# Implementation Plan

## Work Breakdown
1. **Enhance stage model resolution metadata**
   - Update `scripts/lib/factory-config.mjs` to add `resolveFactoryStageModelInfo` that emits `{ model, source, sourceVariable }`, and make `resolveFactoryStageModel` delegate to it.
   - Adjust `scripts/resolve-stage-model.mjs` to capture the metadata outputs (`model`, `model_source`, `model_source_variable`).
   - Extend `tests/factory-config.test.mjs` to cover the new helper for override, stage-specific, shared codex, and default fallbacks.
2. **Implement deterministic model validation**
   - Add `scripts/validate-stage-model.mjs` that checks the resolved model against the OpenAI Models API and sets `GITHUB_OUTPUT` with either `validated=true` or an actionable configuration failure message.
   - Write `tests/validate-stage-model.test.mjs` that stub `global.fetch` to cover: success, `model_not_found` (404), authorization failure (401), and transient 503 (should allow stage to continue).
3. **Integrate the preflight step into the reusable workflow**
   - Modify `.github/workflows/_factory-stage.yml` to insert the validation step after model resolution, pass needed env vars (API key, mode, outputs), and stop the workflow when it fails.
   - Update job outputs to prioritize `steps.model_preflight` for `failure_type`, `failure_message`, and `transient_retry_attempts`.
   - Refresh `tests/factory-config-contracts.test.mjs` to assert the new step, env wiring, and output precedence order.
4. **Guard failure-comment rendering**
   - Add/adjust `tests/failure-comment.test.mjs` (or a new case) to ensure configuration failures with specific messages still render inside the fenced block, protecting the improved guidance from future regressions.

## Testing Strategy
- Run targeted unit tests via `node --test tests/factory-config.test.mjs tests/validate-stage-model.test.mjs tests/failure-comment.test.mjs`.
- Execute the workflow contract tests (`node --test tests/factory-config-contracts.test.mjs`) to confirm the YAML updates.
