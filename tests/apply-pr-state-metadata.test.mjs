import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPrMetadata
} from "../scripts/lib/pr-metadata.mjs";

function applyTransientRetryAttempts(metadata, envValue) {
  const nextMetadata = {
    ...metadata
  };

  if (envValue !== undefined) {
    const transientRetryAttempts = `${envValue || ""}`.trim();

    if (transientRetryAttempts && transientRetryAttempts !== "__UNCHANGED__") {
      nextMetadata.transientRetryAttempts = Number(transientRetryAttempts);
    }
  }

  return nextMetadata;
}

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
