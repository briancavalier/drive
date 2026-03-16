### Problem statement

Add a pluggable autonomous review stage to the factory so every factory-managed
PR is reviewed after green CI and before human review. The review stage should
use a selectable methodology, produce durable artifacts, and route failed
reviews back into the existing repair loop without widening scope.

The current factory moves directly from successful CI to human review. That
means it skips a structured autonomous inspection step, even though the
existing workflows already have planning artifacts, CI state, and review hooks.
We want the review stage to evaluate the implementation against the spec, plan,
acceptance criteria, and the diff, then either mark the PR ready or request
changes and trigger repair.

The review methodology itself needs to be pluggable so repositories can choose
different review expectations over time without editing workflow logic. The
default methodology should emphasize correctness, test adequacy, regression
risk, acceptance-criteria coverage, and scope discipline.

### Goals

- Add a first-class review stage after successful CI.
- Keep the pull request as the central artifact.
- Allow repo-level methodology selection.
- Store review output in durable markdown and JSON artifacts.
- Reuse the existing repair loop for autonomous review findings.
- Keep the human merge gate intact.
- Ensure the system stays auditable and GitHub-native.
- Keep the workflow copyable to similar repositories.

### Non-goals

- Multi-repo orchestration.
- Inline file-by-file review comments in v1.
- Arbitrary executable review plugins.
- Autonomous merge or deploy behavior.
- Replacing human review with AI-only approval.

### Constraints

- Must run entirely in GitHub Actions.
- Must use the existing reusable stage runner.
- Must keep work scoped to factory-managed branches and PRs.
- Must maintain required human review on the protected default branch.
- Must preserve the existing repair-attempt safety cap.
- Must not require an external database or queue.
- Must keep artifacts committed in the factory branch.
- Must keep the implementation readable by maintainers who did not author the system.

### Acceptance criteria

- A factory-managed PR that reaches green CI enters `review` instead of
  `ready_for_review`.
- The review stage can load a methodology profile from the repository.
- The system falls back to `default` if the configured review method is invalid.
- The review stage writes `review.md` and `review.json` under the issue run directory.
- A passing review marks the PR ready for human review.
- A failing review submits a body-only `REQUEST_CHANGES` review and leaves the PR in draft.
- A review-triggered repair reruns CI and then reruns review.
- The factory blocks the PR after the configured repair-attempt cap is reached.
- Existing `implement` and `repair` behavior continues to work for non-review findings.

### Risk

- Prompt bloat can cause quota or latency issues in the stage runner.
- Weak schema validation on review artifacts could break automation.
- Overly aggressive default review findings could create churn.
- Incorrect PR state routing could deadlock the control plane.
- Large repository context could crowd out the actually relevant failure context.

### Affected area

CI / Automation
