import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultApprovalIntervention,
  buildPlanReadyPrMetadata,
  canonicalizePrMetadata,
  defaultFailureIntervention,
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
  assert.equal(metadata.pendingReviewSha, null);
  assert.equal(metadata.intervention, null);
  assert.equal(metadata.autoAppliedSelfModifyLabel, false);
  assert.equal(metadata.costEstimateUsd, 0);
  assert.equal(metadata.costEstimateBand, "");
  assert.match(body, /Closes #7/);
  assert.match(body, /\[Spec\]\(https:\/\/github\.com\/example\/repo\/blob\//);
  assert.match(body, /\[Cost summary\]\(https:\/\/github\.com\/example\/repo\/blob\//);
  assert.match(body, /\[Review summary\]\(https:\/\/github\.com\/example\/repo\/blob\//);
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

test("buildPlanReadyPrMetadata rewrites drifted artifacts paths to the canonical issue path", () => {
  const metadata = buildPlanReadyPrMetadata({
    metadata: defaultPrMetadata({
      artifactsPath: ".factory/runs/999"
    }),
    issueNumber: 7,
    artifactsPath: ".factory/runs/999",
    preparedMaxRepairAttempts: 5
  });

  assert.equal(metadata.artifactsPath, ".factory/runs/7");
});

test("renderPrBody rewrites metadata and links to the canonical artifacts path", () => {
  const body = renderPrBody({
    issueNumber: 7,
    branch: "factory/7-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/999",
    metadata: defaultPrMetadata({
      issueNumber: 7,
      artifactsPath: ".factory/runs/999",
      status: "plan_ready"
    })
  });

  const metadata = extractPrMetadata(body);

  assert.equal(metadata.artifactsPath, ".factory/runs/7");
  assert.match(body, /\.factory\/runs\/7\/spec\.md/);
});

test("canonicalizePrMetadata preserves unrelated metadata fields while fixing artifacts path", () => {
  const metadata = canonicalizePrMetadata({
    issueNumber: 7,
    artifactsPath: ".factory/runs/999",
    status: "reviewing",
    intervention: defaultFailureIntervention({
      payload: {
        failureType: "stage_noop",
        stageNoopAttempts: 2
      }
    })
  });

  assert.equal(metadata.artifactsPath, ".factory/runs/7");
  assert.equal(metadata.status, "reviewing");
  assert.equal(metadata.intervention.payload.stageNoopAttempts, 2);
});

test("defaultPrMetadata includes a null intervention by default", () => {
  const metadata = defaultPrMetadata();

  assert.equal(metadata.intervention, null);
  assert.equal(metadata.autoAppliedSelfModifyLabel, false);
});

test("renderPrBody preserves failure intervention metadata", () => {
  const body = renderPrBody({
    issueNumber: 7,
    branch: "factory/7-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/7",
    metadata: defaultPrMetadata({
      issueNumber: 7,
      artifactsPath: ".factory/runs/7",
      status: "blocked",
      intervention: defaultFailureIntervention({
        summary: "Factory encountered a configuration error and is now blocked.",
        detail: "Missing FACTORY_GITHUB_TOKEN",
        payload: {
          failureType: "configuration",
          retryAttempts: 0
        }
      })
    })
  });

  const metadata = extractPrMetadata(body);

  assert.equal(metadata.intervention.type, "failure");
  assert.equal(metadata.intervention.summary, "Factory encountered a configuration error and is now blocked.");
  assert.equal(metadata.intervention.payload.failureType, "configuration");
});

test("canonicalizePrMetadata preserves populated intervention payloads", () => {
  const metadata = canonicalizePrMetadata({
    issueNumber: 7,
    artifactsPath: ".factory/runs/999",
    status: "blocked",
    intervention: {
      type: "failure",
      status: "open",
      payload: {
        failureType: "stage_setup"
      }
    }
  });

  assert.equal(metadata.artifactsPath, ".factory/runs/7");
  assert.equal(metadata.intervention.type, "failure");
  assert.equal(metadata.intervention.payload.failureType, "stage_setup");
  assert.equal(metadata.intervention.payload.retryAttempts, 0);
});

test("renderPrBody preserves approval intervention metadata", () => {
  const body = renderPrBody({
    issueNumber: 7,
    branch: "factory/7-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/7",
    metadata: defaultPrMetadata({
      issueNumber: 7,
      artifactsPath: ".factory/runs/7",
      status: "blocked",
      blockedAction: "implement",
      intervention: defaultApprovalIntervention({
        id: "int_q_123",
        summary: "Need approval to continue with protected control-plane changes",
        payload: {
          question: "Should the factory authorize self-modify for the next resumed stage and continue?",
          recommendedOptionId: "approve_once",
          applySelfModifyLabelOnApproval: true,
          options: [
            { id: "approve_once", label: "Approve once", effect: "resume_current_stage" },
            { id: "deny", label: "Do not approve", effect: "remain_blocked" }
          ],
          resumeContext: {
            ciRunId: "777",
            reviewId: "55",
            repairAttempts: 2,
            repeatedFailureCount: 1,
            failureSignature: "sig-1",
            stageNoopAttempts: 0,
            stageSetupAttempts: 1
          }
        }
      })
    })
  });

  const metadata = extractPrMetadata(body);

  assert.equal(metadata.intervention.type, "approval");
  assert.equal(metadata.intervention.id, "int_q_123");
  assert.equal(metadata.intervention.payload.options[0].id, "approve_once");
  assert.equal(metadata.intervention.payload.applySelfModifyLabelOnApproval, true);
  assert.equal(metadata.intervention.payload.resumeContext.ciRunId, "777");
  assert.equal(metadata.intervention.payload.resumeContext.reviewId, "55");
  assert.equal(metadata.intervention.payload.resumeContext.repairAttempts, 2);
});
