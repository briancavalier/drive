# Acceptance Tests – Run 100

- **Single approval question renders concise header and per-option code fences**  
  Trigger a factory approval intervention with summary, stage `implement`, recommended option `approve_once`, and detail text.  
  Assert the rendered comment includes:
  - `## Factory Question` heading, summary sentence, and inline lines for question ID, stage, and recommended option.
  - The prompt (from `payload.question`) directly above the answers block.
  - Two distinct `text` code fences, each containing one `/factory answer` command, with no legacy combined block.
  - Bold labels with outcome hints matching `resume_current_stage` and `remain_blocked`.
  - A `<details>` block wrapping the detail text.
  - The hidden `<!-- factory-question: ... -->` metadata unchanged.

- **Unknown effect omits outcome hint but still renders copyable command**  
  Render a question with an option whose `effect` is not in the known set.  
  Verify the answer section shows the bold label without an outcome suffix while still producing its own `text` code fence.

- **Comment without detail skips the context section**  
  Render a question that lacks `intervention.detail`.  
  Confirm no `<details>` block or empty context placeholder appears, yet the summary and answers remain intact.

- **No recommended option hides that line**  
  Render a question whose payload has no `recommendedOptionId`.  
  Ensure the summary omits the recommended line but otherwise follows the new format.
