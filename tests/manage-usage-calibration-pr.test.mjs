import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUsageCalibrationPrBody,
  main as manageUsageCalibrationPr
} from "../scripts/manage-usage-calibration-pr.mjs";

test("buildUsageCalibrationPrBody includes run stats and source link", () => {
  const body = buildUsageCalibrationPrBody({
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "automation/usage-calibration-20260325-150000",
    bucketsUpdated: 4,
    entriesEvaluated: 10,
    entriesSkipped: 3
  });

  assert.match(body, /Buckets updated: 4/);
  assert.match(body, /Entries evaluated: 10/);
  assert.match(body, /Entries used: 7/);
  assert.match(body, /Entries skipped: 3/);
  assert.match(body, /https:\/\/github\.com\/example\/repo\/actions\/runs\/123/);
});

test("manageUsageCalibrationPr opens a new PR and closes prior calibration PRs", async () => {
  const requests = [];

  const result = await manageUsageCalibrationPr(
    {
      GITHUB_REPOSITORY: "example/repo",
      FACTORY_GITHUB_TOKEN: "token",
      FACTORY_CALIBRATION_BRANCH: "automation/usage-calibration-20260325-150000",
      FACTORY_CALIBRATION_BASE_BRANCH: "main",
      FACTORY_CALIBRATION_PR_TITLE: "Factory: Update usage calibration",
      FACTORY_CALIBRATION_BRANCH_PREFIX: "automation/usage-calibration-",
      FACTORY_CALIBRATION_RUN_URL: "https://github.com/example/repo/actions/runs/123",
      FACTORY_CALIBRATION_BUCKETS_UPDATED: "4",
      FACTORY_CALIBRATION_ENTRIES_EVALUATED: "10",
      FACTORY_CALIBRATION_ENTRIES_SKIPPED: "3"
    },
    {
      getRepoContextImpl: () => ({
        owner: "example",
        repo: "repo",
        serverUrl: "https://github.com"
      }),
      searchIssuesImpl: async () => ({
        items: [
          { number: 10, title: "Factory: Update usage calibration", pull_request: {} },
          { number: 11, title: "Unrelated PR", pull_request: {} }
        ]
      }),
      getPullRequestImpl: async (prNumber) => {
        if (prNumber === 10) {
          return {
            number: 10,
            state: "open",
            base: { ref: "main" },
            head: { ref: "automation/usage-calibration-20260318-150000" }
          };
        }

        return {
          number: prNumber,
          state: "open",
          base: { ref: "main" },
          head: { ref: "feature/other" }
        };
      },
      createPullRequestImpl: async (payload) => ({
        number: 12,
        html_url: "https://github.com/example/repo/pull/12",
        ...payload
      }),
      githubRequestImpl: async (requestPath, options) => {
        requests.push({ requestPath, options });
        return null;
      }
    }
  );

  assert.equal(result.prNumber, 12);
  assert.equal(result.prUrl, "https://github.com/example/repo/pull/12");
  assert.equal(result.replacedPrCount, 1);
  assert.equal(result.deletedBranchCount, 1);
  assert.deepEqual(requests, [
    {
      requestPath: "/repos/example/repo/pulls/10",
      options: {
        method: "PATCH",
        body: { state: "closed" }
      }
    },
    {
      requestPath: "/repos/example/repo/git/refs/heads/automation/usage-calibration-20260318-150000",
      options: { method: "DELETE" }
    }
  ]);
});
