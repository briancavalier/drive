decision: pass

📝 Summary
- Methodology: `default`.
- The change adds deterministic preflight validation for resolved stage models (`scripts/validate-stage-model.mjs`), extends model resolution metadata (`resolveFactoryStageModelInfo`), wires a validation step into the reusable stage workflow (`.github/workflows/_factory-stage.yml`), and updates/extends unit tests to cover the new behavior.
- Unit tests and workflow contract tests exercise the new failure paths, and CI for this branch reports success for unit tests, artifact guard, and actionlint.

🚨 blocking findings
- None. All acceptance criteria and plan deliverables are implemented and covered by unit/contract tests; CI for this branch ran successfully (unit: success; factory-artifact-guard: success; actionlint: success).

⚠️ non-blocking notes
- The validation intentionally skips on transient upstream errors (5xx/429) to avoid misclassifying infrastructure outages as configuration failures; consider adding an optional retry/backoff in a future change if flaky model lookups become problematic.
- Consider adding a small integration test that runs the `_factory-stage.yml` workflow in a dry-run or workflow-lint environment to exercise the full job-output precedence and comment plumbing end-to-end.

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: When the resolved stage model is invalid or unsupported, the stage emits a specific failure_message that names the model and explains what configuration to change.
  - Status: `satisfied`
  - Evidence:
    - scripts/validate-stage-model.mjs: buildModelUnavailableMessage constructs a message naming the mode and model and references the controlling variable (sourceVariable).
    - tests/validate-stage-model.test.mjs: test 'validateStageModel reports configuration failure for missing models' asserts outputs.failure_message contains the resolved model name and FACTORY_REVIEW_MODEL.
    - CI: workflow run id 23262808309 — unit: success (tests passed).
- Requirement: The blocked PR comment for model-validation failures includes the specific failure_message rather than a generic placeholder.
  - Status: `satisfied`
  - Evidence:
    - tests/failure-comment.test.mjs: test 'configuration failure comments render actionable guidance inside the fenced block' asserts the failure_message is rendered verbatim inside the fenced code block.
    - scripts/lib/failure-comment.mjs: buildFailureComment consumes the workflow-provided failure_message without alteration (tests exercise rendering).

</details>

<details>
<summary>🧭 Traceability: Spec Commitments</summary>

- Requirement: Preserve backward compatibility: keep existing 'model' output name and existing failure classification flow so blocked comments pick up the improved message.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/factory-config.mjs: resolveFactoryStageModel remains a thin wrapper returning info.model.
    - scripts/resolve-stage-model.mjs: still writes 'model' output and additionally emits model_source and model_source_variable, preserving downstream callers.
    - tests/failure-comment.test.mjs: confirms blocked comment rendering remains compatible with configuration failure messages.

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Add deterministic stage model preflight validation script and unit tests.
  - Status: `satisfied`
  - Evidence:
    - scripts/validate-stage-model.mjs: new script implements model validation and writes GITHUB_OUTPUT entries (validated/failure_type/failure_message).
    - tests/validate-stage-model.test.mjs: unit tests cover success, model_not_found (404), authorization (401), and transient server (503) paths.
- Requirement: Wire the preflight into the reusable workflow so validation runs after resolution and gates Codex execution, and expose its outputs as job outputs.
  - Status: `satisfied`
  - Evidence:
    - .github/workflows/_factory-stage.yml: contains a 'Validate stage model' step (node scripts/validate-stage-model.mjs) and a 'Stop on stage model validation failure' step that exits when steps.model_preflight.outcome == 'failure'.
    - tests/factory-config-contracts.test.mjs: asserts the workflow includes the validation step, correct env wiring (FACTORY_STAGE_MODEL/FACTORY_STAGE_MODE/OPENAI_API_KEY/FACTORY_STAGE_MODEL_SOURCE_VARIABLE), and that job outputs prefer steps.model_preflight outputs for failure_type and failure_message.

</details>
