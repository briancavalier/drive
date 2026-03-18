# Acceptance Tests

1. `node --test tests/build-stage-prompt.test.mjs`  
   - Confirms review prompt assembly embeds the `workflow-safety` instructions and metadata when the methodology is requested, while preserving fallback behavior.
2. `node --test tests/review-artifacts.test.mjs`  
   - Validates that `loadValidatedReviewArtifacts` accepts artifacts labeled with `"methodology": "workflow-safety"` and still rejects mismatches.
3. `node --test tests/process-review.test.mjs`  
   - Exercises end-to-end review processing, ensuring a `workflow-safety` configuration produces accepted artifacts and maintains existing validation failures.
