# Summary

Implement the review stage by extending routing, prompt construction, artifact
handling, and PR-state transitions.

## Routing

Update workflow-run routing so green CI on factory-managed PRs targets review.

## Prompt Infrastructure

Add methodology loading, review prompt generation, and review artifact parsing.

## Repair Integration

Send autonomous review failures through the existing repair loop with the
existing repair-attempt counter.

## Test Coverage

Cover green path, request-changes path, methodology fallback, and repair-cap
enforcement with unit and fixture-driven tests.
