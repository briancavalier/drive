# Acceptance Tests

1. **Actionable failure opens a follow-up issue**
   - Simulate `handle-stage-failure` with a control-plane advisory; verify tests assert `createIssue` is called and the posted comment mentions the new Factory Request number.
2. **Duplicate signature suppresses new issue creation**
   - Unit test stubs `searchIssues` to return an open issue containing the signature marker; confirm the handler skips `createIssue` and still appends a comment note referencing the existing issue.
3. **Ineligible failure skips follow-up**
   - Test a transient infrastructure failure to ensure the classifier reports `actionable: false` and `handle-stage-failure` posts the standard comment with no follow-up section.
4. **Generated issue body matches template and evidence requirements**
   - Golden/snapshot test covering `buildFollowupIssue` output: headings align with the Factory Request form, and the problem statement includes PR number, workflow run link, failure type, and artifacts link.
5. **Documentation reflects automated follow-up behavior**
   - Check README updates (manual or lint rule) to confirm the failure-handling section now explains when follow-up issues are created and how deduplication works.
