import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTransientRetryAttempts,
  resolveNextStatus
} from "../scripts/apply-pr-state.mjs";
import { FACTORY_PR_STATUSES } from "../scripts/lib/factory-config.mjs";
import {
  defaultPrMetadata
} from "../scripts/lib/pr-metadata.mjs";

test("resolveNextStatus prefers a valid FACTORY_STATUS override", () => {
  assert.equal(
    resolveNextStatus(FACTORY_PR_STATUSES.planning, FACTORY_PR_STATUSES.reviewing),
    FACTORY_PR_STATUSES.reviewing
  );
});

test("resolveNextStatus falls back to existing valid metadata status", () => {
  assert.equal(
    resolveNextStatus(FACTORY_PR_STATUSES.implementing, ""),
    FACTORY_PR_STATUSES.implementing
  );
});

test("resolveNextStatus rejects invalid FACTORY_STATUS overrides", () => {
  assert.throws(
    () => resolveNextStatus(FACTORY_PR_STATUSES.planning, "review-ready"),
    /Invalid FACTORY_STATUS/
  );
});

test("resolveNextStatus rejects invalid existing metadata statuses", () => {
  assert.throws(
    () => resolveNextStatus("review-ready", ""),
    /Invalid existing PR metadata status/
  );
});

test("transientRetryAttempts is preserved when reset passes __UNCHANGED__", () => {
  const metadata = defaultPrMetadata({
    transientRetryAttempts: 2
  });

  const nextMetadata = applyTransientRetryAttempts(metadata, "__UNCHANGED__");

  assert.equal(nextMetadata.transientRetryAttempts, 2);
});

test("transientRetryAttempts is preserved when env value is empty", () => {
  const metadata = defaultPrMetadata({
    transientRetryAttempts: 2
  });

  const nextMetadata = applyTransientRetryAttempts(metadata, "");

  assert.equal(nextMetadata.transientRetryAttempts, 2);
});

test("transientRetryAttempts is cleared when reset explicitly sets 0", () => {
  const metadata = defaultPrMetadata({
    transientRetryAttempts: 2
  });

  const nextMetadata = applyTransientRetryAttempts(metadata, "0");

  assert.equal(nextMetadata.transientRetryAttempts, 0);
});
