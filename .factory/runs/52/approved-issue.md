### Problem statement

The factory already performs advisory failure diagnosis for blocked stage and review runs, but that diagnosis stops at a PR comment. In practice, failures like the control-plane and artifact-contract problems seen around PR #44 and PR #46 produce useful operator guidance without producing durable follow-up work.

That leaves a gap: the factory can describe a likely cause, but it cannot yet operationalize that finding into a structured backlog item that the same system can later execute. When a failure is actionable and rooted in factory infrastructure rather than a one-off branch mistake, the system should be able to investigate, classify, deduplicate, and open a new Factory Request issue that captures the recovery work.

### Goals

- Add a post-failure investigation path for blocked factory-managed PRs.
- Reuse existing failure diagnosis inputs plus repo-local context to decide whether a failure is actionable.
- Create a structured Factory Request issue automatically when the failure appears to require a factory/control-plane improvement.
- Include durable evidence in the created issue, such as source PR, failure type, failure message, relevant artifacts, and operator-visible impact.
- Deduplicate issue creation so repeated failures with the same unresolved signature do not spam the backlog.
- Keep transient infrastructure failures and clearly external failures out of the issue-creation path.

### Non-goals

- Do not auto-start the newly created request issue.
- Do not auto-merge or auto-apply fixes from the investigation path.
- Do not create issues for every blocked PR regardless of cause.
- Do not replace the existing blocked/failure comments or state transitions.
- Do not introduce external incident-management systems or databases.

### Constraints

- The solution must fit the current GitHub-native architecture: issues, PR metadata, Actions workflows, and repo-local artifacts.
- Issue creation must be bounded and idempotent enough to avoid recursive issue storms.
- The factory must distinguish likely control-plane defects from PR-specific implementation mistakes as well as transient/external errors.
- The created issue body must conform to the existing Factory Request template fields.
- Human operators must be able to trace why a follow-up issue was opened and which failure triggered it.

### Acceptance criteria

- When a factory-managed PR blocks on an actionable control-plane or artifact-contract failure, the factory can generate a structured Factory Request issue instead of only leaving an advisory comment.
- The created issue references the triggering PR number, workflow run, failure type, and a concise problem summary.
- Failures classified as transient infrastructure or external dependency problems do not create follow-up issues.
- Repeated failures with the same unresolved signature do not create duplicate open request issues.
- Tests cover creation, suppression, and deduplication behavior.
- Repository documentation explains when automatic follow-up issues are created and when they are intentionally suppressed.

### Risk

If classification or deduplication is weak, the factory could create noisy or recursive backlog items that reduce trust in autonomous operations. If the gating is too conservative, important factory-control-plane regressions will still disappear into comments instead of becoming actionable work. Because this logic runs during failure handling, mistakes can amplify operator confusion at exactly the wrong time.

### Affected area

CI / Automation
