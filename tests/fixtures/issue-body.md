### Problem statement

Add a reproducible factory scaffold for issue-to-PR automation.

### Goals

- Create a draft PR from a structured issue.
- Generate planning artifacts.

### Non-goals

- Multi-repo orchestration

### Constraints

- Must run entirely inside GitHub Actions.
- Must keep a human merge gate.

### Acceptance criteria

- A maintainer can label an issue and get a draft PR.
- The planning artifacts are committed into the PR branch.

### Risk

- Poor prompts could widen scope.

### Affected area

CI / Automation
