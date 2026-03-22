## Problem statement
The current factory intervention question comment is informative, but it is too long and dense for fast operator scanning. The visible question and the copyable answer commands are separated by too much text, and the separate options list repeats information already conveyed by the answer choices. This creates unnecessary friction for the human-in-the-loop step.

## Goals
- Redesign the intervention question comment so it is easier to scan quickly in the PR conversation
- Keep the question summary and answer commands visually adjacent
- Render each answer command in its own `text` code fence so GitHub provides a one-click copy affordance per answer
- Remove the separate visible options section if the answer blocks already convey the choice and consequence clearly
- Keep detailed context available, but collapse or demote it so it does not dominate the visible comment
- Update tests to match the new comment structure

## Non-goals
- Do not change intervention routing, command syntax, or answer semantics
- Do not change self-modify security policy in this issue
- Do not add button-triggered answer workflows
- Do not change the append-only PR comment model

## Constraints
- Preserve the existing machine-readable hidden metadata block in the question comment
- Keep `/factory answer <intervention-id> <option-id>` as the canonical answer protocol
- Keep the comment readable in standard GitHub PR conversations without custom UI
- The new format should work for approval and question interventions, not only self-modify
- Keep the implementation focused on formatting/rendering and directly related tests

## Acceptance criteria
- Question comments show a short visible summary, question ID, and recommended answer near the top
- Each answer appears in its own `text` code fence with a clear human-readable label explaining the outcome
- The separate visible options section is removed
- Context is moved below the answer section and rendered in a less visually dominant form such as a collapsed details block
- Existing hidden `factory-question` metadata remains present and parseable
- Tests covering comment rendering are updated and pass

Example target format:

```md
## Factory Question

Protected control-plane files were changed and the factory needs approval to continue.

- Question ID: `int_q_123`
- Recommended: `approve_once`

### Answer

Approve once and resume the blocked stage:
```text
/factory answer int_q_123 approve_once
```

Deny and keep the PR blocked:
```text
/factory answer int_q_123 deny
```

Hand off to human-only handling:
```text
/factory answer int_q_123 human_takeover
```

<details>
<summary>Why this is blocked</summary>

The change touches protected paths under `scripts/**`.

Files:
- `scripts/lib/factory-config.mjs`

</details>
```

## Risk
This is low to moderate risk because it changes operator-facing text and layout in a critical human-intervention path. The main risk is accidentally dropping important context or making the comment less machine-safe. The hidden metadata and command syntax must remain unchanged.

## Affected area
CI / Automation
