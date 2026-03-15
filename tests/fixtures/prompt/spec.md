# Summary

Add an autonomous review stage to the GitHub-native factory.

## Workflow Flow

Successful CI for a factory-managed PR routes to a review stage instead of
immediately marking the PR ready for human review.

## Methodology Selection

The active methodology is selected repo-wide by Actions variable and loaded from
checked-in files. Invalid values fall back to `default`.

## Artifact Contract

The review stage must write `review.md` and `review.json` into the issue run
directory, and those artifacts must remain committed on the factory branch.

## Review Outcomes

Passing review marks the PR ready. Failing review files a body-only
`REQUEST_CHANGES` review and reuses the existing repair loop.
