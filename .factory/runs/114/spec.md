## Summary
- Update the factory-generated pull request body template so the top-level heading reads "Factory Status" instead of "Factory Dashboard".
- Align any assertions or fixtures that read the heading to keep tests and downstream parsing consistent.

## Scope
- Update `scripts/templates/github-messages/pr-body.md` heading text.
- Adjust tests or snapshots that currently expect "Factory Dashboard" in generated PR content (e.g., `tests/github-messages.test.mjs`).

## Requirements
- Pull request bodies produced by the factory must render "## Factory Status" as the first heading.
- No other sections, structure, or metadata in the PR body template may change.
- Existing parsing behavior and metadata extraction must continue to pass automated tests without additional modifications.

## Constraints & Considerations
- Keep the change minimal to avoid unintended diffs in generated PR bodies.
- Confirm that expectations in automated tests reflect the new heading text.

## Risks
- Missing an assertion or fixture that references the old heading could cause failing tests or runtime regressions.

## Assumptions
- Only the heading text and corresponding explicit assertions require updates; there are no hidden consumers of the heading string outside the repository.
