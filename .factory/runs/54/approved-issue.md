### Problem statement

`origin/main` now validates autonomous review artifacts earlier and normalizes `review.md` traceability from `review.json`, which closes much of the original artifact-drift problem. The remaining gap is recovery: when the review stage still produces invalid autonomous review artifacts, the factory classifies the failure but generally blocks the PR instead of routing the run through a bounded repair path targeted at the artifact contract violation.

This leaves a class of recoverable failures, such as invalid `review.json` field shapes or non-normalizable review inconsistencies, stopping the factory without a focused retry path.

### Goals

- Route malformed autonomous review artifacts through a bounded repair path instead of immediately blocking the PR.
- Distinguish recoverable review-artifact contract failures from unrecoverable review logic failures and from GitHub review-delivery failures.
- Preserve strict validation: invalid review artifacts must still never silently pass.
- Improve operator-facing failure comments so they clearly state whether the failure was:
  - invalid `review.json` schema/content
  - non-recoverable `review.md` / `review.json` inconsistency
  - review delivery / configuration failure

### Non-goals

- Do not weaken review artifact validation.
- Do not redesign the review methodology system.
- Do not replace the `review.md` / `review.json` artifact pair.
- Do not revisit traceability auto-normalization that is already handled before validation.

### Constraints

- Keep compatibility with the existing review methodology extension points and artifact paths.
- Recovery attempts must be bounded and integrated with existing repair-attempt safety limits.
- Validation must remain deterministic for methodology, decision, blocking counts, requirement checks, findings, and canonical traceability rendering.
- The implementation should fit the existing GitHub Actions and repo-local script architecture.

### Acceptance criteria

- If autonomous review emits invalid `review.json` content, such as an invalid `requirement_checks[*].evidence` shape/type, the failure is detected and routed into a bounded repair path.
- If autonomous review emits a review artifact inconsistency that cannot be resolved by existing traceability normalization, the failure is classified precisely and routed into the same bounded repair path or a clearly differentiated terminal failure.
- If repair succeeds, normal review processing continues without manual intervention.
- If bounded repair is exhausted, the PR is blocked with a failure comment that explicitly identifies malformed review artifacts as the cause.
- Failure reporting distinguishes review-artifact failures from review-delivery/configuration failures.
- Tests cover:
  - invalid `review.json` field shapes
  - recoverable review-artifact failures that enter repair
  - exhausted repair behavior
  - differentiated failure comments/classification

### Risk

If recovery is too permissive, the factory could mask invalid autonomous review output and erode trust in the review gate. If it is too strict, the system will continue to block on recoverable artifact-contract failures. Because review artifacts sit on the safety boundary, recovery must be narrow, explicit, and capped.

### Affected area

CI / Automation