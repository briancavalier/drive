# Spec: Improve Traceability Scanability in Review Comments

## Summary
- Refresh the canonical traceability markdown so requirement statuses are easy to spot when `<details>` blocks are expanded inside GitHub review comments.
- Retain the existing summary/details structure while presenting requirement entries with status-first badges and condensed evidence formatting.
- Keep canonical markdown deterministic so downstream normalization and tests continue to function.

## Current Behavior
- `renderCanonicalTraceabilityMarkdown` outputs, per requirement-type group, a `<details>` block whose body repeats "Requirement", "Status", and "Evidence" as nested list items.
- Status text (``satisfied``, ``partially_satisfied``, etc.) appears only as inline code, with no visual differentiation beyond the word itself.
- Evidence items are emitted as a nested unordered list under an "Evidence:" label, producing three levels of indentation for every requirement.
- Multiple tests assert against the current strings (e.g., "- Requirement:"), so any layout change must update the canonical expectations everywhere.

## Goals & Requirements
- Surface requirement status with an immediately recognizable icon + label so mixed-status lists can be scanned quickly.
- Keep the top-level "## 🧭 Traceability" heading and per-type `<details>` blocks unchanged so existing collapsible behavior still works.
- Maintain deterministic, normalization-friendly markdown (no random whitespace or ordering changes beyond the new layout).
- Ensure updated markdown passes through existing review artifact validation and is exercised by automated tests.

## Proposed Changes
### Canonical Traceability Groups
- Preserve one `<details>` block per requirement-type group (`Acceptance Criteria`, `Spec Commitments`, `Plan Deliverables`).
- Update each `<summary>` to append status counts that exist within the group, ordered by severity (❌, ⚠️, ✅, ⬜). Example: `<summary>🧭 Traceability: Acceptance Criteria (❌ 1, ⚠️ 2, ✅ 3)</summary>`.

### Status Badges
- Map requirement statuses to icon + human label pairs:
  - ``satisfied`` → `✅ Satisfied`
  - ``partially_satisfied`` → `⚠️ Partially satisfied`
  - ``not_satisfied`` → `❌ Not satisfied`
  - ``not_applicable`` → `⬜ Not applicable`
- Expose helpers so the same mapping is reused across canonical rendering and any detail views.

### Requirement Entry Layout
- Replace the nested "Requirement"/"Status" list with a single bullet per requirement: `- ✅ **Satisfied**: Acceptance criteria are covered by automated tests.`
- Continue to show the raw status code (``satisfied`` etc.) only when needed for machine parity (e.g., keep it in review.json, but omit the backticked status line from markdown).
- Keep requirement text verbatim; do not truncate or modify punctuation.

### Evidence Formatting
- For each requirement bullet, follow with an evidence sub-list that uses bolded "Evidence" label once, with individual items in a compact bullet list:
  ```markdown
  - ✅ **Satisfied**: Acceptance criteria are covered by automated tests.
    - **Evidence:** End-to-end tests cover acceptance criteria.
    - **Evidence:** Manual QA scope.
  ```
- When evidence contains multiple entries, render each on its own line to avoid overly long inline strings.
- Preserve evidence ordering supplied by `review.json`.

### Traceability Details Helper
- Update `renderRequirementChecksWithHeading` and `renderTraceabilityDetails` to reuse the new bullet layout so any downstream details rendering (e.g., in prompts) matches the canonical format.

### Normalization & Tests
- Adjust normalization logic implicitly by updating the canonical render function; ensure any fixture rewrites or string matches in tests reflect the new format.
- Update documentation (e.g., README excerpt describing traceability) to depict or describe the new layout if it references the old structure.

## Assumptions
- GitHub markdown renders nested bullets with bold labels and emoji consistently inside `<details>` blocks.
- Requirement evidence arrays remain relatively short, so per-item bullets remain readable.
- No consumers depend on the literal text "Requirement:"/"Status:"— searches indicate only tests assert on these strings.

## Out of Scope
- Changing how requirement statuses are determined or stored in `review.json`.
- Altering the collapsed summary headings or overall traceability ordering beyond the specified status count augmentation.
- Introducing tables or HTML beyond the existing `<details>` wrapper (to avoid compatibility risks).

## Risks & Mitigations
- **Risk:** Emoji overuse could distract. *Mitigation:* Limit to one icon per status and only include counts for statuses present.
- **Risk:** Tests or normalization relying on the old literal strings may fail. *Mitigation:* Audit and update every assertion that references the canonical traceability markup.
- **Risk:** Evidence bullets could feel repetitive. *Mitigation:* Bold the "Evidence" label to reduce scanning effort while keeping items separate for readability.

## Open Questions
- None identified; revisit once initial implementation draft reveals additional coupling.
