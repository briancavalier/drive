# Automated Follow-up Issue Specification

## Summary
- Extend the post-failure handler so actionable control-plane and artifact-contract failures automatically open a structured Factory Request issue instead of stopping at a PR comment.
- Gate follow-up creation using existing failure type data plus Codex advisory scope/confidence and deterministic heuristics for known contract drift messages.
- Deduplicate by stamping each issue with a stable failure signature and skipping creation when an open issue already tracks the same signature.
- Enrich the failure comment with a pointer to any generated follow-up so operators see the backlog linkage immediately.

## Current Behavior
- `scripts/handle-stage-failure.mjs` classifies the failure, updates PR metadata, and posts a deterministic advisory comment, but does not create or reference any longer-lived tracking artifact.
- The Codex advisory (when available) is read and merged into the comment, yet its `scope` and `confidence` values are unused beyond display.
- There is no GitHub API helper for creating issues or searching for existing follow-up work; all automation ends at the blocked PR.
- Operators must manually convert recurring control-plane failures (for example, review artifact contract drift) into Factory Request issues, leading to repeated human effort and lost context.

## Proposed Changes

### Actionable Failure Detection
- Add `scripts/lib/failure-followup.mjs` exporting:
  - `classifyFollowup({ failureType, phase, action, failureMessage, advisory })` → `{ actionable: boolean, reason, category }`.
  - `buildFailureSignature(input)` to derive a lowercase SHA-256 hash over `[category, failureType, phase, normalizedMessage, advisoryScope, advisoryDiagnosis]`.
- Treat failures as **ineligible** when:
  - `failureType` is `transient_infra`, `stale_branch_conflict`, or `stale_stage_push`.
  - Advisory scope is `external` or `pr_branch` with confidence `low`.
- Treat failures as **actionable** when any of the following holds:
  - Advisory exists with `scope === "control_plane"` and confidence `medium` or `high`.
  - Advisory exists with `scope === "unclear"`, confidence `high`, and the message matches known control-plane or contract drift patterns.
  - No advisory is available, but `failureMessage` matches a curated allowlist (regex) for contract/control issues, e.g. missing canonical traceability, missing `review.json`, missing `FACTORY_*` configuration env vars, or stage push guardrails.
- Return the first matching pattern's `category` (`"control_plane"`, `"artifact_contract"`, `"configuration"`) and a reason string to aid logging/tests. This keeps decision logic testable without touching workflow code.

### Follow-up Issue Composition
- Introduce `buildFollowupIssue({ prNumber, runUrl, branch, artifactsPath, failureType, failureMessage, advisory, category, signature })` that returns `{ title, body }` matching the Factory Request template:
  - `title`: `"[Factory] Follow-up: <short summary>"` where summary truncates the advisory diagnosis or failure message to ~64 chars.
  - `body` sections aligned to the template headings with repository evidence:
    - **Problem statement**: bullet list referencing the blocked PR (`#<prNumber>`), workflow run URL, failure type, and category synopsis.
    - **Goals**: ensure control-plane issue is diagnosed, fixed, and regression-tested.
    - **Non-goals**: explicitly exclude user-branch fixes and transient incidents.
    - **Constraints**: call out the autop-run environment and requirement to preserve existing contracts.
    - **Acceptance criteria**: enumerate confirmations (e.g., automated test reproduces failure, guard added, follow-up stage succeeds).
    - **Risk**: describe impact of ignoring the issue.
    - **Affected area**: fixed to `CI / Automation`.
  - Append a hidden metadata block `<!-- factory-followup-meta: {"signature":"<hash>","source_pr":<prNumber>,"source_run":<ciRunId>} -->` so deduplication can rely on an exact marker instead of fuzzy text search.
  - Include an evidence section (e.g., bullet list) linking to the failing artifacts directory and, when present, quoting advisory diagnosis/recovery steps within 25-word limits.
- Ensure the builder gracefully handles missing advisory input by defaulting optional sections to `"N/A"` instead of throwing.

### Issue Deduplication
- Extend `scripts/lib/github.mjs` with:
  - `createIssue({ title, body, labels })`.
  - `searchIssues({ query })` that wraps `GET /search/issues` with retries.
- Add `findOpenFollowup({ signature, githubClient })` in the new follow-up module:
  - Uses `searchIssues` with `repo:<owner>/<repo> state:open "factory-followup-meta: {\"signature\":\"<hash>` and returns the first open Factory Request issue containing that metadata block.
  - Optionally verify the issue still contains the marker (guard against accidental edits) before considering it a match.
- Gate issue creation in `handle-stage-failure` when the dedupe helper returns an existing open issue; log and skip creation to avoid spam.

### Workflow Integration
- Refactor `scripts/handle-stage-failure.mjs`:
  - Accept optional dependency injection `{ githubClient, followup }` in `main` for easier testing; default to new helper implementations when not provided.
  - After building the comment and before invoking `apply-pr-state`, call the follow-up classifier. If actionable:
    - Build the signature and check for an existing open issue.
    - When no match exists, call `createIssue` with the rendered title/body and capture the new issue number.
    - Append a new section to the failure comment (simple markdown appended after `buildFailureComment` output) that references the issue (`Factory follow-up opened as #123`) and embeds the signature for traceability.
    - Pass the augmented comment to `apply-pr-state` so the PR comment exposes the linkage.
  - If creation fails (GitHub outage, permission error), log the error and continue posting the normal failure comment to avoid blocking remediation.
- Update workflow logging (e.g., `console.info`) to record whether a follow-up was created, skipped due to duplicates, or skipped as ineligible; this aids operators reviewing raw logs.

### Documentation
- Expand the README’s failure-handling section with a short description of the automated follow-up path, including the gating rules and dedup behavior so operators know when to expect new issues.
- Note that new issues still require a human to apply `factory:start` when they are ready to execute.

## Testing Strategy
- Unit tests for `scripts/lib/failure-followup.mjs` covering actionable/ineligible decisions (with and without advisory input), signature stability, and edge cases (empty messages).
- Tests in `tests/handle-stage-failure.test.mjs` (or a new suite) that stub the injected GitHub client to assert:
  - Actionable failures call `createIssue` once and append the follow-up notice to the comment.
  - Ineligible failures skip issue creation entirely.
  - Duplicate detection (mock `searchIssues` returning an open issue containing the signature) prevents new issues.
- Snapshot or golden tests for the issue body builder to ensure headings match the Factory Request template and required evidence fields are populated.
- Update existing failure comment tests if the appended follow-up section is present; ensure the original guidance remains intact.
- Maintain coverage for adverse paths (e.g., `createIssue` throws) to assert logs and fallback flows.

## Assumptions & Risks
- The repository token supplied via `FACTORY_GITHUB_TOKEN` has `issues: write`; failure to meet this requirement will surface as a logged warning while the handler continues posting comments.
- GitHub search API reliably returns the inserted metadata block; if the block is edited or removed manually, the next failure will create a new issue, which is acceptable.
- Codex advisories remain small enough that including a short quoted diagnosis in the issue body does not violate template or word-count limits.
- Regex heuristics for artifact-contract detection must stay conservative; overly broad matches could open issues for branch-specific test failures. We will document the allowlist and keep it short.

## Out of Scope
- Automatically applying `factory:start` or any other labels to the created issue.
- Auto-resolving or updating existing follow-up issues when the failure clears; humans close issues once fixes land.
- Persisting additional metadata in PR state beyond the appended comment section.
