decision: request_changes

**📝 Summary**
- Implemented the Factory Dashboard redesign: the PR body now renders `## Factory Dashboard` as a two-column Markdown table, provides `**Open:**` and `**Actions:**` link lines, groups artifacts by phase, and preserves the operator notes and serialized `factory-state` metadata.
- Template tokens were renamed to `DASHBOARD_SECTION`, `ARTIFACTS_SECTION`, and `OPERATOR_NOTES_SECTION` and template validation/fallback behavior was added.
- Unit tests were updated to assert the new layout and behaviors, and the test suite passed in CI (unit: success). Methodology used: `default`.

**🚨 blocking findings**
- Artifact presence detection is missing (must fix): The renderer currently emits artifact links based on constructed artifact URLs rather than verifying whether the corresponding files actually exist in the run artifacts directory. This can render dead links for missing artifacts and does not implement the spec requirement to "omit entries cleanly when files are missing." Scope: `scripts/lib/control-panel.mjs` (artifact grouping) and `scripts/lib/github-messages.mjs` (artifact link construction). Recommendation: check artifact file existence at `artifactsPath` (e.g. `fs.existsSync(path.join(artifactsPath, 'repair-log.md'))`) before including a link in `artifactGroups`, update `buildArtifactGroups` to accept a presence map or probe the filesystem, and add unit tests that verify omission when files are absent. Example reproduction: `.factory/runs/84/` currently lacks `repair-log.md` but the PR renderer will still produce a `repair-log.md` link (see evidence below).

**⚠️ non-blocking notes**
- Tests and README: Good coverage and docs updates exist (`tests/github-messages.test.mjs`, `README.md`). Consider adding an explicit unit test that asserts omission of artifact links when files are absent.
- Minor clarity: `buildArtifactLinks` always constructs URLs; consider renaming or documenting that it only maps paths→URLs and does not check artifact presence. This will reduce confusion for future maintainers.

**Methodology**: `default`

## 🧭 Traceability

<details>
<summary>🧭 Traceability: Acceptance Criteria (⚠️ 1, ✅ 4)</summary>

- ✅ **Satisfied**: Dashboard replaces control panel and status sections (two-column table).
  - **Evidence:** scripts/lib/github-messages.mjs:240-322 (renders "## Factory Dashboard" and constructs table rows)
  - **Evidence:** tests/github-messages.test.mjs:32-120 (unit tests asserting dashboard table and rows)
- ✅ **Satisfied**: Open and Actions link grouping present and marked for state changes.
  - **Evidence:** scripts/lib/github-messages.mjs:304-322 (Open and Actions lines construction)
  - **Evidence:** tests/github-messages.test.mjs:120-220 (assert Open and Actions lines and state change badge)
- ⚠️ **Partially satisfied**: Artifacts grouped by workflow phase with inline link lists matching available artifacts.
  - **Evidence:** scripts/lib/control-panel.mjs:640-720 (buildArtifactGroups implements Plan/Execution/Review grouping but filters only by URL truthiness)
  - **Evidence:** .factory/runs/84/: directory listing (contains spec.md, plan.md, cost-summary.json but no repair-log.md)
- ✅ **Satisfied**: Graceful fallbacks for missing numeric data (Cost, Estimate, Repairs).
  - **Evidence:** scripts/lib/control-panel.mjs:480-620 (formatRepairsDisplay, formatCostDisplay, formatEstimateDisplay implement fallbacks)
  - **Evidence:** tests/github-messages.test.mjs:1-120 (asserts "—" fallbacks and formatted values)
- ✅ **Satisfied**: Template override validation respects new tokens and falls back with warnings when invalid.
  - **Evidence:** scripts/lib/github-messages.mjs:1-120 (MESSAGE_SPECS updated to require DASHBOARD_SECTION etc. and validateTemplate/resolveTemplate)
  - **Evidence:** tests/github-messages.test.mjs:1-120 (tests for override fallback and warning)

</details>

<details>
<summary>🧭 Traceability: Spec Commitments (✅ 1)</summary>

- ✅ **Satisfied**: Render `DASHBOARD_SECTION`, `ARTIFACTS_SECTION`, and `OPERATOR_NOTES_SECTION` tokens and retire old tokens.
  - **Evidence:** scripts/lib/github-messages.mjs:16-36 (MESSAGE_SPECS requiredTokens updated)
  - **Evidence:** scripts/templates/github-messages/pr-body.md:1-12 (default template uses new tokens)

</details>

<details>
<summary>🧭 Traceability: Plan Deliverables (✅ 4)</summary>

- ✅ **Satisfied**: Refactor control panel builder into dashboard view model and update call sites.
  - **Evidence:** scripts/lib/control-panel.mjs:1-200 (buildDashboard and helper functions implemented)
  - **Evidence:** scripts/lib/github-messages.mjs:1-120 (renderPrBody now calls buildDashboard)
- ✅ **Satisfied**: Rebuild PR body renderer and update templates.
  - **Evidence:** scripts/lib/github-messages.mjs:240-360 (constructs dashboard and artifacts sections and passes them to template renderer)
  - **Evidence:** scripts/templates/github-messages/pr-body.md:1-12 (updated default template)
- ✅ **Satisfied**: Revise automated tests to assert new layout and behaviors.
  - **Evidence:** tests/github-messages.test.mjs:1-260 (updated tests assert Dashboard, Open/Actions, artifacts grouping)
  - **Evidence:** CI: workflow run id 23360519080 — unit: success
- ✅ **Satisfied**: Refresh documentation to reflect new tokens and dashboard structure.
  - **Evidence:** README.md:256-336 (new section documenting Factory Dashboard and required tokens)

</details>
