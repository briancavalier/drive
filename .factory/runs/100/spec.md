# Intervention Comment Simplification (Run 100)

## Overview
- Redesign the GitHub PR intervention question comment to reduce visual noise while keeping operators focused on the actionable commands.
- Keep the question summary, identifiers, and recommended answer prominent so operators can respond quickly.
- Preserve the hidden `factory-question` metadata block and slash-command syntax to avoid breaking automation tooling.

## Current Behavior
- Comment starts with "## Factory Question" followed by the raw summary text and a bulleted list containing intervention metadata (ID, type, stage, recommended answer).
- The question text is introduced under a "### Decision" heading, the optional long-form detail is repeated under "### Context", and an "### Options" list restates each option id/label.
- All answer commands are grouped inside a single `text` code block, forcing operators to copy and trim the desired command manually.
- Context appears inline and fully expanded, pushing key commands farther down the comment.

## Target Experience
- Keep the `## Factory Question` heading.
- Present a compact summary block directly under the heading:
  - One narrative sentence based on `intervention.summary`.
  - Inline facts for question ID, stage, and recommended option (if present).
  - Optional question prompt rendered as a short quoted line when available.
- Introduce `### Answers` immediately after the summary block.
- For each option returned by `getQuestionOptions`:
  - Render a bolded human-facing label (prefer `option.label`).
  - Append a concise outcome hint derived from `option.effect` when recognized (e.g., resume automation, remain blocked, manual takeover).
  - Follow with an individual ` ```text ` code fence containing `/factory answer <intervention.id> <option.id>` so GitHub exposes one-click copy per command.
- Omit the previous "### Options" bullet list entirely.
- Move verbose context into a `<details>` element with a summary label such as "Why this needs attention"; place any `intervention.detail` contents inside while preserving Markdown formatting.
- Retain existing hidden metadata comment exactly once at the bottom.

## Content Rules
- Always display the question ID and stage; show the recommended option line only when `payload.recommendedOptionId` is truthy.
- If `payload.question` exists, render it as an emphasized prompt (e.g., italic line or blockquote) directly under the summary before the answers.
- When `option.effect` is unrecognized or absent, fall back to displaying only the label without an outcome suffix.
- Ensure empty or null detail payloads do not render an empty `<details>` block.
- Maintain existing newline normalization that collapses duplicate blank lines.

## Testing Impact
- Update `tests/github-messages.test.mjs` to assert the new structure: separate code fences per option, absence of the old "### Options" list, presence of `<details>` when detail text exists, and retention of the metadata comment.
- Expand tests to cover scenarios with and without recommended options and with unknown option effects (if not already exercised) to document fallback behavior.

## Assumptions & Open Questions
- Available option effects remain a small fixed set (`resume_current_stage`, `remain_blocked`, `manual_only`); additional values will simply omit the outcome hint.
- `intervention.summary` already contains the concise message shown in the question comment and can continue being used verbatim.
- No other subsystems depend on the exact Markdown headings that are being retired (only tests expect them).
