## Problem statement

The factory now has multiple question-producing paths, but the policy for when to ask, when to continue automatically, and when to fail is still mostly embedded in specific implementations. Without shared policy helpers, new question producers are likely to drift in thresholds, phrasing, and state handling.

## Goals

- Introduce shared policy helpers for deciding when the factory should ask a human, continue autonomously, or surface a failure
- Normalize common decision factors such as ambiguity, reversibility, expected rework, and repeated failure thresholds
- Make it easier for future question producers to reuse the same policy and intervention-building path
- Keep the resulting policy narrow, explicit, and testable

## Non-goals

- Do not add a broad autonomous planning engine or learned policy system
- Do not change the existing `/factory answer` protocol
- Do not add more question producers than needed to validate the shared helper layer
- Do not collapse distinct intervention types into one generic stringly-typed path

## Constraints

- Preserve `metadata.intervention` as the source of truth for the current open intervention
- Keep existing failure, approval, and implement ambiguity behavior working while extracting shared policy logic
- Prefer small, typed helpers over a large generic policy framework
- Maintain the current append-only PR-comment history model

## Acceptance criteria

- The repo has shared helper(s) for deciding whether to ask, fail, or continue for supported question-producing paths
- At least the existing implement ambiguity flow and one additional question-producing path use the shared helpers
- Tests cover the helper decision boundaries and ensure current intervention behavior remains intact
- The policy remains explicit and reviewable rather than being spread across ad hoc conditionals

## Risk

If the helper layer is too abstract, it can obscure the operational differences between ambiguity, approval, and failure. If it is too weak, question producers will continue to drift and the factory will behave inconsistently across stages.

## Affected area

CI / Automation
