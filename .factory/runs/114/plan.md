## Implementation Plan

1. Update PR body template heading  
   - Edit `scripts/templates/github-messages/pr-body.md` to replace the leading "## Factory Dashboard" heading with "## Factory Status".

2. Synchronize automated tests  
   - Adjust assertions in `tests/github-messages.test.mjs` (and any other discovered tests) to expect the new heading text.

3. Verify formatting and tests  
   - Regenerate or review any fixtures if touched.  
   - Run the relevant test suite (e.g., `node --test tests/github-messages.test.mjs`) to confirm all expectations still pass.
