## Problem Statement
The repository now has cost estimation, but it does not appear to record actual per-stage usage or cost data in a durable way. Without actuals, the estimator cannot be calibrated over time, so estimates will drift and remain heuristic rather than evidence-based.

## Goals
- Record durable per-stage telemetry for factory runs so estimated cost can be compared with actual usage over time.
- Capture the minimum metadata needed to calibrate estimates by stage and model.
- Establish a simple first-pass calibration loop that can improve future estimates from historical data.
- Keep the first implementation operationally simple and compatible with the current artifact and workflow structure.

## Non-Goals
- Building a large analytics platform or external database-backed reporting system.
- Designing a complex predictive model in the first iteration.
- Reworking unrelated factory workflow logic.
- Depending on undocumented Codex action internals for correctness.

## Constraints
- Preserve the existing factory workflow and artifact contracts unless changes are intentionally added and documented.
- Prefer simple append-only or per-run JSON telemetry over introducing new infrastructure.
- Avoid relying on unstable or undocumented outputs from `openai/codex-action`; use durable metadata and supported sources for actuals.
- Keep implementation compatible with the current GitHub-native scaffold and tests.

## Acceptance Criteria
- The factory records a per-stage telemetry entry for each relevant run with stable identifiers such as run id, issue number, PR number, stage, model, prompt size, estimate, and outcome.
- The implementation provides a clear place to store actual token/cost values when they are available from a supported source.
- A calibration script or equivalent mechanism computes correction factors from historical estimate-vs-actual data, at minimum by stage and model.
- Future cost estimates can consume those correction factors without breaking existing workflows.
- Tests cover the new telemetry and calibration behavior.
- Documentation explains what is recorded, where it lives, and how operators should use the calibration output.

## Risk
- Storing telemetry in the wrong place could violate the current durable artifact policy or create noisy repo churn.
- If actuals are joined unreliably, calibration factors could become misleading and worsen estimates.
- If the design is too ambitious initially, it may add maintenance cost without improving estimate quality.

## Affected Area
CI / Automation
