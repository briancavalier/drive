### Problem statement

The factory PR posting format currently uses the heading "Factory Dashboard". Change that heading to "Factory Status" without altering the rest of the posting structure.

### Goals

- Rename the top heading in the factory PR posting format from "Factory Dashboard" to "Factory Status".
- Keep the rest of the PR posting format unchanged.

### Non-goals

- Changing the content, ordering, or behavior of other PR posting sections.
- Redesigning the overall dashboard layout.

### Constraints

- Preserve existing metadata parsing and downstream factory behavior.
- Limit the change to the heading text unless tests require fixture updates.

### Acceptance criteria

- Factory-generated PR bodies render "Factory Status" where they previously rendered "Factory Dashboard".
- Existing PR metadata parsing and related tests continue to pass.

### Risk

- The heading text may be asserted in tests or documentation and need synchronized updates.

### Affected area

CI / Automation
