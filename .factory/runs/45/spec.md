# Intake Rejection Visibility Specification

## Summary
- Introduce a dedicated `factory:intake-rejected` label that flags issues whose intake failed before PR creation.
- Apply the label whenever `prepare-intake.mjs` rejects an issue for missing form sections or insufficient requester permissions, and clear it automatically on the next successful intake run.
- Extend label bootstrap, tests, and operator docs so the new label is provisioned alongside the existing factory labels without altering current rejection comments.

## Current Behavior
- `scripts/prepare-intake.mjs` fails early when the sender lacks write access and throws with the error string "does not have write access"; the workflow exits without adding any durable indicator on the issue.
- When the intake form is incomplete, `prepare-intake.mjs` posts the templated rejection comment and throws, but it also leaves the issue unlabeled.
- `scripts/ensure-labels.mjs` provisions only the existing `factory:*` labels listed in `FACTORY_LABELS`; none distinguish intake rejections, and the README documentation mirrors that list.
- Subsequent successful runs do not clear any failure state except for removal of `factory:start` inside `finalize-plan.mjs`.

## Proposed Changes

### Label Definition & Bootstrap
- Add `intakeRejected: "factory:intake-rejected"` to `FACTORY_LABELS` and register it in `LABEL_DEFINITIONS` with color `D73A4A` and description "Factory intake was rejected; issue needs updates before planning can start."
- Ensure the label is included anywhere the full label set is referenced (e.g., exported cost-label arrays should remain unchanged, but tests that enumerate all labels must cover the new entry).
- Update the public label list in `README.md` to mention the new label so operators know what it represents.

### Intake Rejection Flow
- In `scripts/prepare-intake.mjs`, import `FACTORY_LABELS` and the `addLabels`/`removeLabel` helpers so the script can manage the new label directly.
- Whenever the permission check fails (before throwing) call `addLabels(issue.number, [FACTORY_LABELS.intakeRejected])` and skip reapplying if it already exists (the GitHub API already deduplicates, but guard against undefined issue numbers).
- When `isValidIssueForm` returns false, add the rejection label before posting the existing comment and throwing so operators see the state without opening the issue.
- After all validation succeeds—right before writing outputs or pushing—call `removeLabel(issue.number, FACTORY_LABELS.intakeRejected)` so a corrected issue automatically sheds the rejection label on the next successful run.
- Keep the existing rejection comment flow intact; do not modify the body text beyond optional mention of the label (not required for this change).

### Tests & Documentation
- Extend `tests/factory-config.test.mjs` (or an adjacent test) to assert that `LABEL_DEFINITIONS` now contains `FACTORY_LABELS.intakeRejected` with the expected metadata.
- Add targeted tests for `prepare-intake.mjs` that exercise the new label behavior by stubbing GitHub API helpers (missing form applies label, permission failure applies label, successful run removes it). If direct integration tests are heavy, factor the label logic into a small helper that can be unit tested.
- Update any test fixtures or utilities that assume the set of factory labels (e.g., helpers that construct label arrays) so they remain accurate.
- Document the new label in `README.md` under the Labels section.

## Assumptions & Risks
- GitHub's labeling API is idempotent for already-applied labels; no extra lookups are required before calling `addLabels`.
- Intake failures other than permission or form validation (e.g., GitHub outages) will continue to surface as errors without applying the label; this work targets only deterministic rejections outlined in the issue.
- Removing the label on successful intake is sufficient; later automation (implement/repair) does not need to manipulate it.

## Out of Scope
- Changing the wording or structure of the intake rejection comment beyond maintaining its current behavior.
- Labeling downstream failures after a PR exists; those remain managed by existing PR-state labels such as `factory:blocked`.
- Adding UI badges or additional automation outside the GitHub label and existing comment flow.
