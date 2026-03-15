# Acceptance Tests

1. **CI success triggers review stage**
   - Given a factory-managed PR whose metadata status is `implementing` or `repairing`, when the CI workflow run completes successfully, the PR loop workflow should emit an action of `review`.
   - The `mark-in-progress` job sets the PR metadata status to `reviewing`, and the stage runner executes the review prompt with the selected methodology noted in its context.

2. **Review pass promotes the PR**
   - Given `.factory/runs/<issue>/review.json` contains `decision: "pass"` with a valid schema, running `scripts/process-review.mjs` completes successfully.
   - The script updates the PR metadata status to `ready_for_review`, marks the PR as ready (if draft), clears `factory:blocked`, and posts a comment summarizing the review plus a pointer to `review.md`.

3. **Review request changes triggers repair**
   - Given `.factory/runs/<issue>/review.json` contains `decision: "request_changes"`, running `scripts/process-review.mjs` submits a GitHub review with state `REQUEST_CHANGES` using the generated markdown body.
   - The PR metadata remains `reviewing`, and the resulting `pull_request_review` event routes to the `repair` stage unless the repair attempt cap is exceeded.

4. **Methodology fallback behaves safely**
   - When `FACTORY_REVIEW_METHOD` is set to an unknown method, `scripts/build-stage-prompt.mjs` falls back to `.factory/review-methods/default` while recording the fallback in the prompt context.
   - The generated `review.json` still reports `methodology: "default"` and the review proceeds normally.

5. **Repair loop cap enforced after repeated review failures**
   - After three automated repair attempts (including those triggered by request-changes reviews), the next `routePullRequestReview` invocation returns action `blocked`, `scripts/apply-pr-state.mjs` adds the `factory:blocked` label, and automation halts until a human intervenes.
