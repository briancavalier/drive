# Acceptance Tests

1. **PR body stage emoji**
   - Execute `node --eval "import('./scripts/lib/pr-metadata.mjs').then(({renderPrBody}) => console.log(renderPrBody({issueNumber:24, branch:'factory/24-test', repositoryUrl:'https://github.com/org/repo', artifactsPath:'.factory/runs/24', metadata:{status:'plan_ready', repairAttempts:0, maxRepairAttempts:3}})))"`.
   - Verify the `## Status` section contains `- Stage: 👀 plan_ready` and `- Repair attempts:` remains unchanged.

2. **PR body CI emoji**
   - Repeat the command above with `ciStatus: 'success'` and confirm the output includes `- CI: ✅ success`.

3. **Operator notes emojis**
   - Inspect the rendered PR body and confirm the operator notes list contains the exact prefixes `▶️ Apply`, `⏸️ Apply`, and `▶️ Remove`.

4. **Plan-ready comment prefix**
   - Run `node --eval "import('./scripts/lib/github-messages.mjs').then(({renderPlanReadyIssueComment}) => console.log(renderPlanReadyIssueComment({prNumber:24, implementLabel:'factory:implement'})))"` and verify the message starts with `👀`.

5. **Blocked comment prefix**
   - Run `node --eval "import('./scripts/handle-stage-failure.mjs').then(({buildFailureComment}) => console.log(buildFailureComment({action:'implement', failureType:'content_or_logic', retryAttempts:0, failureMessage:''})))"`.
   - Ensure the printed message starts with `⚠️` for each failure branch (e.g., repeat with `failureType:'transient_infra'` and confirm).

6. **Review pass comment prefix**
   - Execute `node --eval "import('./scripts/lib/github-messages.mjs').then(({renderReviewPassComment}) => console.log(renderReviewPassComment({methodology:'default', summary:'All checks passed.', blockingFindingsCount:0, artifactsPath:'.factory/runs/24'})))"` and verify the message begins with `✅`.

7. **Automated test suite**
   - Run `npm test -- github-messages` (or `node --test tests/github-messages.test.mjs`) and confirm the suite passes, indicating emoji mappings are covered by unit tests.
