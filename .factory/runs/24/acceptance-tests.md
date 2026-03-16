# Acceptance Tests

1. **Stage status shows mapped emoji**
   - Given PR metadata with `status: "implementing"`, rendering the PR body yields a `- Stage: 🏗️ implementing` line.
2. **CI status shows mapped emoji**
   - Given `ciStatus: "success"`, the PR body contains `- CI: ✅ success` while preserving the rest of the status block.
3. **Operator notes use required cues**
   - Rendering the PR body shows the start/resume instruction prefixed with `▶️` and the pause instruction prefixed with `⏸️`.
4. **Plan-ready comment is emoji-prefixed**
   - `renderPlanReadyIssueComment` returns copy beginning with `👀` followed by the existing guidance text.
5. **Ready-for-review comment is emoji-prefixed**
   - `renderReviewPassComment` returns a message whose first line starts with `✅` and still includes the methodology and summary.
6. **Failure comments are emoji-prefixed**
   - `buildFailureComment` (as exported for testing) returns text beginning with `⚠️` for configuration and transient failure scenarios.
7. **Unmapped stage values stay readable**
   - Rendering the PR body with `status: "reviewing"` leaves the stage line without an emoji, confirming the fallback behavior.
