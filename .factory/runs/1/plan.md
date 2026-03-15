# Implementation Plan

## Work Breakdown
1. **Extend routing and metadata support**
   - Update `scripts/lib/event-router.mjs` to emit a `review` action on green CI runs and to accept reviews while metadata status is `reviewing`.
   - Adjust associated tests in `tests/event-router.test.mjs` to cover the new action and status handling.
   - Ensure `scripts/apply-pr-state.mjs` can set the status to `reviewing` when triggered by the review stage.

2. **Wire the review stage into the PR loop workflow**
   - Modify `.github/workflows/factory-pr-loop.yml` so the `mark-in-progress` and `stage` jobs run when `action == 'review'`.
   - Add a `process-review` job that checks out the branch post-stage, runs Node 24, and executes the new processing script with the necessary environment variables.
   - Pass the resolved methodology name through workflow outputs or env so downstream steps know which rubric was used.

3. **Add review methodology assets**
   - Create `.factory/prompts/review.md` describing the stage rules, required artifacts, and JSON schema.
   - Add `.factory/review-methods/default/instructions.md` with the default rubric (correctness, acceptance criteria, regression risk, testing, safety, scope control, severity guidance).

4. **Enhance prompt builder for review mode**
   - Update `scripts/build-stage-prompt.mjs` to:
     - Recognize `FACTORY_MODE=review` and include review-specific context (methodology instructions, artifact reminders).
     - Resolve the methodology directory based on `FACTORY_REVIEW_METHOD`, falling back to `default` with a logged note.
     - Make the selected methodology name available to the stage prompt (e.g., as a placeholder replacement).

5. **Implement review post-processing**
   - Add `scripts/process-review.mjs` that reads `.factory/runs/<issue>/review.json`, validates it, and branches on the decision.
   - For `decision=pass`, invoke `scripts/apply-pr-state.mjs` (via module import or child process) to mark the PR `ready_for_review`, clear `factory:blocked`, and post a summary comment referencing `review.md`.
   - For `decision=request_changes`, call a new helper in `scripts/lib/github.mjs` to submit a body-only `REQUEST_CHANGES` review using the rendered markdown.
   - Ensure failures (missing files, invalid schema) cause the script to exit non-zero.

6. **Expand GitHub helper utilities and tests**
   - Add `submitPullRequestReview` (or similar) to `scripts/lib/github.mjs` for reusable review submission logic.
   - Write focused tests for `process-review.mjs` (e.g., using `node:test` with mocked fetch) covering pass, request-changes, schema validation, and methodology fallback detection.
   - Extend existing fixtures or add new ones under `tests/fixtures` as needed for review JSON samples.

7. **Documentation updates**
   - Update `README.md` (or a dedicated doc) to explain the new review stage, `FACTORY_REVIEW_METHOD` variable, artifact outputs, and the repair loop interaction.

## Dependencies & Notes
- `process-review.mjs` depends on the review artifacts committed by the stage run; ensure the workflow job runs after the stage push.
- The methodology fallback should be visible to operators (e.g., via console log or comment) so misconfiguration is diagnosable.
- Keep the implementation backward-compatible: repositories without the new variable still use the default methodology automatically.
