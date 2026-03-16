import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { processReview } from "../scripts/process-review.mjs";

function makeArtifacts(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-"));
  const reviewJson = {
    methodology: "default",
    decision: "pass",
    summary: "All acceptance criteria are satisfied.",
    blocking_findings_count: 0,
    findings: [],
    ...overrides.reviewJson
  };
  const reviewMd =
    overrides.reviewMd ||
    [
      "# Autonomous Review",
      "",
      "Decision: pass",
      "",
      "No blocking findings."
    ].join("\n");

  fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(reviewJson, null, 2));
  fs.writeFileSync(path.join(dir, "review.md"), reviewMd);

  return { dir, reviewJson, reviewMd };
}

function baseEnv(overrides = {}) {
  return {
    ...process.env,
    FACTORY_PR_NUMBER: "33",
    FACTORY_ISSUE_NUMBER: "1",
    FACTORY_BRANCH: "factory/1-sample",
    FACTORY_ARTIFACTS_PATH: overrides.artifactsPath || "",
    FACTORY_REVIEW_METHOD: overrides.reviewMethod || "default",
    ...overrides.env
  };
}

test("processReview marks PR ready and comments on pass decision", async () => {
  const { dir } = makeArtifacts();
  const env = baseEnv({ artifactsPath: dir });
  const execCalls = [];
  let commentBody = "";

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
      callback(null, "", "");
    },
    githubClient: {
      commentOnIssue: async (prNumber, body) => {
        assert.equal(prNumber, 33);
        commentBody = body;
      },
      submitPullRequestReview: async () => {
        throw new Error("submitPullRequestReview should not be called for pass decision");
      }
    }
  });

  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, ["scripts/apply-pr-state.mjs"]);
  assert.ok(commentBody.includes("decision **PASS**"));
  assert.ok(commentBody.includes("Artifacts"));
});

test("processReview rejects pass decision when blocking findings present", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      blocking_findings_count: 1,
      findings: [
        {
          level: "blocking",
          title: "Security regression",
          details: "Detected blocking regression.",
          scope: "src/index.js",
          recommendation: "Fix the regression."
        }
      ]
    }
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.rejects(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    }),
    /decision "pass" is not allowed/
  );
});

test("processReview submits REQUEST_CHANGES review when decision requests changes", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      findings: [
        {
          level: "blocking",
          title: "Missing tests",
          details: "Acceptance criteria are not fully covered.",
          scope: "tests/new-feature.test.js",
          recommendation: "Add tests covering negative paths."
        }
      ]
    },
    reviewMd: "# Findings\n\n- Missing tests"
  });
  const env = baseEnv({ artifactsPath: dir });
  let reviewPayload = null;

  await processReview({
    env,
    execFileImpl: (_file, _args, _options, callback) => {
      callback(null, "", "");
    },
    githubClient: {
      commentOnIssue: async () => {
        throw new Error("commentOnIssue should not be called for request_changes decision");
      },
      submitPullRequestReview: async (payload) => {
        reviewPayload = payload;
      }
    }
  });

  assert.equal(reviewPayload.prNumber, 33);
  assert.equal(reviewPayload.event, "REQUEST_CHANGES");
  assert.match(reviewPayload.body, /Autonomous review decision: REQUEST_CHANGES/);
  assert.match(reviewPayload.body, /Missing tests/);
});

test("processReview rejects invalid methodology", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      methodology: "custom"
    }
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.rejects(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    }),
    /does not match expected "default"/
  );
});
