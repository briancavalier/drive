## Source of truth

- Treat `.factory/runs/<issue>/approved-issue.md` as the immutable request snapshot after intake.
- Treat `.factory/runs/<issue>/spec.md`, `plan.md`, and `acceptance-tests.md` as the approved scope for implementation and review.
- Treat `.factory/runs/<issue>/review.json` as the canonical machine-readable review artifact. Markdown traceability is derived from it.

## Stage boundaries

- `plan` refines the request into artifacts only and does not implement product code.
- `implement` must stay within the approved plan and acceptance tests.
- `repair` addresses the reported failure context only and should not widen scope.
- `review` evaluates the change against the approved artifacts, current diff, test evidence, and CI evidence without expanding the request.

## Artifact and scratch-space rules

- `.factory/tmp/**` is scratch space only and must never persist in stage output.
- `.factory/runs/<issue>/` is reserved for the approved durable run-artifact set only.
- Missing or invalid required artifacts are blocking conditions, not optional cleanup.

## Review invariants

- A `pass` decision is invalid if any requirement check is unmet or partially satisfied.
- Traceability between requirements and concrete evidence is mandatory.
- Weak or missing evidence should result in `request_changes`.

## Control-plane guardrails

- Protected control-plane paths require explicit authorization through `FACTORY_GITHUB_TOKEN`.
- The factory should not attempt to modify protected control-plane files unless the run is intentionally authorized for self-modification.

## Scope and testing discipline

- Prefer minimal diffs tied directly to the approved issue and plan.
- Add or update tests that directly prove the acceptance criteria for the change.
- If the approved plan is stale or impossible, record the blocker instead of inventing new requirements.
