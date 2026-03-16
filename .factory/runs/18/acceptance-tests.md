# Acceptance Tests

1. **Implement commit summarizes staged code**
   - Given staged changes to `scripts/prepare-stage-push.mjs` and `tests/prepare-stage-push.test.mjs`, running the commit helper for mode `implement` produces the subject `factory(implement): update prepare stage push with tests` and omits the issue number.
2. **Repair commit references the issue**
   - With staged changes including `.github/workflows/_factory-stage.yml` and mode `repair`, the generated subject includes the stage prefix, a concise summary, and ends with `for issue #<n>` using the issue number provided.
3. **Fallback uses issue slug**
   - When only planning artifacts under `.factory/runs/<issue>/` are staged, the helper falls back to an `update <slug>` summary derived from the branch or issue title instead of emitting `issue #<n>`.
4. **Verb reflects change set**
   - When all staged entries are additions, the subject verb is `add`; when all deletions, it is `remove`; mixed changes yield `update`.
5. **Truncation adds ellipsis**
   - If descriptors plus the repair suffix exceed the maximum length, the helper truncates the summary portion and appends `...`, keeping the resulting subject within the limit while still ending with `for issue #<n>`.
6. **Rename uses destination descriptor**
   - For staged rename entries (`R100`), the generated summary references the destination path rather than the source path, ensuring the message mirrors the new file name.
