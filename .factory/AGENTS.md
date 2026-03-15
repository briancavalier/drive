## Scope

This directory holds factory prompt templates and per-run artifacts.

- `.factory/prompts/*.md` are hand-authored stage templates for `plan`, `implement`, and `repair`.
- `.factory/runs/<issueNumber>/` contains artifacts produced for a specific run.

## Working Rules

- Preserve template placeholders exactly: `{{ISSUE_NUMBER}}`, `{{ARTIFACTS_PATH}}`, and `{{CONTEXT}}`.
- Keep prompt edits compatible with the section assembly and budget trimming in `scripts/build-stage-prompt.mjs`.
- Keep each stage prompt narrowly scoped to its stage. Do not add instructions that blur planning, implementation, and repair responsibilities.
- Treat `.factory/runs/*` as run outputs, not a general editing surface, unless the task explicitly targets committed run artifacts.

## Validation

- When changing prompt templates, verify the instructions still match the current factory flow and artifact names.
- If a prompt change affects context shape or artifact expectations, update the relevant scripts and tests in the same change.
