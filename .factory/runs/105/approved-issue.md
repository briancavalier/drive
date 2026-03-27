## Problem statement

Factory PR review comments do not currently use the same dashboard-first structure as factory PR descriptions. The current review format mixes short summary content with long detail sections, which makes the first screen harder to scan and reduces consistency across factory-generated GitHub surfaces.

The first attempt at this redesign added too much change at once and retained duplicated metadata from the legacy template, especially repeated methodology, summary, and artifact information. We need a smaller, cleaner revision that starts from the current `origin/main` review template behavior and adds only the new `Factory Review` summary block plus the minimum follow-on cleanup required to avoid duplication.

## Goals

- Add a new top-level `## Factory Review` section to both PASS and REQUEST_CHANGES review templates.
- Make the top summary block compact and scannable, with bold labels for `Summary`, `Findings`, and `Artifacts`.
- Put the decision/method line on its own line, followed by a blank line before the bold summary labels.
- Show methodology only once in the new `Factory Review` section.
- Preserve room for long review evidence, but keep the first visible screen short and readable.
- Keep PASS and REQUEST_CHANGES review templates structurally consistent in visible headings and ordering.
- Retain direct linked artifact references to `review.md` and `review.json` inside the new `Factory Review` section.
- Remove the redundant `Full Review` section from the posted review body.
- Preserve the current contract that the posted PR review/comment body matches the content of `review.md`, with only the intentional template framing needed for the new top section.
- Flatten the `Traceability` presentation so it uses a single `<details>` block without nested `<details>` sections or a repeated inner `Traceability` heading.

## Target template shape

PASS:

```md
## Factory Review

**✅ PASS** · Method: `{{REVIEW_METHOD}}`

**Summary:** {{REVIEW_SUMMARY}}
**Findings:** Blocking `{{BLOCKING_FINDINGS_COUNT}}` · Requirement gaps `{{UNMET_REQUIREMENT_CHECKS_COUNT}}`
**Artifacts:** [review.md]({{REVIEW_MARKDOWN_URL}}) · [review.json]({{REVIEW_JSON_URL}})

### Blocking Findings

{{BLOCKING_FINDINGS_SUMMARY}}

### Requirement Gaps

{{UNMET_REQUIREMENT_CHECKS_SUMMARY}}

<details>
<summary>🧭 Traceability</summary>

{{TRACEABILITY_FLAT_DETAILS}}

</details>
```

REQUEST_CHANGES:

```md
## Factory Review

**❌ REQUEST_CHANGES** · Method: `{{REVIEW_METHOD}}`

**Summary:** {{REVIEW_SUMMARY}}
**Findings:** Blocking `{{BLOCKING_FINDINGS_COUNT}}` · Requirement gaps `{{UNMET_REQUIREMENT_CHECKS_COUNT}}`
**Artifacts:** [review.md]({{REVIEW_MARKDOWN_URL}}) · [review.json]({{REVIEW_JSON_URL}})

### Blocking Findings

{{BLOCKING_FINDINGS_SUMMARY}}

### Requirement Gaps

{{UNMET_REQUIREMENT_CHECKS_SUMMARY}}

{{FULL_BLOCKING_FINDINGS_DETAILS}}

<details>
<summary>🧭 Traceability</summary>

{{TRACEABILITY_FLAT_DETAILS}}

</details>
```

## Rendered examples

PASS example:

```md
## Factory Review

**✅ PASS** · Method: `workflow-safety`

**Summary:** The workflow-state changes are internally consistent, cleanup paths are covered, and the updated tests provide evidence for every acceptance criterion.
**Findings:** Blocking `0` · Requirement gaps `0`
**Artifacts:** [review.md](https://github.com/briancavalier/drive/blob/factory/105-example/.factory/runs/105/review.md) · [review.json](https://github.com/briancavalier/drive/blob/factory/105-example/.factory/runs/105/review.json)

### Blocking Findings

None.

### Requirement Gaps

None.

<details>
<summary>🧭 Traceability</summary>

### Acceptance Criteria (✅ 3)

- ✅ **Satisfied**: Add the new `Factory Review` section to the posted review template.
  - **Evidence:** `scripts/templates/github-messages/review-pass-comment.md` renders the new section first.
  - **Evidence:** `scripts/templates/github-messages/review-request-changes.md` renders the same top section shape.
- ✅ **Satisfied**: Keep the initial visible content compact and scannable.
  - **Evidence:** Decision, method, summary, counts, and artifact links all appear before any long detail.
- ✅ **Satisfied**: Remove redundant legacy review metadata below the new section.
  - **Evidence:** The posted body does not repeat the old autonomous decision line, duplicate summary line, or trailing artifact footer.

### Spec Commitments (✅ 2)

- ✅ **Satisfied**: PASS and REQUEST_CHANGES use the same visible headings and ordering.
  - **Evidence:** Both templates render `Factory Review`, `Blocking Findings`, `Requirement Gaps`, and `Traceability` in the same order.
- ✅ **Satisfied**: Artifact references remain directly accessible.
  - **Evidence:** The `Artifacts` line links to both `review.md` and `review.json`.

</details>
```

REQUEST_CHANGES example:

```md
## Factory Review

**❌ REQUEST_CHANGES** · Method: `workflow-safety`

**Summary:** The new `Factory Review` section is present, but the current rendering still leaves duplicated legacy metadata in the posted body and does not fully match the intended dashboard-first format.
**Findings:** Blocking `2` · Requirement gaps `2`
**Artifacts:** [review.md](https://github.com/briancavalier/drive/blob/factory/105-example/.factory/runs/105/review.md) · [review.json](https://github.com/briancavalier/drive/blob/factory/105-example/.factory/runs/105/review.json)

### Blocking Findings

- The posted review body still includes the legacy autonomous decision line below the new `Factory Review` block.
- The posted review body still appends a standalone artifact footer after the detailed sections.

### Requirement Gaps

- The `Artifacts` line is still rendered as plain code spans instead of clickable links.
- The decision/method line is not separated from the summary block by a blank line.

<details>
<summary>Blocking finding details</summary>

### Legacy decision line still rendered

- Scope: Posted PASS and REQUEST_CHANGES review bodies.
- Details: The new top summary block is present, but the old `Autonomous review completed...` / `Autonomous review decision...` line is still included immediately afterward, which duplicates decision and methodology.
- Recommendation: Remove the legacy line entirely once the `Factory Review` section is rendered.

### Standalone artifact footer still rendered

- Scope: Review comment/review body assembly.
- Details: `review.md` and `review.json` are already exposed in the new `Artifacts` line, but the body still ends with a separate artifact footer, which repeats the same information and adds clutter.
- Recommendation: Remove the trailing artifact list from the posted body when the top section already links both artifacts.

</details>

<details>
<summary>🧭 Traceability</summary>

### Acceptance Criteria (❌ 4)

- ✅ **Satisfied**: Add the new `Factory Review` section to the posted review template.
  - **Evidence:** The rendered body begins with `## Factory Review`.
- ❌ **Not satisfied**: Remove the legacy autonomous decision line below the new section.
  - **Evidence:** The rendered body still contains the old decision line after the new summary block.
- ❌ **Not satisfied**: Remove the trailing standalone artifact list.
  - **Evidence:** The rendered body still ends with a separate artifact footer.
- ❌ **Not satisfied**: Render artifact references as clickable links.
  - **Evidence:** The artifacts are shown as code-formatted paths rather than Markdown links.

### Spec Commitments (❌ 2)

- ✅ **Satisfied**: PASS and REQUEST_CHANGES use the same visible headings and order.
  - **Evidence:** Both rendered examples follow the same section layout.
- ❌ **Not satisfied**: Keep the top block compact and non-duplicative.
  - **Evidence:** Repeated decision/methodology and artifact information still appears below the top block.

</details>
```

## Required cleanup from the current template

- Remove the legacy line that starts with `Autonomous review completed...` or `Autonomous review decision...` below the new `Factory Review` block.
- Remove the duplicated plain `Summary:` line that currently appears again below the legacy header.
- Remove the trailing standalone artifact list at the bottom of the posted GitHub review/comment body once artifact links are present in the new `Factory Review` block.
- Remove duplicate methodology rendering outside the new `Factory Review` block.
- Update review authoring instructions so `review.md` no longer asks the reviewer to include a separate methodology line when that information is already rendered by the control-plane template.
- Remove the redundant `Full Review` section from the posted review/comment body.
- Keep the posted review/comment body aligned with `review.md` so the artifact remains the durable source for what was posted to GitHub.
- Flatten nested traceability disclosure so the posted body uses a single `Traceability` details block.

## Non-goals

- Redesigning the PR body / dashboard template itself.
- Changing review methodology, review artifact schemas, or review decision semantics.
- Changing slash commands, labels, or PR state transitions.
- Adding additional dashboard sections beyond the new `Factory Review` summary block and the minimum cleanup needed to avoid duplication.
- Rewriting the contents of `review.md` beyond removing duplicated methodology expectations from authoring guidance.

## Constraints

- Keep the PASS and REQUEST_CHANGES templates aligned in heading names and overall layout.
- Do not add an explicit `At a Glance` heading; the compact summary block should imply that role through formatting.
- Keep the initial visible content compact and move long supporting content into `<details>` sections.
- Preserve compatibility with the template token system and existing artifact paths.
- The resulting templates should still work well when sections like blocking findings or requirement gaps are empty.
- The methodology must appear in the posted review body only inside the new `Factory Review` section.
- The decision/method line must be visually separated from the following summary block by a blank line.
- The `Artifacts` line must render clickable links to `review.md` and `review.json`.
- `Traceability` is the default deep-detail section; do not add a separate `Full Review` section.
- The posted review/comment body must stay aligned with `review.md` rather than becoming an independently authored summary that can drift.
- `Traceability` must render as one flat `<details>` block, not nested disclosure blocks.

## Acceptance criteria

- The default factory review templates are updated to the target structure above, with bold labels in the summary block.
- Both PASS and REQUEST_CHANGES review templates use the same visible section headings and ordering.
- The top block clearly shows decision, method, summary, findings counts, and artifact paths before any long content.
- The decision/method line is separated from the summary block by a blank line.
- The `Artifacts` line renders clickable links to `review.md` and `review.json`.
- The posted review body no longer includes the legacy `Autonomous review completed...` / `Autonomous review decision...` line below the new `Factory Review` section.
- The posted review body no longer repeats the plain `Summary:` line below the new `Factory Review` section.
- The posted review body no longer includes a trailing standalone artifact list outside the new `Factory Review` section.
- The posted review body no longer includes a separate `Full Review` section.
- Deep detail is rendered in collapsible summary/details sections rather than dumped inline, with `Traceability` as the default deep-detail section.
- The posted review body renders `Traceability` as a single flat `<details>` block with plain subheadings inside it.
- Review authoring guidance is updated so `review.md` does not instruct the reviewer to include a separate methodology line.
- The posted review/comment body matches the durable `review.md` artifact content aside from the intentional top-level `Factory Review` framing and linked artifact references.
- Tests or fixtures that validate rendered review comments are updated to reflect the new format.

## Risk

- Review comments are a core operator surface; unclear formatting regressions would make blocking issues or requirement gaps harder to spot.
- Template changes can break repo-local overrides if required tokens or assumptions shift unexpectedly.
- If the visible summary is not concise enough, long reviews may still become hard to scan despite the redesign.
- If methodology remains duplicated between the top-level template and `review.md`, the result will still feel noisy even after the layout change.
- If review detail is not pruned enough, the new top section could still be undermined by redundant lower sections.
- If the posted comment and `review.md` are allowed to diverge, operators will lose confidence in which artifact is authoritative.
- If nested traceability blocks remain, the review will still feel overly heavy despite the new top summary block.

## Affected area

CI / Automation
