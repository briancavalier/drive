# Factory Stage Model Validation Specification

## Summary
- Fail stage execution early when the resolved Codex model alias is invalid by checking it against the OpenAI Models API before launching Codex.
- Surface a precise, actionable failure message that names the stage, the invalid alias, and the configuration knob to adjust.
- Preserve existing failure handling by routing the preflight failure through the current `failure_type` / `failure_message` pipeline so blocked PR comments automatically pick up the improved guidance.

## Current Behavior
- `scripts/resolve-stage-model.mjs` returns the model string with no metadata about where it came from.
- `_factory-stage.yml` runs Codex without confirming the alias exists; if the alias is invalid the reusable action exits with a generic configuration failure message (`failure_message=Codex stage execution failed before branch output could be prepared.`).
- `factory-pr-loop` propagates that generic message to `handle-stage-failure.mjs`, so operators must open workflow logs to discover the real root cause (e.g., a stale review model alias).

## Proposed Changes

### 1. Capture model resolution metadata
- Extend `scripts/lib/factory-config.mjs` with `resolveFactoryStageModelInfo({ mode, overrideModel, variables })` that returns `{ model, source, sourceVariable }`.
  - `source` indicates whether the value came from an explicit override input, a stage-specific variable, the shared codex default, or the hard-coded fallback.
  - `sourceVariable` maps to the controlling environment variable (e.g., `FACTORY_REVIEW_MODEL` for review mode).
- Keep `resolveFactoryStageModel` as a thin wrapper that returns `info.model` so existing callers continue to work.
- Update `scripts/resolve-stage-model.mjs` to emit both `model` and `model_source` outputs (plus `model_source_variable` for guidance).
- Extend `tests/factory-config.test.mjs` to cover the new helper and ensure the metadata matches each resolution path.

### 2. Add deterministic stage model preflight validation
- Create `scripts/validate-stage-model.mjs` with the following behavior:
  - Require `FACTORY_STAGE_MODEL`, `FACTORY_STAGE_MODE`, and `OPENAI_API_KEY`; accept optional `FACTORY_STAGE_MODEL_SOURCE[_VARIABLE]` for messaging.
  - Perform a `GET https://api.openai.com/v1/models/{model}` request using Node 24's global `fetch`.
  - If the response is 200, exit successfully and set `validated=true` via `GITHUB_OUTPUT`.
  - If the response status is 404 or the JSON body contains `error.code` / `error.type` equal to `model_not_found` (or similar), write `failure_type=configuration` and an actionable `failure_message` ("Resolved review stage model `XYZ` is not available. Update `FACTORY_REVIEW_MODEL` or adjust the override.") to `GITHUB_OUTPUT`, then exit with status 1.
  - Treat 401/403 as configuration failures with guidance to check the API key, because Codex cannot run without access to models.
  - For transient transport errors or 5xx responses, log a warning and exit 0 so the stage can continue (avoids misclassifying broader outages).
- Unit-test the script (new `tests/validate-stage-model.test.mjs`) by stubbing `global.fetch` to exercise success, `model_not_found`, authorization failure, and retryable-server-error paths.

### 3. Wire the preflight into the reusable workflow
- In `_factory-stage.yml`, add a "Validate stage model" step immediately after `Resolve stage model`.
  - Pass the resolved model outputs and the OpenAI API key as environment variables.
  - Mark the step `continue-on-error: true` and capture its outputs.
- Add a following "Stop on stage model validation failure" gate that exits when the validation step fails so the workflow halts before Codex runs.
- Promote the validation step outputs into the job outputs: update the `failure_type`, `failure_message`, and `transient_retry_attempts` aggregations to prefer `steps.model_preflight` before later steps.
- Update `tests/factory-config-contracts.test.mjs` to assert the new step wiring, environment inputs, and job-output precedence.

### 4. Preserve blocked-comment messaging
- No changes are required to `scripts/handle-stage-failure.mjs`; once the workflow surfaces the new `failure_message`, the existing pipeline will post it verbatim.
- Add a focused assertion in `tests/failure-comment.test.mjs` (or a new unit test) confirming that configuration failures display the custom message inside the fenced code block to guard against regressions.

## Assumptions & Risks
- Assumes the OpenAI Models API remains available in GitHub-hosted runners; if it becomes rate-limited, the script will log and fall back to running Codex.
- Stubbing `fetch` in Node 24 tests is sufficient; no additional HTTP client is required.
- Introducing metadata outputs from `resolve-stage-model.mjs` does not break downstream automation because the existing `model` output name is unchanged.
- The actionable message should reference the controlling env var even when the stage used the shared Codex fallback; for non-review stages we guide operators toward `FACTORY_CODEX_MODEL`.

## Out of Scope
- Broader catalog synchronization or listing available models dynamically.
- Expanding failure classification beyond the existing configuration bucket.
- Altering the text structure of the blocked comment beyond inserting the improved message produced by the workflow.
