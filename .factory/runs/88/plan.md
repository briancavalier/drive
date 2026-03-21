# Implementation Plan

1. Refresh the PR body template
   - Replace the existing `Factory Run` scaffold with the new `Factory Dashboard`-first layout in `scripts/templates/github-messages/pr-body.md`.
   - Move the `Closes #` token to the bottom of the template so `renderPrBody` can append metadata after it.
2. Rework `renderPrBody` composition
   - Add helpers for summary line, stage selection, waiting descriptor, CI/repair line, cost line, and `Open:` link aggregation.
   - Convert the action list into slash-command suggestions drawn from `controlPanel.actions` (mutation-only) and attach concise human explanations per command id.
   - Emit the new artifact grouping lines and updated operator notes, ensuring empty data suppresses whole lines rather than leaving blank separators.
3. Verify control panel data requirements
   - Reuse or extend `buildControlPanel` only if additional metadata (e.g. blocked action) must be surfaced; add unit coverage if new fields are exposed.
4. Update and extend tests
   - Rewrite assertions in `tests/github-messages.test.mjs` to match the new markdown, including summary line ordering, grouped lines, and suggestions format.
   - Adjust or augment `tests/control-panel.test.mjs` as needed for any new helpers or data dependencies.
   - Add focused tests for new formatting helpers if logic becomes non-trivial (e.g. waiting descriptor, stage resolver).
5. Run validation
   - Execute the existing test suite (`npm test`) to confirm all formatting scenarios pass with the redesigned dashboard output.

