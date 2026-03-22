## Review Rubric: Workflow-Safety

Review against these dimensions:

1. **Least-Privilege Permissions:** Jobs, steps, and reusable workflows request only the permissions they need, with sensitive scopes (e.g., `contents: write`, `id-token`, `workflows`) withheld unless absolutely required and justified.
2. **Trigger Scope & Recursion:** Workflow triggers (events, filters, and conditions) avoid unintended recursion, excessive `workflow_run` fan-out, or untrusted entry points that could escalate privileges.
3. **Secrets & Tokens:** Secret usage, token forwarding, and environment propagation prevent leakage (no logging secrets, minimal environment exposure, sanitized outputs) and avoid cross-job reuse that bypasses GitHub protections.
4. **Self-Modification Hazards:** Steps that write to repositories, alter workflows, or automate approvals include safeguards against infinite loops, branch stomping, and forced pushes beyond intended targets.
5. **Branch Protections & Merge Gates:** Workflow actions respect branch protection rules, required reviews, and status checks; emergency bypasses are gated and auditable.
6. **Validation & Test Coverage:** Changes demonstrate verification for workflow logic (unit tests, dry runs, targeted CI), including negative paths for rollback conditions or failure handlers.

Factory workflow/state-machine changes:

- When a PR touches factory workflows, routing, PR state or metadata, interventions, control-panel behavior, or their related workflow-contract tests, reviewers must complete `./factory-review-checklist.md` in addition to this rubric.
- Treat that checklist as required review procedure, not optional guidance.
- Do not conclude `pass` or “no findings” until the checklist is complete and its evidence is reflected in the review output.
- For `workflow-safety` reviews, `review.json` must include a `checklist` object with the fields `state_changed`, `writers_reviewed`, `readers_reviewed`, `workflow_paths_checked`, `cleanup_paths_checked`, `tests_evidence_checked`, and `residual_risks`.

Rules:

- Missing evidence for a high-risk workflow change is a blocking finding.
- Escalations that grant broad permissions or bypass branch protections must include documented mitigations; otherwise they are blocking.
- Non_blocking findings apply to ergonomic or low-risk improvements that do not materially impact safety posture.
- A `pass` decision requires every requirement to be `satisfied` or `not_applicable`, with explicit acknowledgment of any residual workflow risks.
- For factory workflow/state-machine changes, a `pass` decision also requires completing `./factory-review-checklist.md`.
- For `workflow-safety` reviews with `decision: "pass"`, every checklist boolean must be `true`.
