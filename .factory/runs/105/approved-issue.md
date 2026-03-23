## Problem statement

Factory PR review comments do not currently use the same dashboard-first structure as factory PR descriptions. The current review format mixes short summary content with long detail sections, which makes the first screen harder to scan and reduces consistency across factory-generated GitHub surfaces.

## Goals

- Redesign the factory PR review templates to use the same high-level presentation pattern as the PR description: concise top summary first, deep detail collapsed below.
- Keep the PASS and REQUEST_CHANGES review templates structurally consistent with the same visible headings and section order.
- Preserve room for long review evidence, but move it into summary/details blocks so the initial review comment stays scannable.
- Retain direct artifact references to `review.md` and `review.json`.
- Use the following proposed designs as the target default templates:

```md
## Factory Review

**✅ PASS** · Method: `{{REVIEW_METHOD}}`
Summary: {{REVIEW_SUMMARY}}
Findings: Blocking `{{BLOCKING_FINDINGS_COUNT}}` · Requirement gaps `{{UNMET_REQUIREMENT_CHECKS_COUNT}}`
Artifacts: `{{REVIEW_MARKDOWN_PATH}}` · `{{REVIEW_JSON_PATH}}`

### Blocking Findings

{{BLOCKING_FINDINGS_SUMMARY}}

### Requirement Gaps

{{UNMET_REQUIREMENT_CHECKS_SUMMARY}}

{{TRACEABILITY_DETAILS}}

{{FULL_REVIEW_DETAILS}}
```

```md
## Factory Review

**❌ REQUEST_CHANGES** · Method: `{{REVIEW_METHOD}}`
Summary: {{REVIEW_SUMMARY}}
Findings: Blocking `{{BLOCKING_FINDINGS_COUNT}}` · Requirement gaps `{{UNMET_REQUIREMENT_CHECKS_COUNT}}`
Artifacts: `{{REVIEW_MARKDOWN_PATH}}` · `{{REVIEW_JSON_PATH}}`

### Blocking Findings

{{BLOCKING_FINDINGS_SUMMARY}}

### Requirement Gaps

{{UNMET_REQUIREMENT_CHECKS_SUMMARY}}

{{FULL_BLOCKING_FINDINGS_DETAILS}}

{{TRACEABILITY_DETAILS}}

{{FULL_REVIEW_DETAILS}}
```

## Non-goals

- Redesigning the PR body / dashboard template itself.
- Changing review methodology, review artifact schemas, or review decision semantics.
- Changing slash commands, labels, or PR state transitions.
- Rewriting the contents of `review.md`; this request is about the posted review/comment template shape.

## Constraints

- Keep the PASS and REQUEST_CHANGES templates aligned in heading names and overall layout.
- Do not add an explicit `At a Glance` heading; the compact summary block should imply that role through formatting.
- Keep the initial visible content compact and move long supporting content into `<details>` sections.
- Preserve compatibility with the template token system and existing artifact paths.
- The resulting templates should still work well when sections like blocking findings are empty.

## Acceptance criteria

- The default factory review templates are updated to match the proposed structure or a directly equivalent structure.
- Both PASS and REQUEST_CHANGES review templates use the same visible section headings and ordering.
- The top block clearly shows decision, method, summary, findings counts, and artifact paths before any long content.
- Deep detail is rendered in collapsible summary/details sections rather than dumped inline.
- Tests or fixtures that validate rendered review comments are updated to reflect the new format.

## Risk

- Review comments are a core operator surface; unclear formatting regressions would make blocking issues or requirement gaps harder to spot.
- Template changes can break repo-local overrides if required tokens or assumptions shift unexpectedly.
- If the visible summary is not concise enough, long reviews may still become hard to scan despite the redesign.

## Affected area

CI / Automation
