# Acceptance Tests – Run 111

- **Ambiguity request still produces a question with logged rationale**  
  Simulate `.factory/tmp/intervention-request.json` containing a high-ambiguity request (defaults or explicit policy context).  
  After running `node scripts/handle-stage-intervention-request.mjs`, assert:  
  - The PR comment contains the helper-supplied rationale text.  
  - `FACTORY_INTERVENTION` is a question intervention identical to today (stage `implement`, question kind `ambiguity`).

- **Low-ambiguity request auto-resumes using the recommended option**  
  Feed `handle-stage-intervention-request` a request whose `policyContext` marks ambiguity `low`, reversible `true`, expected rework `low`, and includes a resumable recommended option.  
  Verify the script clears `FACTORY_INTERVENTION`, sets `FACTORY_STATUS` back to `implementing`, writes `FACTORY_PENDING_STAGE_DECISION` mirroring the recommended option, and posts an auto-resolution note.

- **Request without a resumable option fails with a stage-setup intervention**  
  Pass a request whose policy factors would otherwise allow auto-continue but whose options lack `resume_current_stage`.  
  Confirm the helper drives a `stage_setup` failure intervention, keeps the PR blocked, and explains the `no_resumable_option` reason in the comment.

- **Self-modify guard failures still emit approval questions with policy traceability**  
  Trigger `scripts/handle-stage-failure.mjs` with a self-modify guard failure.  
  Ensure it consults the shared helper, produces the same approval question as before, and appends the policy rationale to the comment or logs.
