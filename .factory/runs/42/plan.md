# Implementation Plan

1. **Author workflow-safety rubric instructions**  
   - Create `.factory/review-methods/workflow-safety/instructions.md` mirroring the existing rubric structure.  
   - Describe the workflow-specific checks (permissions, triggers, secret handling, self-modification, branch protection, validation evidence) plus guidance on findings/severity.

2. **Wire methodology into stage flows (no logic change expected)**  
   - Verify `scripts/lib/review-methods.mjs` resolves the new directory without fallback adjustments.  
   - Update fixtures/utilities (if any) that hardcode `"default"` so they allow method selection.  
   - Add targeted tests:
     - `tests/build-stage-prompt.test.mjs`: assert that `workflow-safety` instructions and metadata appear when requested.  
     - `tests/review-artifacts.test.mjs`: ensure artifacts created with `"workflow-safety"` validate successfully.  
     - `tests/process-review.test.mjs`: cover end-to-end processing with a `workflow-safety` artifact/env configuration.

3. **Documentation refresh**  
   - Extend `README.md` (Autonomous review section) to list the workflow-safety option, its use cases, and selection instructions.  
   - Note that default behavior is unchanged when the variable is unset.

4. **Regression check**  
   - Run the relevant `node --test` suites touched above to confirm both default and workflow-safety paths pass.
