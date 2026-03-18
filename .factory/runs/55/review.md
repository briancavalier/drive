decision: PASS

📝 Summary
- Decision: PASS (methodology: `default`).
- This change adds append-only per-stage telemetry to `.factory/runs/<issue>/cost-summary.json`, a repo-tracked calibration generator `.factory/cost-calibration.json`, and integrates calibration multipliers into stage cost estimation and summary metadata.
- The implementation is covered by unit tests and CI evidence; telemetry append, calibration aggregation, and calibration-aware estimation are exercised by tests.

🚨 blocking findings
- None.

⚠️ non-blocking notes
- Consider making the presence of `.factory/cost-calibration.json` explicit in the durable artifact policy or `scripts/lib/factory-artifact-guard.mjs` durable listing to make governance clearer.
- `.factory/runs/55/repair-log.md` is not present in this run directory; add it when a repair narrative exists for completeness.

Methodology: default

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria</summary>

- Requirement: Factory records a per-stage telemetry entry with stable identifiers and estimate/outcome fields.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/cost-telemetry.mjs: implements schema and buildTelemetryEntry()
    - scripts/prepare-stage-push.mjs: persistCostSummaryForStage() appends telemetry during stage preparation
    - tests/prepare-stage-push.test.mjs: asserts telemetry entry fields are present after persist
- Requirement: Implementation provides a place to store actual token/cost values for later calibration.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/cost-telemetry.mjs: telemetry entry includes actualInputTokens, actualUsd, actualSource placeholders
    - README.md: documents backfilling telemetry entries and running the calibration script
- Requirement: Calibration script aggregates historical telemetry into per-{stage,model} multipliers and writes .factory/cost-calibration.json.
  - Status: `satisfied`
  - Evidence:
    - scripts/calibrate-cost-estimates.mjs: scans .factory/runs/**/cost-summary.json and writes .factory/cost-calibration.json
    - tests/calibrate-cost-estimates.test.mjs: validates aggregation, sample counts, and multiplier values
- Requirement: Cost estimation applies calibration multipliers and records calibration metadata in summary and telemetry.
  - Status: `satisfied`
  - Evidence:
    - scripts/lib/cost-estimation.mjs: resolveCalibrationForStage() and estimateStageCost() apply multiplier and populate calibration metadata
    - tests/cost-estimation.test.mjs: asserts calibrationMultiplier, calibrationSource, and calibrationSampleSize are recorded and used

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables</summary>

- Requirement: Stage workflow passes run id/attempt and PR number into estimation and prepare steps so telemetry contains GitHub context.
  - Status: `satisfied`
  - Evidence:
    - .github/workflows/_factory-stage.yml: passes GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, and FACTORY_PR_NUMBER into estimate and prepare steps
    - scripts/prepare-stage-push.mjs: persistCostSummaryForStage() consumes runId/runAttempt/prNumber from env context
- Requirement: Unit tests and CI cover telemetry append, calibration aggregation, and calibration-aware estimation.
  - Status: `satisfied`
  - Evidence:
    - tests/cost-telemetry.test.mjs, tests/prepare-stage-push.test.mjs, tests/calibrate-cost-estimates.test.mjs, tests/cost-estimation.test.mjs: unit tests added/updated
    - CI: workflow run id 23263919480 — unit and factory-artifact-guard jobs reported success

</details>
