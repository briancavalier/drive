# Telemetry & Calibration Scope

## Summary
- Add durable per-stage telemetry so every successful factory stage persists the run/stage metadata, estimate, and placeholders for actual usage.
- Provide a first-pass calibration loop that reads historical telemetry, computes model+stage correction factors, and feeds them back into cost estimation.
- Keep the solution append-only and repo-local, extending the existing `cost-summary.json` artifact instead of introducing new durable storage.

## Telemetry Requirements
- Extend `.factory/runs/<issue>/cost-summary.json` to hold a `telemetry` array. Each entry records:
  - GitHub context: `issueNumber`, optional `prNumber`, `branch`, and the workflow `runId`/`runAttempt`.
  - Stage metadata: `stage`, resolved `model`, `promptChars`, estimated token/price values, pricing source, and applied calibration multiplier.
  - Outcome: `"succeeded"` when the stage produced a commit; `"skipped"` for duplicate no-op runs that still emit a summary; additional failure outcomes may be added later.
  - Actual placeholders: `actualInputTokens`, `actualUsd`, and `actualSource`, defaulting to `null`/`""` until populated by a supported source.
  - Timestamps (`recordedAt` ISO string) for ordering and auditability.
- Append the new telemetry entry during `prepare-stage-push` when the worktree is staged, so it travels with the standard stage commit.
- Preserve previous summary semantics: `stages` map and `current` object continue to be updated so downstream consumers are unaffected.
- Guardrails:
  - Telemetry append must tolerate missing temp summary files (no crash on skipped stages).
  - Entries must remain immutable after commit; subsequent stages add new entries instead of rewriting earlier history.

## Calibration Requirements
- Introduce `scripts/calibrate-cost-estimates.mjs` that:
  - Scans `.factory/runs/**/cost-summary.json` for telemetry entries with both estimate and actual values present.
  - Groups by `{stage, model}` and computes a correction multiplier (simple weighted mean of `actualUsd / estimatedUsd`).
  - Emits a repo-tracked `.factory/cost-calibration.json` containing metadata (`generatedAt`, sample counts, multiplier).
  - Logs a concise report for operators describing which buckets were updated or skipped due to insufficient data.
- Update `scripts/lib/cost-estimation.mjs` so `estimateStageCost` loads calibration multipliers when available and:
  - Applies the multiplier to the stage estimate (defaulting to `1.0`); retain the pre-calibration estimate for traceability.
  - Records which multiplier was used (stage+model key, source, sample size) inside `summary.current` and the telemetry entry.
- Ensure cost thresholds, labels, and existing PR metadata remain backward compatible (values already expressed in post-calibration USD).

## Workflow & Integration
- Modify `_factory-stage.yml`:
  - Pass `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, and `FACTORY_PR_NUMBER` into `node scripts/estimate-stage-cost.mjs` and `node scripts/prepare-stage-push.mjs`.
  - Add a final `always()` step that, when the stage fails after estimation, logs that telemetry was skipped (future hook point); no repo mutation occurs there.
- Enhance `scripts/prepare-stage-push.mjs`:
  - Load the temporary cost summary JSON, append the telemetry entry, then persist it to the artifacts path.
  - Accept extra env values (PR number, run id/attempt) and pass them through to the telemetry helper.

## Documentation
- Update `README.md` to describe:
  - The new telemetry data stored in `cost-summary.json`.
  - How to run the calibration script and what the output file represents.
  - Operator guidance on supplying actual usage data (e.g., manual entry or future automation) and interpreting correction multipliers.

## Testing
- Expand `tests/cost-estimation.test.mjs` to cover calibration multiplier application and metadata exposure.
- Add unit coverage for the telemetry helper (new file under `tests/`).
- Extend `tests/prepare-stage-push.test.mjs` to assert telemetry entries are appended with expected fields.
- Extend `tests/factory-artifact-guard.test.mjs` if additional durable files (e.g., `.factory/cost-calibration.json`) become allowed.
- Create tests for `scripts/calibrate-cost-estimates.mjs`, validating aggregation logic and output structure.

## Assumptions & Open Questions
- Actual usage data will arrive via future automation or manual updates to telemetry entries; this change only prepares the schema.
- Stage outcome granularity beyond `"succeeded"` can be added later without schema migration.
- Calibration should ignore entries lacking `actualUsd` or with zero estimates to avoid divide-by-zero; this behavior will be documented and tested.
