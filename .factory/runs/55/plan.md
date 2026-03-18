# Implementation Plan

1. **Add Telemetry Helper**
   - Create `scripts/lib/cost-telemetry.mjs` to load/append telemetry entries, encapsulating schema validation and de-duplication.
   - Include utilities for deriving stage outcome metadata and ensuring append-only writes.

2. **Instrument Stage Workflow**
   - Update `_factory-stage.yml` to pass `FACTORY_PR_NUMBER`, `GITHUB_RUN_ID`, and `GITHUB_RUN_ATTEMPT` through to `estimate-stage-cost` and `prepare-stage-push`.
   - Extend `scripts/prepare-stage-push.mjs` so `persistCostSummaryForStage` loads the temp summary, appends a telemetry entry via the helper, and writes it to `.factory/runs/<issue>/cost-summary.json`.
   - Ensure `persistCostSummaryForStage` tolerates missing temp summaries and keeps existing behavior for stages without repo changes.

3. **Enhance Cost Estimation with Calibration**
   - Extend `scripts/lib/cost-estimation.mjs` to:
     - Load calibration data from `.factory/cost-calibration.json` when present.
     - Apply the multiplier to stage estimates and surface the multiplier/sample size in both `summary.current` and the telemetry payload.
   - Update `scripts/estimate-stage-cost.mjs` to pass calibration context and expose multiplier metadata via Actions outputs if needed.

4. **Implement Calibration Script**
   - Create `scripts/calibrate-cost-estimates.mjs` to scan run telemetry, compute per-stage/model multipliers, and persist `.factory/cost-calibration.json`.
   - Include CLI reporting and graceful handling for missing or incomplete data.
   - Update `scripts/lib/factory-artifact-guard.mjs` and related tests if the new calibration file must be treated as durable.

5. **Tests & Documentation**
   - Add/extend unit tests covering telemetry append (`tests/prepare-stage-push.test.mjs`), calibration-aware estimation (`tests/cost-estimation.test.mjs`), the new helper, and the calibration script.
   - Document telemetry schema and calibration usage in `README.md`.
