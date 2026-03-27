# Acceptance Tests – Run 105

- **PASS review renders new Factory Review header without legacy clutter**  
  Generate a PASS review with zero blocking findings and zero unmet requirement checks.  
  Verify the posted review/comment body starts with `## Factory Review`, shows `**✅ PASS** · Method: \`<method>\`` on its own line, includes bold `Summary`, `Findings`, and `Artifacts` lines with clickable links to `review.md` and `review.json`, and does **not** include the legacy “Autonomous review completed…” banner, plain `Summary:` line, or trailing artifacts footer.

- **REQUEST_CHANGES review shares layout and preserves detailed findings**  
  Produce a REQUEST_CHANGES review with at least one blocking finding and requirement gap.  
  Confirm the top section matches the PASS layout (decision emoji/label swapped), `### Blocking Findings` and `### Requirement Gaps` render concise summaries, the full blocking finding details appear within a `<details>` section after the requirement gaps, and the methodology text does not appear anywhere else in the body.

- **Traceability appears as a single collapsible block in both comment and review.md**  
  For either decision, ensure the traceability portion renders exactly one `<details>` element whose summary is `🧭 Traceability`, and inside it the requirement groups are plain Markdown subsections (no nested `<details>` or duplicated headings).  
  Validate that the same structure is present in the generated `review.md`.

- **Review authoring guidance omits manual methodology instruction**  
  Inspect `.factory/prompts/review.md` and the generated reviewer prompt to confirm it no longer asks the reviewer to add a methodology line to `review.md` and clarifies that traceability is embedded automatically as a single block.
