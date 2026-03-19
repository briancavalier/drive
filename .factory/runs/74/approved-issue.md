## Problem statement

The autonomous PR review comment’s traceability sections are hard to scan after expanding their `<details>` blocks. The current layout repeats `Requirement`, `Status`, and `Evidence` in a visually uniform list, and status is conveyed primarily with words like `satisfied` rather than a stronger first-glance signal. This makes it slow for operators to distinguish satisfied items from partial or unmet checks when reviewing long traceability output.

## Goals

- Improve scanability of expanded traceability sections in PR review comments.
- Make requirement status identifiable at a glance without reading each item line by line.
- Preserve the current summary/details structure because it is useful for collapsing long sections.
- Produce a review comment format that is easier to scan in GitHub’s markdown rendering, especially for mixed-status lists.

## Non-goals

- Do not redesign the full autonomous review comment outside the traceability presentation unless needed to support scanability.
- Do not weaken or remove canonical traceability data from `review.md` or `review.json`.
- Do not change review decision rules, requirement types, or validation semantics.
- Do not rely on styling that GitHub markdown comments do not support.

## Constraints

- The issue template and intake parser require the standard Factory Request section headings.
- The solution must render well in GitHub PR comments and review bodies using plain markdown and supported HTML like `<details>`.
- The current summary/details structure should remain available because it is already useful.
- Any emoji usage should improve signal density rather than add visual noise.
- The implementation must preserve compatibility with existing review artifact normalization and tests.

## Acceptance criteria

- The traceability output format is updated so each expanded traceability section is more scannable in GitHub comments.
- Status is surfaced with a stronger first-glance visual cue than plain words alone.
- The summary/details structure remains in place for traceability sections.
- Mixed-status traceability lists are easier to scan than the current `Requirement / Status / Evidence` layout.
- Automated tests are updated to cover the new canonical rendering and any changed comment output.

## Risk

- Overusing emoji could make the output noisier rather than clearer.
- Changing the canonical rendering could break normalization or tests if the format contract is not updated carefully.
- A format that looks good in generated markdown may still read poorly in GitHub’s rendered PR review UI if summary lines become too dense.

## Affected area

CI / Automation
