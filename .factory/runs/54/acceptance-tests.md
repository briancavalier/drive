# Acceptance tests

- **Review JSON contract violation enters repair**
  - Simulate invalid `requirement_checks[*].evidence` in `review.json`.
  - Expected: `process-review` reports failure type `review_artifact_contract`, workflow schedules a repair attempt, and PR status becomes `repairing` without adding `factory:blocked`.

- **Repair prompt includes failure context**
  - After a captured artifact failure, run the repair prompt builder.
  - Expected: `build-stage-prompt` includes the stored failure message inside the repair context.

- **Successful repair resumes review flow**
  - Mock a repair run that fixes the artifacts and pushes the branch.
  - Expected: metadata resets to `reviewing` on the next CI success and review processing succeeds automatically (no manual intervention).

- **Exhausted repair attempts block PR with explicit comment**
  - Drive repeated artifact failures until `max_repair_attempts` is exceeded or the failure signature repeats.
  - Expected: PR is marked `blocked`, failure comment references malformed review artifacts, and no further repair jobs are scheduled.

- **Delivery/configuration failures still block immediately**
  - Simulate methodology resolution failure.
  - Expected: workflow skips the new repair path, posts the configuration failure comment, and blocks the PR as before.
