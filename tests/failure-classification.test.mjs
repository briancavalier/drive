import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFailure,
  FAILURE_TYPES,
  isTransientFailureType,
  parseRetryLimit
} from "../scripts/lib/failure-classification.mjs";

test("classifyFailure detects transient infrastructure errors", () => {
  assert.equal(
    classifyFailure("git push failed: Could not resolve host: github.com"),
    FAILURE_TYPES.transientInfra
  );
  assert.equal(
    classifyFailure("GitHub API 503: service unavailable"),
    FAILURE_TYPES.transientInfra
  );
});

test("classifyFailure detects stale branch conflicts", () => {
  assert.equal(
    classifyFailure("Automatic merge failed; fix conflicts and then commit the result."),
    FAILURE_TYPES.staleBranchConflict
  );
});

test("classifyFailure detects stale stage push races", () => {
  assert.equal(
    classifyFailure("! [rejected] HEAD -> factory/12-sample (fetch first)"),
    FAILURE_TYPES.staleStagePush
  );
  assert.equal(
    classifyFailure("error: failed to push some refs to 'https://github.com/example/repo'"),
    FAILURE_TYPES.staleStagePush
  );
});

test("classifyFailure detects configuration failures", () => {
  assert.equal(
    classifyFailure("Factory stage output modifies .github/workflows/** but FACTORY_GITHUB_TOKEN is not configured."),
    FAILURE_TYPES.configuration
  );
  assert.equal(
    classifyFailure("FACTORY_ARTIFACTS_PATH is required when FACTORY_MODE is \"review\"."),
    FAILURE_TYPES.configuration
  );
});

test("classifyFailure falls back to content_or_logic", () => {
  assert.equal(
    classifyFailure("Codex completed without producing repository changes."),
    FAILURE_TYPES.contentOrLogic
  );
});

test("transient helpers honor retry defaults", () => {
  assert.equal(isTransientFailureType(FAILURE_TYPES.transientInfra), true);
  assert.equal(isTransientFailureType(FAILURE_TYPES.configuration), false);
  assert.equal(parseRetryLimit("2"), 2);
  assert.equal(parseRetryLimit("invalid"), 2);
});
