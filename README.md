# GitHub-Native Autonomous Factory Scaffold

This repository contains a reusable first-version scaffold for a GitHub-native
autonomous software factory built around GitHub Issues, Pull Requests, GitHub
Actions, and the Codex GitHub Action.

## What it includes

- A structured issue form for factory requests
- A `factory-intake` workflow that turns a labeled issue into a draft PR with
  planning artifacts
- A `factory-pr-loop` workflow that handles implementation, autonomous review,
  CI-driven repair, and repair after `changes_requested` reviews
- A reusable stage runner that invokes `openai/codex-action`
- A minimal `CI` workflow so the repair loop has a concrete workflow target
- Node-based helper scripts and tests with no runtime dependencies
- A protected factory policy file under `.factory/FACTORY.md`
- Repo-local GitHub message template overrides under `.factory/messages/`
- A pluggable autonomous review methodology with durable `review.md` and
  `review.json` artifacts
- Automatic stale-branch refresh before implement/repair runs
- Classified transient retry handling for stage push/publication failures

## Required repository setup

Configure these before using the scaffold in a live repository:

1. Add the `OPENAI_API_KEY` repository secret.
2. Allow GitHub Actions to push branches and create pull requests.
3. Add the optional `FACTORY_GITHUB_TOKEN` repository secret if you want the
   factory to modify protected factory control-plane paths such as
   `scripts/**`, `.factory/prompts/**`, `.factory/review-methods/**`,
   `.factory/messages/**`, `.factory/FACTORY.md`, or `.github/workflows/**`.
   Create a fine-grained personal access token scoped only to this repository
   with `Contents: Read/Write`, `Pull requests: Read/Write`, `Issues: Read/Write`,
   `Workflows: Read/Write`, and `Metadata: Read`.
   Self-modifying factory issues require this secret.
4. Keep the workflow name `CI` or update the `workflow_run` trigger in
   `.github/workflows/factory-pr-loop.yml`.
5. Protect your default branch and require normal human review for merges.
6. Run the `Factory Bootstrap` workflow once to create the required labels.
7. Optional: set the shared `FACTORY_CODEX_MODEL` Actions variable if you want
   one model override for the plan, implement, and repair stages.
8. Optional: set stage-specific Actions variables to tune cost and capability
   per stage:
   `FACTORY_PLAN_MODEL`, `FACTORY_IMPLEMENT_MODEL`, `FACTORY_REPAIR_MODEL`,
   and `FACTORY_REVIEW_MODEL`.
   Stage-specific values override `FACTORY_CODEX_MODEL` for their stage.
   Defaults are `gpt-5-codex` for plan/implement/repair and
   `gpt-5-mini` for review.
9. Optional: set `FACTORY_COST_WARN_USD` and `FACTORY_COST_HIGH_USD` to tune
   the advisory low/medium/high cost bands shown on factory PRs and artifacts.
10. The stage runner executes Codex with `--full-auto` so planning, coding, and
   repair runs stay non-interactive inside GitHub Actions.
11. Optional: tune prompt budgets with the following Actions variables:
   `FACTORY_PLAN_PROMPT_MAX_CHARS`, `FACTORY_IMPLEMENT_PROMPT_MAX_CHARS`,
   `FACTORY_REPAIR_PROMPT_MAX_CHARS`, `FACTORY_REVIEW_PROMPT_MAX_CHARS`,
   and `FACTORY_PROMPT_HARD_MAX_CHARS`. The default review prompt budget is
   `8000` characters.
12. Optional: set `FACTORY_REVIEW_METHOD` to select an autonomous review
    methodology under `.factory/review-methods/<method>/instructions.md`.
    Missing or invalid values fall back to the built-in `default` rubric.
13. Optional: set `FACTORY_FAILURE_DIAGNOSIS_MODEL` to override the lightweight
    Codex model used to draft advisory failure guidance comments. Missing values
    fall back to `gpt-5-mini`.
14. Optional: set `FACTORY_ENABLE_FAILURE_DIAGNOSIS=false` to skip advisory
    Codex diagnosis for stage/review failures entirely. Deterministic failure
    types are skipped automatically even when diagnosis is enabled.
15. Factory branches are refreshed from `origin/main` automatically before
    implement/repair runs. If the merge conflicts, the PR is blocked and needs
    a human to resolve the conflict before retrying.
16. Optional: set `FACTORY_ENABLE_SELF_MODIFY=true` only when you intend to let
    a factory-managed PR modify protected control-plane paths. The PR must also
    carry the `factory:self-modify` label, and `FACTORY_GITHUB_TOKEN` must be
    configured. Without all three, self-modifying stage output is rejected
    before push.

## Factory operator flow

1. Open a "Factory Request" issue from a trusted collaborator account with `write`, `maintain`, or `admin` access.
2. Comment `/factory start` on the issue from a trusted collaborator account with `write`, `maintain`, or `admin` access.
3. Review the generated draft PR and its planning artifacts.
4. Comment `/factory implement` on the PR to start coding.
5. Review the ready-for-review PR and merge manually when satisfied.

For public repositories, maintainers cannot sponsor outsider-authored factory issues into execution. Intake now requires both the issue author and the actor commenting `/factory start` to be trusted collaborators. Factory automation also ignores fork-backed pull requests entirely, so outsider PRs cannot trigger implement, repair, or review stages.

## Autonomous review stage

After CI succeeds on a factory-managed pull request, the loop enters a dedicated
`review` stage. The stage loads the methodology specified by the
`FACTORY_REVIEW_METHOD` Actions variable (falling back to `default`) and
instructs the agent to produce two durable artifacts inside the run directory:

- Available methodologies:
  - `default` — general-purpose rubric covering correctness, coverage, regression risk, safety, and scope.
  - `workflow-safety` — workflow automation rubric focused on least-privilege permissions, trigger safety, secret handling, self-modifying logic, branch protections, and validation evidence for workflow changes.
- Set `FACTORY_REVIEW_METHOD=workflow-safety` (for example in the workflow `env` block or repository variables) when reviewing `.github/workflows/**` or automation control-plane changes. Leave it unset to keep the default behavior.
- The selected methodology is embedded into the review prompt, and `review.json` must declare the same `methodology` value; mismatches fail validation.

- `review.md` — human-readable summary with decision and findings first, plus a
  canonical traceability section rendered with collapsible `<details>` blocks.
  Each `<summary>` now lists per-status counts (❌/⚠️/✅/⬜), and every
  requirement bullet leads with an emoji-backed status label followed by
  per-item **Evidence** bullets to improve scanability inside GitHub comments.
- `review.json` — machine-readable decision payload with severity-classified
  findings plus required `requirement_checks` linking requirements to evidence.

If the autonomous review issues a `pass` decision, the workflow promotes the PR
to `ready_for_review`, clears `factory:blocked`, marks the PR ready, and posts a
summary comment referencing the artifacts. When the decision is
`request_changes`, the workflow submits a GitHub `REQUEST_CHANGES` review using
the generated markdown so the existing repair loop can act on the feedback automatically.
That review body keeps blocking findings and unmet requirement checks visible at
the top, with traceability and the full review tucked into collapsible sections
for humans.

A passing review now means every traced requirement is either `satisfied` or
explicitly `not_applicable`; partial or unmet requirement checks must request
changes.

## Artifact contract

The scaffold keeps durable factory history in-repo under `.factory/runs/<issue>/`.
Only these files are allowed to persist there:

- `approved-issue.md`
- `spec.md`
- `plan.md`
- `acceptance-tests.md`
- `repair-log.md`
- `cost-summary.json`
- `review.md`
- `review.json`

Provider-native usage telemetry is stored separately as immutable event files
under `.factory/usage-events/YYYY-MM-DD/*.json`, and derived repo-wide
calibration data is written to `.factory/usage-calibration.json`.

All files under `.factory/tmp/**` are scratch space only. Stage push validation
and CI both reject added or modified temp artifacts, while allowing cleanup
deletions.

The immutable `approved-issue.md` snapshot is written during intake and becomes
the authoritative request body for all later plan, implement, repair, and
review stages. Edits to the live GitHub issue after intake do not affect stage
prompts.

Protected factory control-plane paths are locked by default:

- `scripts/**`
- `.factory/prompts/**`
- `.factory/review-methods/**`
- `.factory/messages/**`
- `.factory/FACTORY.md`
- `.github/workflows/**`

If a factory run touches any of those paths, the stage will stop before
`git push` unless all of the following are true:

- the repository variable `FACTORY_ENABLE_SELF_MODIFY` is enabled
- the live PR currently has the `factory:self-modify` label
- `FACTORY_GITHUB_TOKEN` is configured

This gate is checked from live PR state during stage preparation, so removing
the label or disabling the variable immediately re-locks later reruns.

The factory also supports a protected cross-run policy file at
`.factory/FACTORY.md`. This file is human-authored durable factory policy,
loaded into stage prompts as trusted control-plane context from reviewed
`origin/main`, and is not part of the per-run artifact set.

Prompt precedence tiers for unattended runs are:

1. Stage prompt templates and enforced control-plane logic
2. `.factory/FACTORY.md`
3. Stage-specific task context, including current-run artifacts under `.factory/runs/<issue>/` and live evidence such as CI results or review feedback

The exact ordering within stage-specific task context is stage-dependent and is
defined in `scripts/build-stage-prompt.mjs`.

Existing `AGENTS.md` files remain advisory for human/Codex workspace use and
are not auto-ingested into unattended stage prompts.

When prompt budgets are tight, factory policy is additive only: it is trimmed
or dropped before request-specific issue, artifact, and evidence context.

If a factory-managed PR gets stuck in the wrong state, run `Factory Reset PR`
from the Actions tab to restore it to `plan_ready`, clear stale repair
counters, and convert it back to draft before retrying `/factory implement`.

The stage runner automatically retries known transient infrastructure failures
such as GitHub API/network push errors before blocking the PR. Exhausted
transient retries are recorded in the PR metadata as `lastFailureType` and
`transientRetryAttempts`.

Factory stages also write an advisory `cost-summary.json` artifact and surface a
three-band emoji cost estimate in the PR status. These values are heuristic
estimates, not billed usage. The canonical telemetry now lives in immutable
provider-native usage event files under `.factory/usage-events/`, one JSON file
per Codex invocation. These event files cover both stage runs and failure
diagnosis runs, and record provider/model metadata, estimated usage buckets,
optional actual usage buckets, derived USD, and calibration metadata. The
per-issue `.factory/runs/<issue>/cost-summary.json` file remains as a derived
operator-facing summary for PR status and artifact browsing.

When you have reliable billing data for a stage or diagnosis run, update the
corresponding usage event with observed usage buckets. After backfilling any
entries, run the calibration helper:

```bash
node scripts/calibrate-usage-estimates.mjs
```

The script scans `.factory/usage-events/**`, computes per-provider usage-bucket
correction factors, and writes them to `.factory/usage-calibration.json`
(tracked in-repo). Cost estimation automatically loads this file on subsequent
runs and reports which multiplier bucket was applied so you can confirm that
historical data is being used. Entries without actual usage remain in the event
history but are ignored by the calibration pass, so partial backfills are safe.

When stage/review failures block a PR, the failure comment now includes a
stable "Where to look" section with the failing Factory PR Loop run, branch,
relevant artifact links, and deterministic recovery guidance. When available, a
lightweight Codex advisory is appended to explain likely scope and next steps
without changing the underlying state-transition rules.

Actionable control-plane or artifact-contract failures now trigger an automatic
Factory Request issue so recurring outages get durable tracking:

- Follow-up creation is gated by the Codex advisory scope/confidence plus a small allowlist of control-plane and contract drift messages; transient infrastructure or branch-local problems are ignored.
- Every follow-up issue includes the blocked PR number, workflow run link, failure category, and artifacts evidence, along with a hidden signature used for deduplication.
- If an open issue already carries the same signature, the factory skips creation and simply references the existing issue in the failure comment.
- The failure comment always notes the issue that captured the follow-up, putting operators one click away from the backlog entry.
- Newly opened issues still require a human to comment `/factory start` when execution is ready to resume.

Stage runs now distinguish between no-op outputs and setup prerequisites:

- `stage_noop` failures capture a clean working tree after Codex runs; the failure comment links a diagnostics block (commit distance, staged/worktree counts, sample file list) and the factory tracks `stageNoopAttempts`. After two consecutive no-op runs the PR is marked `blocked` and automated retries stop.
- `stage_setup` failures wrap guardrail messages (missing `FACTORY_GITHUB_TOKEN`, absent workflow artifacts, etc.) with the same diagnostics summary so operators can fix the prerequisite without re-running diagnosis. Recovered runs reset both counters to zero.

## Labels

Command execution is comment-driven. Labels now reflect durable projected state or explicit authorization; they do not start work.

The workflows create and manage these labels automatically:

- `factory:managed`
- `factory:self-modify`
- `factory:plan-ready`
- `factory:blocked`
- `factory:paused`
- `factory:intake-rejected` (intake was rejected before planning; the issue needs updates)
- `factory:cost-low`
- `factory:cost-medium`
- `factory:cost-high`

## Factory Dashboard

Every factory-managed pull request now opens with a concise **Factory Dashboard**
section. The dashboard combines the previous control panel and status bullets into
a two-column Markdown table with blank headers. The left column lists bold labels
(`State`, `Owner`, `Stage`, `CI`, `Repairs`, `Cost`, `Estimate`, `Next`), while the
right column renders emoji-enhanced values with standardized `—` fallbacks. Pause
or block reasons append to the State row, and the Next row repeats the recommended
operator guidance.

Two inline lines sit directly under the table:
- `**Open:**` surfaces read-only navigation such as the latest run, review artifacts,
  and other informational links, separated by ` · `.
- `**Actions:**` lists state-changing workflow links; each entry ends with
  `*(state change)*` to call out mutations.

Artifacts remain durable under `## Artifacts`, now grouped by workflow phase
(`Plan`, `Execution`, `Review`) with inline link lists. This separation keeps
navigational links and mutation controls easy to scan while preserving the serialized
`factory-state` comment for automation.

## GitHub message templates

Factory-posted GitHub messages use built-in markdown templates and can be
overridden repo-locally by adding files under `.factory/messages/`.

Supported override files:

- `pr-body.md`
- `plan-ready-issue-comment.md`
- `intake-rejected-comment.md`
- `review-pass-comment.md`
- `review-request-changes.md`

The renderer supports simple `{{TOKEN}}` replacement only. Unknown tokens or
missing required tokens cause the override to be ignored with a warning, and
the factory falls back to the built-in template for that message.

Common tokens include:

- identifiers such as `ISSUE_NUMBER`, `PR_NUMBER`, `BRANCH`, and `ARTIFACTS_PATH`
- status values such as `STATUS`, `CI_STATUS`, `REPAIR_ATTEMPTS`, and
  `MAX_REPAIR_ATTEMPTS`
- review values such as `REVIEW_METHOD`, `REVIEW_SUMMARY`, and
  `BLOCKING_FINDINGS_COUNT`

Composite tokens include:

- `DASHBOARD_SECTION`
- `ARTIFACTS_SECTION`
- `OPERATOR_NOTES_SECTION`
- `REVIEW_MARKDOWN`

Required-token policy:

- `pr-body.md` must include `{{DASHBOARD_SECTION}}`, `{{ARTIFACTS_SECTION}}`, and `{{OPERATOR_NOTES_SECTION}}`
- `review-request-changes.md` must include `{{REVIEW_MARKDOWN}}`
- the other message templates do not require specific tokens

Protocol-critical behavior stays in code:

- the hidden `factory-state` metadata comment is always appended to PR bodies by
  the renderer
- request-changes truncation behavior remains code-owned
- artifact link generation remains code-owned
- the metadata JSON includes `pendingReviewSha` when a review commit is waiting
  for delivery so routers can ignore the immediate CI completion from that same
  commit

Example `pr-body.md` override:

```md
# Custom Factory Run

Issue: #{{ISSUE_NUMBER}}

{{DASHBOARD_SECTION}}

{{ARTIFACTS_SECTION}}

{{OPERATOR_NOTES_SECTION}}
```

## Local validation

Run the local test suite:

```bash
npm test
```
