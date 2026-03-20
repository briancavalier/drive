# Acceptance Tests

1. **Dashboard replaces legacy sections**
   - Generate a PR body via `node --test tests/github-messages.test.mjs`; confirm it contains a `## Factory Dashboard` heading, the two-column table with blank headers, and no `## Factory Control Panel` or `## Status` headings.
2. **Open and Actions lines separate navigation vs. mutations**
   - In the same test suite, assert that read-only links (latest run, artifact viewers) appear on the `Open:` line and state-changing workflow triggers appear on the `Actions:` line with cleaned labels and no duplicates.
3. **Artifacts grouped by phase**
   - Verify `tests/github-messages.test.mjs` (or a dedicated snapshot test) checks that the `## Artifacts` section renders `Plan`, `Execution`, and `Review` groupings with the expected links and skips groups when files are absent.
4. **Graceful fallbacks for missing data**
   - Add/confirm test coverage for scenarios without cost or estimate data to ensure the dashboard omits those rows and still renders valid Markdown (no `undefined`, extra pipes, or empty table rows).
