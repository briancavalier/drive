# Autonomous Review Stage Specification

## Summary
- Introduce a first-class autonomous `review` stage that runs after green CI on factory-managed pull requests and gates hand-off to human reviewers.
- Make the review methodology repository-configurable with a default rubric and emit durable review artifacts (`review.md` and `review.json`).
- Automate the routing that marks PRs ready when the review passes or files a `REQUEST_CHANGES` review that feeds the existing repair loop.

## Current Behavior
- `factory-pr-loop` routes successful CI runs directly to the `ready_for_review` state and marks the PR ready for humans.
- There is no automated review to compare the implementation against the spec/plan/acceptance tests or current diff.
- The repair loop only re-runs when CI fails or when a human submits a `changes_requested` review.

## Proposed Changes

### Stage Routing and Status Flow
- Extend `scripts/lib/event-router.mjs` so a successful CI workflow on a managed branch yields an action of `review` instead of `ci-success`.
- Allow `routePullRequestReview` to process events while the PR metadata status is `"reviewing"` (in addition to the existing states) so automated reviews can trigger repairs.
- Update `scripts/apply-pr-state.mjs` to understand the `review` stage by setting the PR metadata status to `reviewing` when the stage begins.
- Adjust `.github/workflows/factory-pr-loop.yml` so:
  - The `mark-in-progress` job runs for the `review` action and sets the metadata status to `reviewing` without clearing the `factory:implement` label (the label should already be absent).
  - The shared stage runner (`_factory-stage.yml`) is invoked with `mode: review`.
  - A new `process-review` job runs after the stage finishes to interpret `review.json` and perform GitHub-side updates.

### Review Methodology Selection
- Load the active methodology name from the GitHub Actions variable `FACTORY_REVIEW_METHOD`. Treat empty or missing values as `default`.
- Store methodologies under `.factory/review-methods/<method>/`. Each method directory must at minimum provide an `instructions.md` file describing the rubric and any structured prompts.
- Enhance `scripts/build-stage-prompt.mjs` to:
  - Accept a `review` mode that embeds methodology instructions and identifies the active method in the prompt context.
  - Fall back to `.factory/review-methods/default/` when the configured method is missing or unreadable, logging the fallback in the prompt so the stage run records which rubric is in effect.

### Review Prompt and Outputs
- Add a new stage template `.factory/prompts/review.md` that:
  - Directs the stage to read the spec, plan, acceptance tests, repair log, and review methodology instructions.
  - Requires generation of both `.factory/runs/<issue>/review.md` (human-readable summary) and `.factory/runs/<issue>/review.json` (machine-readable contract).
  - Describes the expected JSON schema, including allowed `decision` values (`pass` or `request_changes`) and required fields.
  - Advises the reviewer to examine the git diff, test coverage, acceptance criteria alignment, regression risk, and security considerations from the methodology.

### Review Artifact Contract
- Define the structure of `review.json` as:
  ```json
  {
    "methodology": "<active-method>",
    "decision": "pass" | "request_changes",
    "summary": "<plain language overview>",
    "blocking_findings_count": <integer>,
    "findings": [
      {
        "level": "blocking" | "non_blocking",
        "title": "<short name>",
        "details": "<what was found>",
        "scope": "<files/tests impacted>",
        "recommendation": "<follow-up guidance>"
      }
    ]
  }
  ```
  - Additional optional fields (e.g., `notes`) are permitted but the required keys must always be present.
  - The stage must keep `blocking_findings_count` in sync with the number of `findings` whose `level` is `blocking`.
- `review.md` should mirror the same information in a reviewer-friendly layout (e.g., Summary, Blocking Findings, Non-Blocking Findings, Methodology Used).

### Automated Post-Review Handling
- Create `scripts/process-review.mjs` to read the review artifacts and drive GitHub updates:
  - Validate that `review.json` exists, parses correctly, references the active methodology, and satisfies the schema (including field types and decision values).
  - When `decision === "pass"`:
    - Update the PR metadata to `ready_for_review`, set the CI status to `success`, and mark the PR as ready (remove draft) while clearing `factory:blocked` if present.
    - Post a PR comment summarizing the review outcome with a link to the durable artifacts (`review.md`).
  - When `decision === "request_changes"`:
    - Submit a body-only `REQUEST_CHANGES` review whose body is derived from the generated `review.md` (or a condensed summary when necessary).
    - Leave the PR in the `reviewing` status so the downstream `pull_request_review` event triggers the repair loop via `routePullRequestReview` and increments repair accounting.
  - Fail fast with a non-zero exit when artifacts are missing or invalid so the workflow run stops instead of silently skipping review.

### Workflow Integration
- Update `factory-pr-loop.yml` to add a `process-review` job that:
  - Checks out the branch after the review stage push.
  - Runs `node scripts/process-review.mjs` with environment variables for issue/pr numbers, artifacts path, branch, and the resolved methodology (carried forward for validation).
  - Surfaces any script failure to the workflow log for operator visibility.
- Ensure repair-attempt accounting still caps at three iterations by reusing existing metadata fields and the `nextRepairState` helper (no additional counters introduced).

### Default Review Methodology
- Add `.factory/review-methods/default/instructions.md` with a rubric covering:
  - Correctness against the spec and plan deliverables.
  - Coverage of acceptance criteria and regression risks.
  - Adequacy of automated tests and CI evidence.
  - Security and safety considerations (dependency changes, sensitive operations).
  - Scope control (no out-of-scope changes, appropriate documentation updates).
- Include guidance for how findings should be classified as blocking vs. non-blocking and how to document missing evidence.

### Documentation Updates
- Update `README.md` (or a dedicated docs section) to describe the new review stage, configurable methodology variable, generated artifacts, and the repair loop interaction.

## Out of Scope
- Inline GitHub review comments or per-file annotations.
- Executable plugins or external services for reviews.
- Dynamic per-PR methodology selection.
- Automatic merge or deploy behaviors.

## Assumptions & Questions
- GitHub repository variables support the `FACTORY_REVIEW_METHOD` configuration and are accessible from workflows; if unavailable, the system defaults safely to `default`.
- The review stage runs with the same permissions as existing stages, sufficient for reading artifacts and pushing commits.
- Automated review bodies can be generated directly from `review.md` without additional templating; if formatting adjustments are needed, they can be handled inside `process-review.mjs`.
- Existing repair attempt metadata (`repairAttempts`, `repeatedFailureCount`) remains authoritative; no extra persistence is needed.
