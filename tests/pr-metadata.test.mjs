import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanReadyPrMetadata,
  defaultPrMetadata,
  extractPrMetadata,
  renderPrBody
} from "../scripts/lib/pr-metadata.mjs";

test("renderPrBody embeds parseable metadata", () => {
  const body = renderPrBody({
    issueNumber: 7,
    branch: "factory/7-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/7",
    metadata: defaultPrMetadata({
      issueNumber: 7,
      artifactsPath: ".factory/runs/7",
      status: "plan_ready"
    })
  });

  const metadata = extractPrMetadata(body);

  assert.equal(metadata.issueNumber, 7);
  assert.equal(metadata.artifactsPath, ".factory/runs/7");
  assert.equal(metadata.status, "plan_ready");
  assert.equal(metadata.lastReadySha, null);
  assert.equal(metadata.lastProcessedWorkflowRunId, null);
  assert.equal(metadata.lastFailureType, null);
  assert.equal(metadata.lastReviewArtifactFailure, null);
  assert.equal(metadata.transientRetryAttempts, 0);
  assert.equal(metadata.pendingReviewSha, null);
  assert.equal(metadata.costEstimateUsd, 0);
  assert.equal(metadata.costEstimateBand, "");
  assert.match(body, /Closes #7/);
  assert.match(body, /\[spec\.md\]\(https:\/\/github\.com\/example\/repo\/blob\//);
  assert.match(body, /\[cost-summary\.json\]\(https:\/\/github\.com\/example\/repo\/blob\//);
  assert.match(body, /\[review\.md\]\(https:\/\/github\.com\/example\/repo\/blob\//);
});

test("buildPlanReadyPrMetadata uses prepared max repair attempts when metadata is absent", () => {
  const metadata = buildPlanReadyPrMetadata({
    metadata: {},
    issueNumber: 7,
    artifactsPath: ".factory/runs/7",
    preparedMaxRepairAttempts: 5
  });

  assert.equal(metadata.issueNumber, 7);
  assert.equal(metadata.artifactsPath, ".factory/runs/7");
  assert.equal(metadata.status, "plan_ready");
  assert.equal(metadata.maxRepairAttempts, 5);
});

test("buildPlanReadyPrMetadata preserves existing max repair attempts", () => {
  const metadata = buildPlanReadyPrMetadata({
    metadata: defaultPrMetadata({
      maxRepairAttempts: 7
    }),
    issueNumber: 7,
    artifactsPath: ".factory/runs/7",
    preparedMaxRepairAttempts: 5
  });

  assert.equal(metadata.maxRepairAttempts, 7);
});
