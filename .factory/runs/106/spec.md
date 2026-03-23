# Specification: Update factory intervention question template

## Summary
- Redesign the GitHub intervention question comment so its visible header mirrors the dashboard-style summary used in other factory surfaces.
- Surface the blocking status, stage, concise summary, question id, recommended option (when available), and run context before any long-form explanation.
- Keep answer commands copy-friendly with fenced code blocks and collapse extended background into an optional details disclosure without changing hidden metadata or parsing behavior.

## Functional Requirements
- Replace the existing header with a compact block that appears immediately below the `## Factory Question` heading and includes:
  - Line 1: `**🧑 Human action required** · Stage: \`<stage>\``.
  - Line 2: `Summary: <summary text>` when a summary is provided; omit the line if empty.
  - Line 3: `Question ID: \`<id>\``.
  - Line 4: `Recommended: \`<option id>\`` when a recommended option exists.
  - Line 5: Run context, preferring a Markdown link `Run: [GitHub Actions #<runId>](<runUrl>)` when `runUrl` is present, otherwise `Run: #<runId>` when only `runId` exists; omit entirely if both are missing.
- Change the answer section heading to `### Answer With` and render each option as:
  - Bold label with optional effect hint (`describeOptionEffect`) separated by an em dash.
  - A ```` ```text```` fenced block containing the `/factory answer <id> <option>` command and no extra prose on the same line.
- Preserve option ordering and generated command strings, even when the option label is blank (fall back to the option id as today).
- Wrap extended context in a `<details>` element only when `detail` is non-empty. Keep the summary text `Why this needs attention` unchanged.
- Ensure the serialized metadata comment `<!-- factory-question: … -->` remains present and unchanged in structure so downstream parsers keep working.
- Continue to handle interventions without available options by emitting `_No answers available._` under the `### Answer With` heading.

## Non-Functional Requirements
- Formatting must avoid consecutive blank lines except where they improve readability in Markdown. The top block should have no blank lines between its lines and should precede the answer heading with a single blank line.
- The implementation must maintain existing utilities (e.g., `PR_SLASH_COMMANDS`, `describeOptionEffect`) without altering their semantics beyond what's necessary for the new layout.
- All code changes must retain compatibility with existing intervention types (approval and generic question) and optional fields.

## Edge Cases & Data Handling
- When `summary` or `recommendedOptionId` is missing or blank, omit their respective lines without leaving stray blank lines.
- If detail text includes Markdown, keep it untouched inside the `<details>` body.
- Resume context values (repair counts, etc.) are not displayed directly in this iteration; the run context line uses only `runId`/`runUrl` information.
- Unknown option effects should continue to render without the effect hint text.

## Assumptions
- All question interventions requiring human action should display the descriptor `🧑 Human action required`; no alternative statuses are needed for this change.
- `runId` is unique and suitable for display alongside the GitHub Actions run link when present.
- Existing tests in `tests/github-messages.test.mjs` represent the authoritative expected formatting and will be updated accordingly.

## Risks & Mitigations
- **Risk:** Markdown spacing regressions could break copy buttons or readability. **Mitigation:** Update and expand unit tests to assert the new line ordering and spacing for representative scenarios.
- **Risk:** Omitting metadata or changing its structure could disrupt automation. **Mitigation:** Explicitly test that the metadata comment remains in place and unchanged.
- **Risk:** Optional fields (e.g., recommended option, detail) may introduce double blank lines. **Mitigation:** Build helper logic that conditionally appends lines and add tests covering absent values.
