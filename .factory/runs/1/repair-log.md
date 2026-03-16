## 2026-03-16
- Fixed review processing to block contradictory pass results, ensured workflow checks out the stage branch, and surfaced CI evidence for the review prompt.
- Corrected the route job checkout reference so it no longer self-depends on its own outputs, satisfying actionlint.
- Removed temporary prompt artifacts and added factory safeguards to keep `.factory/tmp/` workspace-only.
- Updated acceptance tests to capture CI success on pass and fail-fast behavior for missing or invalid review artifacts.

