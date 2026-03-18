# Acceptance Tests

1. **Review default resolves to `gpt-5-mini`**
   - Run `node --test tests/factory-config.test.mjs`.
   - Expected: the suite passes and assertions confirm `DEFAULT_FACTORY_REVIEW_MODEL` equals `"gpt-5-mini"`.
2. **Workflow fallbacks prefer `gpt-5-mini` for diagnosis**
   - Run `node --test tests/factory-config-contracts.test.mjs`.
   - Expected: regex checks pass, verifying both failure-diagnosis jobs reference `vars.FACTORY_FAILURE_DIAGNOSIS_MODEL || 'gpt-5-mini'`.
3. **Documentation reflects the new lightweight default**
   - Inspect the README section covering stage model defaults (around the optional override guidance).
   - Expected: text now states that review and failure-diagnosis fall back to `gpt-5-mini` when overrides are unset.
4. **No lingering `codex-mini-latest` fallbacks**
   - Run `rg "codex-mini-latest"` from the repository root.
   - Expected: only historical references (if any) remain; no active default or fallback paths surface in the output.
5. **Regression suite remains green**
   - Run `npm test`.
   - Expected: all automated tests succeed after the default update.
