# Repair Notes

- CI previously failed because the review router did not inspect factory labels.
- A later pass failed because prompt payloads were too large and drowned out the
  actual failure signal.
- The next repair should stay scoped to routing, prompt construction, and
  artifact parsing.
