import test from "node:test";
import assert from "node:assert/strict";
import { finalizePlan } from "../scripts/finalize-plan.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";

test("finalizePlan removes obsolete cost labels, adds plan-ready labels, and comments without throwing", async () => {
  const removeLabelCalls = [];
  const addLabelsCalls = [];
  const commentCalls = [];
  const updateCalls = [];
  const createCalls = [];

  await finalizePlan({
    env: {
      FACTORY_ISSUE_NUMBER: "84",
      FACTORY_PR_NUMBER: "0",
      FACTORY_BRANCH: "factory/84-sample",
      FACTORY_ARTIFACTS_PATH: ".factory/runs/84",
      FACTORY_MAX_REPAIR_ATTEMPTS: "3",
      GITHUB_REF_NAME: "main",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "example/repo"
    },
    getIssueImpl: async () => ({
      number: 84,
      title: "[factory] Sample fix"
    }),
    findOpenPullRequestByHeadImpl: async () => null,
    createPullRequestImpl: async (payload) => {
      createCalls.push(payload);
      return {
        number: 85,
        labels: []
      };
    },
    updatePullRequestImpl: async (payload) => {
      updateCalls.push(payload);
    },
    addLabelsImpl: async (issueNumber, labels) => {
      addLabelsCalls.push({ issueNumber, labels });
    },
    removeLabelImpl: async (issueNumber, label) => {
      removeLabelCalls.push({ issueNumber, label });
    },
    commentOnIssueImpl: async (issueNumber, body) => {
      commentCalls.push({ issueNumber, body });
    },
    loadExistingCostSummaryImpl: () => ({ totalUsd: 0.2 }),
    buildCostMetadataFromSummaryImpl: () => ({
      costEstimateUsd: 0.2,
      costEstimateBand: "medium",
      costEstimateEmoji: "🟡"
    }),
    buildCostLabelUpdateImpl: () => ({
      addLabel: FACTORY_LABELS.costMedium
    }),
    renderPlanReadyIssueCommentImpl: ({ prNumber }) =>
      `PR #${prNumber} ready; comment /factory implement`,
    renderPrBodyImpl: ({ prNumber = null }) => `PR body for ${prNumber ?? "draft"}`
  });

  assert.equal(createCalls.length, 1);
  assert.deepEqual(updateCalls, [
    {
      prNumber: 85,
      body: "PR body for 85"
    }
  ]);
  assert.deepEqual(removeLabelCalls, [
    { issueNumber: 85, label: FACTORY_LABELS.costLow },
    { issueNumber: 85, label: FACTORY_LABELS.costHigh }
  ]);
  assert.deepEqual(addLabelsCalls, [
    {
      issueNumber: 85,
      labels: [FACTORY_LABELS.managed, FACTORY_LABELS.planReady, FACTORY_LABELS.costMedium]
    }
  ]);
  assert.deepEqual(commentCalls, [
    {
      issueNumber: 84,
      body: "PR #85 ready; comment /factory implement"
    }
  ]);
});
