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
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "A factory-managed PR that reaches green CI enters review.",
        status: "satisfied",
        evidence: "Verified by CI routing and review stage tests."
      }
    ],
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
      "## Traceability",
      "",
      "- acceptance_criterion | A factory-managed PR that reaches green CI enters review. | satisfied | Verified by CI routing and review stage tests.",
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

function makeOverrides(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-messages-"));

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }

  return dir;
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
  assert.equal(execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID, "");
  assert.equal(execCalls[0].options.env.FACTORY_TRANSIENT_RETRY_ATTEMPTS, "0");
  assert.ok(commentBody.includes("decision **PASS**"));
  assert.ok(commentBody.includes("Artifacts"));
});

test("processReview uses configured pass-comment overrides", async () => {
  const { dir } = makeArtifacts();
  const overridesRoot = makeOverrides({
    "review-pass-comment.md": "PASS OVERRIDE {{REVIEW_METHOD}} :: {{REVIEW_SUMMARY}}"
  });
  const env = baseEnv({ artifactsPath: dir });
  let commentBody = "";

  await processReview({
    env,
    githubMessageOptions: { overridesRoot },
    execFileImpl: (_file, _args, _options, callback) => {
      callback(null, "", "");
    },
    githubClient: {
      commentOnIssue: async (_prNumber, body) => {
        commentBody = body;
      },
      submitPullRequestReview: async () => {
        throw new Error("submitPullRequestReview should not be called for pass decision");
      }
    }
  });

  assert.equal(commentBody, "PASS OVERRIDE default :: All acceptance criteria are satisfied.");
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

test("processReview rejects pass decision when requirement checks are partially satisfied", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Review artifacts are generated.",
          status: "partially_satisfied",
          evidence: "review.md exists but acceptance coverage is incomplete."
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
    /includes unmet requirement_checks/
  );
});

test("processReview submits REQUEST_CHANGES review when decision requests changes", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are fully covered by tests.",
          status: "not_satisfied",
          evidence: "Negative-path coverage is missing."
        }
      ],
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

test("processReview uses configured request-changes overrides and preserves truncation", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "plan_deliverable",
          requirement: "Add tests for changed behavior.",
          status: "not_satisfied",
          evidence: "No new tests were added for the changed code path."
        }
      ],
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
    reviewMd: "X".repeat(61000)
  });
  const overridesRoot = makeOverrides({
    "review-request-changes.md": "OVERRIDE {{REVIEW_METHOD}}\n\n{{REVIEW_MARKDOWN}}"
  });
  const env = baseEnv({ artifactsPath: dir });
  let reviewPayload = null;

  await processReview({
    env,
    githubMessageOptions: { overridesRoot },
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

  assert.equal(reviewPayload.event, "REQUEST_CHANGES");
  assert.match(reviewPayload.body, /OVERRIDE default/);
  assert.match(reviewPayload.body, /Review truncated\./);
});

test("processReview rejects missing requirement checks", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: undefined
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
    /requirement_checks must be a non-empty array/
  );
});

test("processReview rejects invalid requirement check type or status", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance",
          requirement: "Review writes artifacts.",
          status: "done",
          evidence: "review.md was generated."
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
    /requirement_checks\[0\]\.type must be/
  );
});

test("processReview rejects empty requirement or evidence", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "spec_commitment",
          requirement: " ",
          status: "satisfied",
          evidence: ""
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
    /requirement_checks\[0\]\.requirement must not be empty/
  );
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
