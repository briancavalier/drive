# Acceptance Tests

- **Full header and details**
  - Given an approval intervention with summary, recommended option, run id/url, detail text, and multiple options with known effects
  - When `renderInterventionQuestionComment` renders the comment
  - Then the top block contains, in order, the human-action line, summary line, question id, recommended option, and a run link, followed by a blank line and a `### Answer With` heading, fenced command blocks for each option, a `<details>` block with the supplied detail, and the existing metadata comment unchanged.

- **Missing optional values**
  - Given a question intervention with no summary, no recommended option, no run id/url, and no detail
  - When the comment is rendered
  - Then the header shows only the human-action line and question id without extra blank lines, the answers still use fenced code blocks, no `<details>` section is added, and the metadata comment remains present.

- **No available answers**
  - Given an intervention whose options array is empty
  - When the comment is rendered
  - Then the `### Answer With` section contains the `_No answers available._` placeholder and still ends with the metadata comment.
