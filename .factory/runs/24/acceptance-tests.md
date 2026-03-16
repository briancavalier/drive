# Acceptance Tests

1. **Stage status shows emoji mapping**
   - When `renderPrBody` receives metadata with `status: "plan_ready"`, the rendered body contains `Stage: 👀 plan_ready`.
2. **CI status shows emoji mapping**
   - With `ciStatus: "success"`, the PR body contains `CI: ✅ success`.
3. **Operator notes use the prescribed icons**
   - The operator notes list includes bullets starting with `▶️ Apply \`factory:implement\``, `⏸️ Apply \`factory:paused\``, and `▶️ Remove \`factory:paused\` and re-apply \`factory:implement\`` respectively.
4. **Plan ready comment is emoji-prefixed**
   - `renderPlanReadyIssueComment` returns text beginning with `👀 Factory planning is ready…`.
5. **Ready-for-review comment is emoji-prefixed**
   - `renderReviewPassComment` returns markdown whose first line begins with `✅ Autonomous review completed…`.
6. **Blocked comment is emoji-prefixed**
   - `buildFailureComment` (or the comment emitted by `handle-stage-failure`) returns strings that start with `⚠️ Factory…` for transient infra and configuration failures.
7. **Unknown statuses fall back gracefully**
   - Passing an unmapped status (e.g., `reviewing`) to the stage formatter yields `Stage: reviewing` without an emoji, confirming the fallback behavior.
