import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  classifyReviewArtifactsFailure,
  classifyProcessReviewFailure,
  main as processReviewMain,
  processReview
} from "../scripts/process-review.mjs";
import { FAILURE_TYPES } from "../scripts/lib/failure-classification.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { renderCanonicalTraceabilityMarkdown } from "../scripts/lib/review-output.mjs";

process.env.GITHUB_OUTPUT = path.join(os.tmpdir(), "process-review-output.txt");

function renderReviewMarkdown(reviewJson, extras = {}) {
  const decisionLabel =
    reviewJson.decision === "pass" ? "PASS" : "REQUEST_CHANGES";
  const decisionEmoji = reviewJson.decision === "pass" ? "✅" : "❌";
  const lines = [
    `# ${decisionEmoji} Autonomous Review Decision: ${decisionLabel}`,
    "",
    "## 📝 Summary",
    reviewJson.summary,
    ""
  ];

  const blockingFindings = reviewJson.findings.filter((finding) => finding.level === "blocking");
  const nonBlockingFindings = reviewJson.findings.filter(
    (finding) => finding.level === "non_blocking"
  );

  if (blockingFindings.length) {
    lines.push("## 🚨 Blocking Findings", "");

    for (const finding of blockingFindings) {
      lines.push(`### ${finding.title}`, "");
      lines.push(`- Scope: ${finding.scope}`);
      lines.push(`- Details: ${finding.details}`);
      lines.push(`- Recommendation: ${finding.recommendation}`, "");
    }
  } else {
    lines.push("## 🚨 Blocking Findings", "", "No blocking findings.", "");
  }

  if (nonBlockingFindings.length) {
    lines.push("## ⚠️ Non-Blocking Notes", "");

    for (const finding of nonBlockingFindings) {
      lines.push(`### ${finding.title}`, "");
      lines.push(`- Scope: ${finding.scope}`);
      lines.push(`- Details: ${finding.details}`);
      lines.push(`- Recommendation: ${finding.recommendation}`, "");
    }
  }

  if (extras.beforeTraceability) {
    lines.push(extras.beforeTraceability, "");
  }

  lines.push(renderCanonicalTraceabilityMarkdown(reviewJson.requirement_checks));

  if (extras.afterTraceability) {
    lines.push("", extras.afterTraceability);
  }

  return lines.join("\n");
}

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
        evidence: ["Verified by CI routing and review stage tests."]
      }
    ],
    findings: [],
    checklist: {
      state_changed: true,
      writers_reviewed: true,
      readers_reviewed: true,
      workflow_paths_checked: true,
      cleanup_paths_checked: true,
      tests_evidence_checked: true,
      residual_risks: "No additional residual workflow risks identified."
    },
    ...overrides.reviewJson
  };
  const reviewMd = overrides.reviewMd || renderReviewMarkdown(reviewJson, overrides.reviewMdExtras);

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
    GITHUB_REPOSITORY: "example/repo",
    GITHUB_SERVER_URL: "https://github.com",
    FACTORY_ARTIFACTS_PATH: overrides.artifactsPath || "",
    FACTORY_REVIEW_METHOD: overrides.reviewMethod || "default",
    ...overrides.env
  };
}

function currentHeadSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return "HEAD";
  }
}

function livePrBody(metadataOverrides = {}) {
  return renderPrBody({
    issueNumber: 1,
    branch: "factory/1-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/1",
    metadata: {
      issueNumber: 1,
      artifactsPath: ".factory/runs/1",
      status: "reviewing",
      repairAttempts: 0,
      maxRepairAttempts: 3,
      lastProcessedWorkflowRunId: null,
      ...metadataOverrides
    }
  });
}

function createGithubClient(overrides = {}, metadataOverrides = {}, prOverrides = {}) {
  return {
    getPullRequest: async () => ({
      number: 33,
      body: livePrBody(metadataOverrides),
      head: {
        ref: "factory/1-sample",
        sha: currentHeadSha(),
        repo: {
          full_name: "example/repo",
          fork: false
        }
      },
      base: {
        repo: {
          full_name: "example/repo"
        }
      },
      ...prOverrides
    }),
    commentOnIssue: async () => {},
    submitPullRequestReview: async () => {},
    ...overrides
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
  assert.equal(execCalls[0].options.env.FACTORY_INTERVENTION, "__CLEAR__");
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "");
  assert.match(commentBody, /## Factory Review/);
  assert.match(commentBody, /\*\*✅ PASS\*\* · Method: `default`/);
  assert.match(commentBody, /\*\*Summary:\*\* All acceptance criteria are satisfied\./);
  assert.match(commentBody, /\*\*Findings:\*\* Blocking 0 · Requirement gaps 0/);
  assert.match(
    commentBody,
    /\*\*Artifacts:\*\* \[Review summary]\(.+\/review\.md\) · \[Review JSON]\(.+\/review\.json\)/
  );
  assert.ok(commentBody.includes("<summary>🧭 Traceability</summary>"));
});

test("processReview accepts workflow-safety methodology configuration", async () => {
  const { dir } = makeArtifacts({
    reviewJson: { methodology: "workflow-safety" }
  });
  const env = baseEnv({
    artifactsPath: dir,
    reviewMethod: "workflow-safety"
  });
  const execCalls = [];
  let commentBody = "";

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
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

  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCalls[0].options.env.FACTORY_REVIEW_METHOD, "workflow-safety");
  assert.match(commentBody, /\*\*✅ PASS\*\* · Method: `workflow-safety`/);
});

test("processReview rejects workflow-safety pass reviews when checklist evidence is missing", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      methodology: "workflow-safety"
    }
  });
  const reviewJsonPath = path.join(dir, "review.json");
  const parsed = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));
  delete parsed.checklist;
  fs.writeFileSync(reviewJsonPath, JSON.stringify(parsed, null, 2));
  const env = baseEnv({
    artifactsPath: dir,
    reviewMethod: "workflow-safety"
  });

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
    /checklist must be an object for workflow-safety reviews/
  );
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

  assert.match(commentBody, /## Factory Review/);
  assert.match(commentBody, /\*\*✅ PASS\*\*/);
  assert.doesNotMatch(commentBody, /PASS OVERRIDE/);
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

test("processReview accepts legacy string evidence by normalizing to arrays", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "A factory-managed PR that reaches green CI enters review.",
          status: "satisfied",
          evidence: "Verified by CI routing and review stage tests."
        }
      ]
    },
    reviewMd: [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "All acceptance criteria are satisfied.",
      "",
      "## 🚨 Blocking Findings",
      "",
      "No blocking findings.",
      "",
      "<details>",
      "<summary>🧭 Traceability</summary>",
      "",
      "#### Acceptance Criteria (✅ 1)",
      "",
      "- ✅ **Satisfied**: A factory-managed PR that reaches green CI enters review.",
      "  - **Evidence:** Verified by CI routing and review stage tests.",
      "",
      "</details>"
    ].join("\n")
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.doesNotReject(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    })
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
          evidence: ["review.md exists but acceptance coverage is incomplete."]
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

test("processReview normalizes mixed-case enums before rendering request changes", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "ACCEPTANCE_CRITERION",
          requirement: "Acceptance criteria are fully covered by tests.",
          status: "NOT_SATISFIED",
          evidence: ["Negative-path coverage is missing.", "ci / test did not cover the negative path."]
        }
      ],
      findings: [
        {
          level: "BLOCKING",
          title: "Missing tests",
          details: "Acceptance criteria are not fully covered.",
          scope: "tests/new-feature.test.js",
          recommendation: "Add tests covering negative paths."
        }
      ]
    },
    reviewMd: renderReviewMarkdown({
      methodology: "default",
      decision: "request_changes",
      summary: "All acceptance criteria are satisfied.",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are fully covered by tests.",
          status: "not_satisfied",
          evidence: ["Negative-path coverage is missing.", "ci / test did not cover the negative path."]
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
    })
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

  assert.equal(reviewPayload.event, "REQUEST_CHANGES");
  assert.match(reviewPayload.body, /## Factory Review/);
  assert.match(reviewPayload.body, /\*\*❌ REQUEST_CHANGES\*\* · Method: `default`/);
  assert.match(reviewPayload.body, /\*\*Findings:\*\* Blocking 1 · Requirement gaps 1/);
  assert.match(
    reviewPayload.body,
    /\*\*Artifacts:\*\* \[Review summary\]\(.+\/review\.md\) · \[Review JSON\]\(.+\/review\.json\)/
  );
  assert.ok(reviewPayload.body.includes("<summary>🧭 Traceability</summary>"));
  assert.match(reviewPayload.body, /# ❌ Autonomous Review Decision: REQUEST_CHANGES/);
  assert.match(reviewPayload.body, /## 🚨 Blocking Findings/);
  assert.match(reviewPayload.body, /### Missing tests/);
  assert.match(reviewPayload.body, /`not_satisfied`/);
  assert.match(reviewPayload.body, /#### Acceptance Criteria \(❌ 1\)/);
  assert.match(
    reviewPayload.body,
    /- ❌ \*\*Not satisfied\*\*: Acceptance criteria are fully covered by tests\./
  );
  assert.match(
    reviewPayload.body,
    /  - \*\*Evidence:\*\* Negative-path coverage is missing\./
  );
  assert.match(
    reviewPayload.body,
    /  - \*\*Evidence:\*\* ci \/ test did not cover the negative path\./
  );
});

test("processReview rejects pass decision when mixed-case unmet requirement checks exist", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "ACCEPTANCE_CRITERION",
          requirement: "Review artifacts are generated.",
          status: "PARTIALLY_SATISFIED",
          evidence: ["review.md exists but acceptance coverage is incomplete."]
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
          evidence: ["Negative-path coverage is missing."]
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
    }
  });
  const env = baseEnv({ artifactsPath: dir });
  let reviewPayload = null;
  const execCalls = [];

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
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
  assert.match(reviewPayload.body, /## Factory Review/);
  assert.match(reviewPayload.body, /\*\*❌ REQUEST_CHANGES\*\* · Method: `default`/);
  assert.match(reviewPayload.body, /# ❌ Autonomous Review Decision: REQUEST_CHANGES/);
  assert.match(reviewPayload.body, /## 🚨 Blocking Findings/);
  assert.match(reviewPayload.body, /### Missing tests/);
  assert.match(reviewPayload.body, /<details>/);
  assert.match(
    reviewPayload.body,
    /\*\*Artifacts:\*\* \[Review summary\]\(.+\/review\.md\) · \[Review JSON\]\(.+\/review\.json\)/
  );
  assert.ok(reviewPayload.body.includes("<summary>🧭 Traceability</summary>"));
  assert.doesNotMatch(reviewPayload.body, /## 🧭 Traceability/);
  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "");
  assert.equal(execCalls[0].options.env.FACTORY_CI_STATUS, "pending");
  assert.equal(execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID, "");
});

test("processReview clears pending review SHA when validation fails early", async () => {
  const env = baseEnv({ artifactsPath: path.join(os.tmpdir(), "missing-review-artifacts") });
  const execCalls = [];

  await assert.rejects(
    processReview({
      env,
      execFileImpl: (file, args, options, callback) => {
        execCalls.push({ file, args, options });
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {
          throw new Error("commentOnIssue should not be called on validation failure");
        },
        submitPullRequestReview: async () => {
          throw new Error("submitPullRequestReview should not be called on validation failure");
        }
      }
    }),
    /Failed to read/
  );

  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, ["scripts/apply-pr-state.mjs"]);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "");
});

test("processReview no-ops when the live PR is no longer reviewing", async () => {
  const env = baseEnv({ artifactsPath: ".factory/runs/1" });
  const execCalls = [];
  let commentCalls = 0;
  let reviewCalls = 0;

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
      callback(null, "", "");
    },
    githubClient: createGithubClient(
      {
        commentOnIssue: async () => {
          commentCalls += 1;
        },
        submitPullRequestReview: async () => {
          reviewCalls += 1;
        }
      },
      { status: "repairing" }
    )
  });

  assert.equal(commentCalls, 0);
  assert.equal(reviewCalls, 0);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "__UNCHANGED__");
  assert.equal(
    execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID,
    "__UNCHANGED__"
  );
});

test("processReview no-ops when the live PR workflow run no longer matches", async () => {
  const env = baseEnv({
    artifactsPath: ".factory/runs/1",
    env: {
      FACTORY_CI_RUN_ID: "200"
    }
  });
  const execCalls = [];
  let commentCalls = 0;
  let reviewCalls = 0;

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
      callback(null, "", "");
    },
    githubClient: createGithubClient(
      {
        commentOnIssue: async () => {
          commentCalls += 1;
        },
        submitPullRequestReview: async () => {
          reviewCalls += 1;
        }
      },
      { lastProcessedWorkflowRunId: "201" }
    )
  });

  assert.equal(commentCalls, 0);
  assert.equal(reviewCalls, 0);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "__UNCHANGED__");
  assert.equal(
    execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID,
    "__UNCHANGED__"
  );
});

test("processReview stale cleanup clears pending review sha only when the worker owns it", async () => {
  const headSha = currentHeadSha();
  const env = baseEnv({ artifactsPath: ".factory/runs/1" });
  const execCalls = [];

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
      callback(null, "", "");
    },
    githubClient: createGithubClient(
      {},
      {
        status: "repairing",
        pendingReviewSha: headSha
      }
    )
  });

  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "");
  assert.equal(
    execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID,
    "__UNCHANGED__"
  );
});

test("processReview stale cleanup preserves pending review sha when owned by a newer worker", async () => {
  const env = baseEnv({ artifactsPath: ".factory/runs/1" });
  const execCalls = [];

  await processReview({
    env,
    execFileImpl: (file, args, options, callback) => {
      execCalls.push({ file, args, options });
      callback(null, "", "");
    },
    githubClient: createGithubClient(
      {},
      {
        status: "repairing",
        pendingReviewSha: "newer-pending-sha"
      }
    )
  });

  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].options.env.FACTORY_PENDING_REVIEW_SHA, "__UNCHANGED__");
  assert.equal(
    execCalls[0].options.env.FACTORY_LAST_PROCESSED_WORKFLOW_RUN_ID,
    "__UNCHANGED__"
  );
});

test("processReview main writes failure message output for workflow follow-up", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "acceptance_criterion",
          requirement: "Acceptance criteria are fully covered by tests.",
          status: "not_satisfied",
          evidence: ["Negative-path coverage is missing."]
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
    }
  });
  const outputPath = path.join(os.tmpdir(), `factory-review-output-${Date.now()}.txt`);
  const previousOutput = process.env.GITHUB_OUTPUT;
  const previousExitCode = process.exitCode;
  const env = baseEnv({ artifactsPath: dir });
  process.env.GITHUB_OUTPUT = outputPath;

  try {
    await processReviewMain({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {
          throw new Error("commentOnIssue should not be called for request_changes decision");
        },
        submitPullRequestReview: async () => {
          throw new Error("Review delivery failed");
        }
      }
    });

    const outputs = fs.readFileSync(outputPath, "utf8");
    assert.match(outputs, /failure_message<<__EOF__/);
    assert.match(outputs, /Review delivery failed/);
    assert.match(outputs, /failure_type<<__EOF__\ncontent_or_logic\n__EOF__/);
    assert.match(outputs, /failure_phase<<__EOF__\nreview_delivery\n__EOF__/);
  } finally {
    process.env.GITHUB_OUTPUT = previousOutput;
    process.exitCode = previousExitCode;
  }
});

test("classifyProcessReviewFailure propagates review artifact contract failures", () => {
  const failure = classifyProcessReviewFailure(
    {
      factoryFailureType: FAILURE_TYPES.reviewArtifactContract,
      factoryFailurePhase: "review"
    }
  );

  assert.deepEqual(failure, {
    failureType: FAILURE_TYPES.reviewArtifactContract,
    failurePhase: "review"
  });
});

test("classifyProcessReviewFailure marks delivery failures as review delivery issues", () => {
  const failure = classifyProcessReviewFailure(new Error("FACTORY_GITHUB_TOKEN is required"));

  assert.deepEqual(failure, {
    failureType: "configuration",
    failurePhase: "review_delivery"
  });
});

test("classifyReviewArtifactsFailure keeps invalid methodology failures in review_delivery", () => {
  const failure = classifyReviewArtifactsFailure(
    'Unable to resolve review methodology "does-not-exist". Expected instructions at .factory/review-methods/does-not-exist/instructions.md'
  );

  assert.deepEqual(failure, {
    failureType: "configuration",
    failurePhase: "review_delivery"
  });
});

test("classifyReviewArtifactsFailure treats review artifact content failures as contract errors", () => {
  const failure = classifyReviewArtifactsFailure(
    "review.md must include the canonical Traceability section derived from review.json"
  );

  assert.deepEqual(failure, {
    failureType: FAILURE_TYPES.reviewArtifactContract,
    failurePhase: "review"
  });
});

test("processReview uses configured request-changes overrides and preserves truncation", async () => {
  const longReviewMd = `${renderReviewMarkdown({
    methodology: "default",
    decision: "request_changes",
    summary: "Needs more tests.",
    blocking_findings_count: 1,
    requirement_checks: [
      {
        type: "plan_deliverable",
        requirement: "Add tests for changed behavior.",
        status: "not_satisfied",
        evidence: ["No new tests were added for the changed code path."]
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
  })}\n\n${"X".repeat(61000)}`;
  const { dir } = makeArtifacts({
    reviewJson: {
      decision: "request_changes",
      blocking_findings_count: 1,
      requirement_checks: [
        {
          type: "plan_deliverable",
          requirement: "Add tests for changed behavior.",
          status: "not_satisfied",
          evidence: ["No new tests were added for the changed code path."]
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
    reviewMd: longReviewMd
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
  assert.match(reviewPayload.body, /# ❌ Autonomous Review Decision: REQUEST_CHANGES/);
  assert.doesNotMatch(reviewPayload.body, /Review truncated after traceability details/);
  assert.match(
    reviewPayload.body,
    /\*\*Artifacts:\*\* \[Review summary\]\(.+\/review\.md\) · \[Review JSON\]\(.+\/review\.json\)/
  );
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

test("processReview accepts extra prose around canonical traceability block", async () => {
  const { dir } = makeArtifacts({
    reviewMdExtras: {
      beforeTraceability: "Reviewer note: keep investigating runtime edge cases.",
      afterTraceability: "Methodology used: default."
    }
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.doesNotReject(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    })
  );
});

test("processReview accepts review markdown missing traceability by normalizing it", async () => {
  const { dir } = makeArtifacts({
    reviewMd: [
      "# Autonomous Review",
      "",
      "Decision: pass",
      "",
      "## Blocking Findings",
      "",
      "No blocking findings."
    ].join("\n")
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.doesNotReject(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    })
  );

  const normalizedReviewMarkdown = fs.readFileSync(path.join(dir, "review.md"), "utf8");
  assert.match(normalizedReviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.doesNotMatch(normalizedReviewMarkdown, /## 🧭 Traceability/);
  assert.match(
    normalizedReviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: A factory-managed PR that reaches green CI enters review\./
  );
});

test("processReview accepts drifted traceability by normalizing it to review.json", async () => {
  const { dir } = makeArtifacts({
    reviewMd: [
      "# Autonomous Review",
      "",
      "Decision: pass",
      "",
      "## Blocking Findings",
      "",
      "No blocking findings.",
      "",
      "## Traceability",
      "",
      "<details>",
      "<summary>Traceability: Acceptance Criteria</summary>",
      "",
      "- Requirement: A factory-managed PR that reaches green CI enters review.",
      "  - Status: `satisfied`",
      "  - Evidence:",
      "    - Drifted evidence that does not match review.json.",
      "",
      "</details>"
    ].join("\n")
  });
  const env = baseEnv({ artifactsPath: dir });

  await assert.doesNotReject(
    processReview({
      env,
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
      },
      githubClient: {
        commentOnIssue: async () => {},
        submitPullRequestReview: async () => {}
      }
    })
  );

  const normalizedReviewMarkdown = fs.readFileSync(path.join(dir, "review.md"), "utf8");
  assert.doesNotMatch(normalizedReviewMarkdown, /Drifted evidence that does not match review\.json\./);
  assert.match(normalizedReviewMarkdown, /Verified by CI routing and review stage tests\./);
  assert.match(normalizedReviewMarkdown, /<summary>🧭 Traceability<\/summary>/);
  assert.match(normalizedReviewMarkdown, /#### Acceptance Criteria \(✅ 1\)/);
  assert.match(
    normalizedReviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: A factory-managed PR that reaches green CI enters review\./
  );
  assert.match(
    normalizedReviewMarkdown,
    /  - \*\*Evidence:\*\* Verified by CI routing and review stage tests\./
  );
  assert.doesNotMatch(normalizedReviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(normalizedReviewMarkdown, /- Status:/);
});

test("processReview rejects invalid requirement check type or status", async () => {
  const { dir } = makeArtifacts({
    reviewJson: {
      requirement_checks: [
        {
          type: "acceptance",
          requirement: "Review writes artifacts.",
          status: "done",
          evidence: ["review.md was generated."]
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
          evidence: [""]
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
