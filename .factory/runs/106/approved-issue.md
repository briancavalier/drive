## Problem statement

Factory human intervention comments currently present the question and available answers, but they do not share the same dashboard-first presentation style as the PR description and proposed review template. The intervention surface should provide a clearer at-a-glance summary, then place longer explanatory context behind collapsible details while preserving copy-friendly answer commands.

## Goals

- Redesign the factory human intervention / question template to match the same general style as other factory GitHub surfaces.
- Keep the question summary compact at the top, with stage, summary, identifier, recommendation, and run context visible immediately.
- Present answer commands in fenced code blocks so GitHub shows copy buttons for convenience.
- Move long explanatory context into a `<details>` block.
- Use the following proposed design as the target default template:

```md
## Factory Question

**🧑 Human action required** · Stage: `{{STAGE}}`
Summary: {{SUMMARY}}
Question ID: `{{QUESTION_ID}}`
Recommended: `{{RECOMMENDED_OPTION_ID}}`
{{RUN_LINK_LINE}}

### Answer With

{{ANSWER_OPTIONS_SECTION}}

{{CONTEXT_DETAILS}}
```

- Render `{{ANSWER_OPTIONS_SECTION}}` in this style:

```md
**Approve once and continue** — resumes automation

```text
/factory answer int_q_123 approve_once
```

**Do not approve** — keeps automation blocked

```text
/factory answer int_q_123 deny
```
```

- Render `{{CONTEXT_DETAILS}}` in this style:

```md
<details>
<summary>Why this needs attention</summary>

{{DETAIL}}

</details>
```

## Non-goals

- Changing intervention state semantics, answer routing, or resume behavior.
- Changing slash command syntax.
- Redesigning failure comments unrelated to question/approval interventions.
- Changing the PR body / dashboard template itself.

## Constraints

- Do not add an explicit `At a Glance` heading; the compact top block should carry that role through formatting alone.
- Use fenced code blocks for answer commands so GitHub provides copy buttons.
- Keep the top section concise and scannable before any longer explanation.
- Preserve intervention metadata behavior and compatibility with existing answer parsing.
- The template should handle missing optional values, such as no recommended answer or no extra detail.

## Acceptance criteria

- The default factory intervention question template is updated to match the proposed structure or a directly equivalent structure.
- The visible top block includes human-action status, stage, summary, question id, and recommendation when present.
- Answer options are rendered with fenced code blocks for each command.
- Long explanatory content is collapsed into a details section when present and omitted when absent.
- Tests covering rendered intervention question comments are updated to reflect the new format.

## Risk

- Intervention comments are used during blocking moments; poor formatting could increase operator confusion or delay responses.
- If fenced command blocks are generated inconsistently, answer commands may become less copyable or visually noisy.
- Changes to the rendered shape must not disturb hidden metadata or answer parsing assumptions.

## Affected area

CI / Automation
