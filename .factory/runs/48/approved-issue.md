### Problem statement
The factory currently uses `codex-mini-latest` as the default model for autonomous review and failure-diagnosis runs. `codex-mini-latest` is not a valid model, so these default paths are misconfigured and can fail unless operators explicitly override them. The defaults should be updated to `gpt-5-mini`.

### Goals
- Replace the default `codex-mini-latest` model with `gpt-5-mini` wherever the factory currently falls back to `codex-mini-latest`.
- Update both execution logic and documentation so the configured defaults are consistent.
- Preserve existing override behavior via `FACTORY_REVIEW_MODEL` and `FACTORY_FAILURE_DIAGNOSIS_MODEL`.
- Update tests to assert the new default values.

### Non-goals
- Do not change the default `gpt-5-codex` model used for the plan, implement, and repair stages.
- Do not change explicit per-repo or per-environment overrides that already set a model intentionally.
- Do not redesign factory model-selection behavior beyond correcting the invalid default.

### Constraints
- The new fallback value must be exactly `gpt-5-mini`.
- Only default behavior should change; explicit Actions variables must continue to take precedence.
- Update any tests, fixtures, and README references that currently encode `codex-mini-latest`.
- Keep the change scoped to factory model defaults and related documentation.

### Acceptance criteria
- Autonomous review defaults to `gpt-5-mini` when `FACTORY_REVIEW_MODEL` is unset.
- Failure-diagnosis runs default to `gpt-5-mini` when `FACTORY_FAILURE_DIAGNOSIS_MODEL` is unset.
- Existing override variables still work unchanged.
- README and any other operator-facing docs describe `gpt-5-mini` as the lightweight default.
- Automated tests covering workflow model defaults pass with the updated values.
- A repository search confirms there are no remaining default fallbacks to `codex-mini-latest`.

### Risk
The main risk is partial replacement: missing one fallback path could leave review and failure-diagnosis behavior inconsistent. There is also some risk of changing documentation or tests without updating the actual workflow expressions, so the implementation should verify both the workflow files and contract tests together.

### Affected area
CI / Automation
