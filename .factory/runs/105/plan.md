# Implementation Plan

- Update `scripts/lib/github-messages.mjs`:
  - Expand `buildReviewConversationBody` to accept the parsed `review`, reuse `renderMessage`, and populate the new token map (decision display, counts, summaries, artifact paths, `<details>` sections).
  - Add progressive length-reduction logic that removes optional sections in priority order before falling back to the truncation notice, keeping the summary block intact.
  - Thread `githubMessageOptions` through `processReview` so overrides under `.factory/messages/` can customize the templates.
- Redesign default templates in `scripts/templates/github-messages/review-pass-comment.md` and `scripts/templates/github-messages/review-request-changes.md` to match the dashboard-first structure and shared heading order, using the expanded token set.
- Reuse or augment helpers in `scripts/lib/review-output.mjs` as needed (e.g., counts, `<details>` builders) to avoid duplicating markdown assembly logic for summaries and detail sections.
- Refresh unit tests:
  - Adjust `tests/github-messages.test.mjs` to assert the new comment layout, `<details>` sections, and truncation behaviour.
  - Update `tests/process-review.test.mjs` to confirm both decisions render via the template (including overrides) and still post artifact references.
