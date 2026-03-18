# Acceptance Tests

1. **No-op stage run classification**
   - Simulate `prepare-stage-push` with identical local and remote heads.
   - Verify it emits `failure_type=stage_noop`, includes a diagnostics summary (head hashes, zero staged files), and the failure comment renders the “Stage diagnostics” section.

2. **Setup guardrail failure classification**
   - Run `prepare-stage-push` where `.github/workflows/**` is modified without `FACTORY_GITHUB_TOKEN`.
   - Confirm the failure is typed as `stage_setup`, the diagnostics list the missing token, and `handle-stage-failure` keeps the PR blocked with targeted guidance.

3. **Bounded recovery counters**
   - Drive `handle-stage-failure` twice with `stage_noop` inputs; ensure the first increments the counter and leaves the PR plan-ready, while the second escalates to blocked and the comment states no further automated retries remain.
   - Confirm successful stage completion resets both counters to zero.

4. **Prompt context updates**
   - Build an implement-stage prompt after a recorded `stage_noop` failure.
   - Assert Run Metadata lists `last failure type: stage_noop`, shows the attempt count, and the prompt body reminds Codex to avoid another no-op.

5. **Documentation and diagnosis gating**
   - Run the factory unit test that exercises the diagnosis gate (or a targeted script) and confirm `stage_noop`/`stage_setup` skip Codex diagnosis.
   - Check README updates clearly explain the new failure classes and operator expectations.
