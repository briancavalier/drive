## Scope

This directory holds factory prompt templates and per-run artifacts.

- `.factory/prompts/*.md` are hand-authored stage templates for the active factory flow, including `plan`, `implement`, `repair`, and `review`.
- `.factory/messages/*.md` are optional GitHub message override templates for PR bodies, issue comments, and review posts.
- `.factory/FACTORY.md` is the human-authored protected factory policy file loaded into stage prompts as trusted control-plane context.
- `.factory/runs/<issueNumber>/` contains artifacts produced for a specific run.

## Working Rules

- Preserve template placeholders exactly: `{{ISSUE_NUMBER}}`, `{{ARTIFACTS_PATH}}`, and `{{CONTEXT}}`.
- Keep prompt edits compatible with the supported mode definitions in `scripts/lib/factory-config.mjs` and the section assembly and budget trimming in `scripts/build-stage-prompt.mjs`.
- Keep each stage prompt narrowly scoped to its stage. Do not add instructions that blur planning, implementation, repair, and review responsibilities.
- Treat `.factory/messages/*.md` as overrides, not the contract source of truth. The supported message ids, placeholder names, required-token rules, and fallback behavior live in `scripts/lib/github-messages.mjs` and are exercised by `tests/github-messages.test.mjs`.
- Treat `.factory/FACTORY.md` as durable factory policy, not as a writable stage artifact. Keep it concise, stable, and aligned with enforced control-plane rules.
- Do not embed factory-state HTML comments or implement truncation logic in `.factory/messages/*.md`; those protocol-critical behaviors stay code-owned in `scripts/lib/github-messages.mjs`.
- Treat `.factory/runs/*` as run outputs, not a general editing surface, unless the task explicitly targets committed run artifacts.

## Validation

- When changing prompt templates, verify the instructions still match the current factory flow and artifact names.
- If a prompt change affects context shape or artifact expectations, update the relevant scripts and tests in the same change.
- When changing `.factory/messages/*.md`, verify the placeholders are accepted by `scripts/lib/github-messages.mjs` and covered by `tests/github-messages.test.mjs` rather than copying rules into this file.
- When changing `.factory/FACTORY.md`, verify the prompt builder, protected-path checks, and README guidance still agree on precedence and trust boundaries.
