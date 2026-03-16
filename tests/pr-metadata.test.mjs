import test from "node:test";
import assert from "node:assert/strict";
import {
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
  assert.equal(metadata.transientRetryAttempts, 0);
  assert.match(body, /\[spec\.md\]\(https:\/\/github\.com\/example\/repo\/blob\//);
  assert.match(body, /\[review\.md\]\(https:\/\/github\.com\/example\/repo\/blob\//);
});
