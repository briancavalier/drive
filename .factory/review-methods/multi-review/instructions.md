## Review Strategy: Multi-Review

Run the selected specialist reviewers independently, write one reviewer artifact per reviewer, and let the coordinator synthesize the final autonomous review.

Requirements:

1. Read `.factory/runs/.../reviewers/selection.json` or the selection context in the prompt to determine which reviewers must run.
2. For each selected reviewer, apply that reviewer’s rubric and write `reviewers/<name>.json`.
3. Do not merge reviewer findings manually into `review.json` or `review.md`; the coordinator script creates the canonical final review.
4. Reviewer artifacts must be evidence-backed and must follow the reviewer artifact schema exactly.
5. If a selected reviewer cannot complete its rubric because evidence is missing, record that as a finding in that reviewer artifact instead of skipping it.
