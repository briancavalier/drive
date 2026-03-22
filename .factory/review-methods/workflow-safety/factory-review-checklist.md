## Factory Workflow Review Checklist

Use this checklist whenever a review touches factory workflow or state-machine behavior. Do not conclude `pass` or “no findings” until every section is complete.

### 1. Changed State Surface

Identify every changed control-plane surface in the diff:
- PR metadata fields
- labels or label semantics
- workflow env contracts
- intervention payload fields
- router outputs or control-panel actions
- review-method instructions or prompt constraints

Record the changed surface in the review notes before checking behavior.

### 2. Writer and Reader Inventory

For each changed surface, inventory:
- every workflow job or script that writes it
- every router, control-panel, prompt, or validator path that reads it
- every `apply-pr-state.mjs` callsite that can mutate the relevant state

If any writer or reader is not reviewed, the review is incomplete.

### 3. Transition and Recovery Audit

Trace the affected paths end to end, including any applicable entry and exit paths:
- slash-command routing
- control-panel actions
- answered interventions
- stage dispatch and completion
- blocked, paused, reset, retry, escalate, and human-takeover paths
- review pass/fail and repair scheduling
- interrupted or resumed runs when temporary state might persist

The review must confirm that each changed transition still leads to a recoverable state.

### 4. Alignment Checks

Verify that the same behavior is represented consistently across:
- workflow YAML
- routing outputs
- intervention payloads and resolution logic
- control-panel recommendations and available actions
- PR metadata rendering/parsing
- repository docs or rubric text when operator behavior changed

Any mismatch between these layers is a finding.

### 5. Cleanup and Invariants

Check the control-plane invariants introduced or affected by the diff:
- temporary authorizations are always cleared
- transient labels do not survive incompatible states
- metadata and live labels cannot drift into contradictory states
- blocked and paused states remain resumable only through intended commands
- reset and human-only paths relock the PR as intended

If cleanup depends on one path only, verify whether alternate exits leave stale state behind.

### 6. Tests and Evidence

Confirm the diff includes specific evidence for each changed transition or invariant:
- unit or contract tests for new workflow expectations
- prompt or rubric tests when review instructions change
- targeted CI or local test runs for the touched behavior

Missing coverage for a changed high-risk path is a blocking finding.

### 7. No-Findings Gate

Do not return `pass` or “no findings” unless the review notes explicitly include:
- changed state surface reviewed
- writers/readers reviewed
- transition/recovery paths reviewed
- cleanup/invariants reviewed
- tests/evidence reviewed
- residual risks, if any

If any line above is blank, the review is incomplete.

## Review Worksheet

Use this compact shape in notes or review artifacts:

```md
- State changed:
- Writers reviewed:
- Readers reviewed:
- Workflow paths checked:
- Cleanup paths checked:
- Tests/evidence checked:
- Residual risks:
- Findings:
```

For `workflow-safety` review artifacts, encode the worksheet in `review.json` as:

```json
{
  "checklist": {
    "state_changed": true,
    "writers_reviewed": true,
    "readers_reviewed": true,
    "workflow_paths_checked": true,
    "cleanup_paths_checked": true,
    "tests_evidence_checked": true,
    "residual_risks": "No additional residual workflow risks identified."
  }
}
```

`request_changes` reviews may record incomplete checklist booleans when that incompleteness is itself part of the finding. `pass` reviews must set every checklist boolean to `true`.
