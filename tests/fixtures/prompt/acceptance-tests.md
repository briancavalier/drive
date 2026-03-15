# Acceptance Tests

## AT1

Given a factory-managed PR in `implementing`, when CI succeeds, then the PR
enters `reviewing` and the review stage runs.

## AT2

Given a configured methodology that does not exist, when review prompt building
occurs, then the system uses `default`.

## AT3

Given `review.json` with decision `pass`, when review processing runs, then the
PR is marked ready for review.

## AT4

Given `review.json` with decision `request_changes`, when review processing
runs, then a body-only `REQUEST_CHANGES` review is submitted and the PR remains
draft.
