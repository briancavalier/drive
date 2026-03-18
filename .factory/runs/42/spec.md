# Workflow-Safety Review Methodology Spec

## Summary
- Introduce a `workflow-safety` autonomous review methodology alongside the existing `default` rubric.
- Ensure operators can opt into the workflow-focused rubric via `FACTORY_REVIEW_METHOD=workflow-safety` without breaking repositories that remain on the default.
- Document the workflow rubric so reviewers consistently assess CI and automation changes for elevated risk areas (permissions, triggers, secrets, recursion, branch safety, validation).

## Functional Requirements
1. Provide methodology assets  
   - Add `.factory/review-methods/workflow-safety/instructions.md` describing the new rubric.  
   - The instructions must call out, at minimum: least-privilege permissions, event trigger scope & recursion loops, secret/token exposure, self-modification hazards, branch protections & merge gating, and adequacy of validation coverage for workflow logic.
2. Methodology resolution  
   - `resolveReviewMethodology` (used by prompt building and artifact validation) must resolve `workflow-safety` without falling back to `default` when the instructions exist.  
   - When `FACTORY_REVIEW_METHOD` is unset or invalid, behavior must remain unchanged (fallback to `default`).
3. Prompt generation  
   - Review prompts produced when `FACTORY_REVIEW_METHOD=workflow-safety` must embed the new instructions and annotate the selected methodology in prompt metadata.
4. Review artifact validation  
   - Processing must accept `review.json` artifacts that declare `"methodology": "workflow-safety"` so long as they satisfy the existing contract.  
   - Invalid or mismatched methodology values must continue to trigger validation failures.
5. Documentation  
   - Update repository docs to mention the new methodology, its intent, and how to select it via `FACTORY_REVIEW_METHOD`.
6. Test coverage  
   - Extend automated tests to exercise methodology resolution, prompt embedding, and artifact validation with the `workflow-safety` profile while keeping the default-path coverage intact.

## Non-Functional Requirements
- Preserve backward compatibility: existing runs using the default rubric must behave identically.
- Keep the new instructions concise, actionable, and readable for operators editing workflows.
- Avoid changing review artifact schemas or expanding methodology selection beyond the requested addition.

## Implementation Notes
- Follow the existing instructions format (`## Review Rubric: <name>`, numbered lists plus supporting rules).  
- Reuse existing helpers in `scripts/lib/review-methods.mjs`, `scripts/build-stage-prompt.mjs`, and `scripts/lib/review-artifacts.mjs`; no new entry points are required.  
- Tests likely impacted:  
  - `tests/build-stage-prompt.test.mjs` (prompt metadata & instructions embedding).  
  - `tests/review-artifacts.test.mjs` (methodology validation).  
  - `tests/process-review.test.mjs` or related helpers that assume `"default"`.  
- Update the README (autonomous review section) to enumerate both available methodologies and clarify when to use `workflow-safety`.

## Assumptions / Open Questions
- The current review artifact schema remains unchanged; only the methodology name differs.  
- No additional workflow files beyond `instructions.md` are required for methodology resolution.  
- Operators will manually select `workflow-safety`; automatic detection is out of scope.
