import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareReviewArtifactRepair,
  buildFailureSignature
} from "../scripts/prepare-review-artifact-repair.mjs";
import { defaultPrMetadata, renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { FACTORY_PR_STATUSES } from "../scripts/lib/factory-config.mjs";
import { normalizeFailureSignature } from "../scripts/lib/repair-state.mjs";

function makePullRequestBody(metadataOverrides = {}) {
  const metadata = defaultPrMetadata({
    issueNumber: 54,
    artifactsPath: ".factory/runs/54",
    status: FACTORY_PR_STATUSES.reviewing,
    ...metadataOverrides
  });

  return renderPrBody({
    issueNumber: metadata.issueNumber,
    branch: "factory/54-harden-autonomous-review",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: metadata.artifactsPath,
    metadata
  });
}

test("prepareReviewArtifactRepair increments repair attempts and emits failure metadata", async () => {
  const env = {
    FACTORY_PR_NUMBER: "42",
    FACTORY_FAILURE_TYPE: "review_artifact_contract",
    FACTORY_FAILURE_PHASE: "review",
    FACTORY_FAILURE_MESSAGE:
      "review.md must include the canonical Traceability section derived from review.json"
  };
  const outputs = {};
  const { repairState, failureMetadata } = await prepareReviewArtifactRepair({
    env,
    dependencies: {
      getPullRequest: async () => ({
        body: makePullRequestBody({
          repairAttempts: 0,
          maxRepairAttempts: 3,
          lastFailureSignature: null,
          repeatedFailureCount: 0
        })
      }),
      setOutputs: (values) => Object.assign(outputs, values)
    }
  });
  const expectedSignature = normalizeFailureSignature(
    buildFailureSignature({
      failureType: env.FACTORY_FAILURE_TYPE,
      failurePhase: env.FACTORY_FAILURE_PHASE,
      failureMessage: env.FACTORY_FAILURE_MESSAGE
    })
  );

  assert.equal(repairState.blocked, false);
  assert.equal(repairState.repairAttempts, 1);
  assert.equal(repairState.repeatedFailureCount, 0);
  assert.equal(repairState.lastFailureSignature, expectedSignature);
  assert.equal(outputs.repair_attempts, "1");
  assert.equal(outputs.repeated_failure_count, "0");
  assert.equal(outputs.last_failure_signature, expectedSignature);
  assert.equal(outputs.blocked, "false");
  assert.ok(outputs.failure_metadata);
  assert.equal(failureMetadata.type, env.FACTORY_FAILURE_TYPE);
  assert.equal(failureMetadata.phase, env.FACTORY_FAILURE_PHASE);
  assert.equal(failureMetadata.message, env.FACTORY_FAILURE_MESSAGE.trim());
  assert.match(failureMetadata.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("prepareReviewArtifactRepair blocks when repair attempts exceed limit", async () => {
  const env = {
    FACTORY_PR_NUMBER: "42",
    FACTORY_FAILURE_TYPE: "review_artifact_contract",
    FACTORY_FAILURE_PHASE: "review",
    FACTORY_FAILURE_MESSAGE: "review.json was missing"
  };
  const outputs = {};
  const { repairState } = await prepareReviewArtifactRepair({
    env,
    dependencies: {
      getPullRequest: async () => ({
        body: makePullRequestBody({
          repairAttempts: 3,
          maxRepairAttempts: 3,
          lastFailureSignature: null,
          repeatedFailureCount: 0
        })
      }),
      setOutputs: (values) => Object.assign(outputs, values)
    }
  });

  assert.equal(repairState.blocked, true);
  assert.equal(outputs.blocked, "true");
  assert.equal(outputs.repair_attempts, "4");
  assert.equal(outputs.repeated_failure_count, "0");
});

test("prepareReviewArtifactRepair rejects unsupported failure types", async () => {
  await assert.rejects(
    () =>
      prepareReviewArtifactRepair({
        env: {
          FACTORY_PR_NUMBER: "42",
          FACTORY_FAILURE_TYPE: "configuration",
          FACTORY_FAILURE_PHASE: "review_delivery",
          FACTORY_FAILURE_MESSAGE: "Unable to resolve review methodology"
        },
        dependencies: {
          getPullRequest: async () => ({
            body: makePullRequestBody()
          }),
          setOutputs: () => {}
        }
      }),
    /requires FACTORY_FAILURE_TYPE "review_artifact_contract"/
  );
});
