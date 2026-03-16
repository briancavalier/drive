# Commit Message Generation Specification

## Summary
- Replace the hard-coded `factory(<mode>): issue #<n>` commit subject with a concise summary that reflects the staged changes while retaining the stage prefix.
- Derive the summary deterministically from staged file metadata, stage mode, and locally available issue context (branch name or artifacts) without any model calls.
- Guarantee that repair-stage commits mention the issue number and that all commits fall back to an informative slug when no high-signal files are detected.
- Introduce focused tests that lock in commit message behavior for implement, repair, fallback, and truncation scenarios.

## Current Behavior
- `scripts/prepare-stage-push.mjs` stages all changes and commits with `factory(<mode>): issue #<issueNumber>`.
- The message never reflects what changed, forcing reviewers to open the diff to understand the commit.
- Repair commits do not indicate the issue they address beyond the generic number, and there is no testing around commit subject generation.

## Proposed Changes

### Commit Summary Library
- Add `scripts/lib/commit-message.mjs` exporting a `buildCommitMessage(options)` helper and supporting utilities.
- `buildCommitMessage` inputs:
  - `mode` (string), `issueNumber` (number), `branch` (string), and optionally `issueTitle` (string).
  - `stagedDiff` populated via `git diff --cached --name-status`.
  - Optional maximum length (default 60 characters for the summary portion).
- Parse `stagedDiff` with `parseChangedFiles` (reuse from `scripts/lib/stage-push.mjs`) to obtain `{ status, path }[]` entries. Handle rename/copy entries by keeping only the destination path.
- Filter out temporary artifacts (`.factory/tmp/**`) and ignore generated files such as `package-lock.json` if present. Retain planning artifacts under `.factory/runs/<issue>/` because they are meaningful during plan/finalize stages.

### Descriptor Extraction Heuristics
- Classify each path into buckets with weights used to pick descriptors:
  - `code` (weight 3): default for `.js`, `.ts`, `.mjs`, `.cjs`, `.json` (outside `.factory/runs/`), workflow files, etc.
  - `tests` (weight 2): files under `tests/`, `__tests__/`, or with `.test.` / `.spec.` in the basename.
  - `docs` (weight 1): `.md`, `.mdx`, `.rst`, `README.*` outside `.factory/runs/`.
  - `artifacts` (weight 1): `.factory/runs/<issue>/spec.md`, `plan.md`, `acceptance-tests.md`, `repair-log.md`.
- For each entry derive a human-readable descriptor:
  - For known planning artifacts, map to fixed phrases (`spec`, `plan`, `acceptance tests`, `repair log`).
  - For tests, map to `<base descriptor> tests` where `<base descriptor>` strips suffixes like `.test` and converts kebab/camel case to words.
  - For other files, choose the most specific informative segment: prefer the basename (without extension). If the basename is generic (`index`, `main`, `default`), fall back to the immediate parent directory.
  - Convert kebab, snake, camel casing to lowercase words separated by spaces; collapse multiple spaces.
- Aggregate descriptors by identical phrase and bucket, keeping counts per status. Pick up to two descriptors ordered by:
  1. Highest bucket weight; tie-breaker on summed file counts, then lexical order.
  2. Merge `tests` descriptors referring to the same base as a primary `code` descriptor so they render as “<primary> with tests”.

### Verb & Message Composition
- Determine the leading verb for each commit:
  - If all relevant statuses are `A`, use `add`.
  - If all are `D`, use `remove`.
  - If any `R` or mix of `A/M/D`, use `update`.
- Compose the summary text as: `<verb> <descriptor>` for one descriptor, or `<verb> <descriptor1> and <descriptor2>` when two high-signal descriptors exist.
- If associated tests were merged with a primary descriptor, render “<verb> <descriptor> with tests”.
- Apply ASCII-only ellipsis if the summary exceeds the maximum length: truncate to `maxLength - 3` and append `...`.
- Always prefix the Git commit subject with `factory(<mode>): `.
- For repair mode, append ` for issue #<issueNumber>` before applying truncation to guarantee the issue reference.

### Fallback Handling
- When no descriptors survive filtering (e.g., only tooling metadata changed), fall back to an issue-derived slug:
  - Prefer `issueTitle` if provided; otherwise use the branch suffix after `factory/<issue>-` when it matches, cleaned via `slugifyIssueTitle`.
  - If neither yields a result, fall back to `issue-<issueNumber>`.
  - Use the fallback slug with the chosen verb (`update <slug>` for mixed changes).
- Ensure fallback summaries still respect length and repair mode rules.

### Stage Commit Script Updates
- Update `scripts/prepare-stage-push.mjs`:
  - Collect staged diff metadata once staging is complete.
  - Call `buildCommitMessage` with `{ mode, issueNumber, branch: env.FACTORY_BRANCH, stagedDiff }` and use the result for `git commit -m`.
  - Log the chosen summary (e.g., `console.log("Factory commit summary: ...")`) for observability without altering outputs.
  - Maintain existing error handling, remote checks, and outputs from `evaluateStagePush`.

### Testing
- Add `tests/commit-message.test.mjs` covering:
  - Implement-stage update touching code and corresponding tests (`update prepare stage push with tests`).
  - Repair-stage change touching a workflow file, verifying the issue suffix (`... for issue #18`).
  - Fallback behavior when only planning artifacts change, confirming branch slug usage.
  - Truncation when descriptors plus issue suffix exceed the limit.
  - Rename handling (rename entry yields descriptor from destination path).
- Extend tests to exercise verb selection (`add`, `remove`, `update`) and ensure ellipsis logic uses ASCII `...`.

## Assumptions & Questions
- Branch names will continue to follow `factory/<issue>-<slug>`; otherwise the fallback slug may degrade to `issue-<n>`.
- `git diff --cached --name-status` is available in the stage environment and reflects the staged commit accurately.
- Planning artifacts remain under `.factory/runs/<issue>/`; if their location changes, descriptor mapping updates will be required.
- Existing stage scripts tolerate console logging without breaking automation.
- No additional authentication is required because commit summary generation relies solely on local repository state.
