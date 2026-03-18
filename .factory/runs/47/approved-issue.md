### Problem statement

Factory stage failures currently post overly generic blocked comments for Codex execution failures. In cases like PR #44, the underlying cause was specific and actionable: the configured review model alias no longer existed. The posted comment only said that Codex failed before branch output could be prepared, which forced manual log inspection to diagnose a straightforward configuration problem.

### Goals

- Detect invalid or unavailable stage model configuration before or during stage execution and surface a precise failure message.
- Include actionable operator guidance in the blocked PR comment when the configured model is invalid.
- Preserve the existing failure classification flow and blocked-state handling.
- Keep the fix small and localized to factory control-plane workflow/script code.

### Non-goals

- Redesign the entire failure-comment format.
- Add broad model catalog synchronization or dynamic model discovery from external APIs.
- Change autonomous review decision logic or repair-loop behavior beyond improving configuration failure diagnosis.
- Fix unrelated cost-estimation or model-default policy issues beyond what is necessary for precise failure reporting.

### Constraints

- Maintain backward compatibility for existing factory workflows and status transitions.
- Prefer deterministic preflight validation or targeted error extraction over adding more generic diagnosis text.
- The resulting failure message must be available to the existing failure comment pipeline without requiring a human to open logs first.
- Keep the implementation compatible with GitHub Actions execution in this repository.

### Acceptance criteria

- When the resolved stage model is invalid or unsupported, the stage emits a specific `failure_message` that names the model and explains what configuration to change.
- The blocked PR comment for this class of failure includes that specific message rather than the current generic Codex-stage placeholder.
- Tests cover the invalid-model path end to end at the workflow/script contract level.
- Existing non-invalid-model failure paths continue to behave as before.

### Risk

If the fix is too narrow, the factory may still hide other actionable configuration failures behind generic comments. If it is too broad or brittle, it could misclassify runtime failures as configuration issues and send operators in the wrong direction. Because this touches factory control-plane failure handling, regressions could make blocked PRs harder to recover.

### Affected area

CI / Automation