import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  persistCostSummaryForStage,
  readActualUsageTelemetry,
  resolveStagePushAuthorization,
  resolveStageCommitAction,
  shouldPersistCostSummary,
  shouldAllowNoChanges,
  validateReviewArtifactsForStage,
  main as prepareStagePushMain
} from "../scripts/prepare-stage-push.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";

const TEST_OUTPUT_PATH = path.join(os.tmpdir(), "factory-actions-output.txt");

try {
  fs.unlinkSync(TEST_OUTPUT_PATH);
} catch {
  // ignore missing file
}

process.env.GITHUB_OUTPUT = TEST_OUTPUT_PATH;

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function initTestRepo(branch) {
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-remote-"));
  git(remoteDir, ["init", "--bare"]);
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-repo-"));
  git(repoDir, ["init"]);
  git(repoDir, ["config", "user.name", "Factory CI"]);
  git(repoDir, ["config", "user.email", "factory@example.com"]);
  git(repoDir, ["remote", "add", "origin", remoteDir]);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Fixture\n");
  git(repoDir, ["add", "README.md"]);
  git(repoDir, ["commit", "-m", "initial"]);
  git(repoDir, ["branch", "-M", "main"]);
  git(repoDir, ["checkout", "-b", branch]);
  git(repoDir, ["commit", "--allow-empty", "-m", "stage start"]);
  git(repoDir, ["push", "-u", "origin", branch]);
  return { repoDir, remoteDir };
}

test("resolveStageCommitAction commits staged changes with generated summary", () => {
  const result = resolveStageCommitAction({
    mode: "implement",
    issueNumber: 18,
    branch: "factory/18-improve-factory-generated-commit-messages",
    issueTitle: "",
    commitsAhead: 0,
    stagedDiff: [
      "M\tscripts/prepare-stage-push.mjs",
      "M\ttests/prepare-stage-push.test.mjs"
    ],
    diffFromRemote: ""
  });

  assert.deepEqual(result, {
    operation: "commit",
    commitSubject: "factory(implement): update prepare stage push with tests"
  });
});

test("resolveStageCommitAction amends a single pre-existing local commit", () => {
  const result = resolveStageCommitAction({
    mode: "implement",
    issueNumber: 24,
    branch: "factory/24-add-selective-emoji-to-human-facing-factory-stat",
    issueTitle: "",
    commitsAhead: 1,
    stagedDiff: "",
    diffFromRemote: [
      "M\tscripts/lib/github-messages.mjs",
      "M\ttests/github-messages.test.mjs"
    ]
  });

  assert.deepEqual(result, {
    operation: "amend",
    commitSubject: "factory(implement): update github messages with tests"
  });
});

test("resolveStageCommitAction rejects multiple local commits ahead of origin", () => {
  assert.throws(
    () =>
      resolveStageCommitAction({
        mode: "repair",
        issueNumber: 24,
        branch: "factory/24-add-selective-emoji-to-human-facing-factory-stat",
        issueTitle: "",
        commitsAhead: 2,
        stagedDiff: "",
        diffFromRemote: "M\tscripts/process-review.mjs"
      }),
    /Expected at most one stage-output commit/
  );
});

test("review mode allows no-op stage output for identical artifacts", () => {
  assert.equal(shouldAllowNoChanges("review"), true);
  assert.equal(shouldAllowNoChanges("implement"), false);
  assert.equal(shouldAllowNoChanges("repair"), false);
});

test("shouldPersistCostSummary keeps implement and repair no-op safe", () => {
  assert.equal(shouldPersistCostSummary("implement", false), false);
  assert.equal(shouldPersistCostSummary("repair", false), false);
  assert.equal(shouldPersistCostSummary("implement", true), true);
  assert.equal(shouldPersistCostSummary("review", false), true);
  assert.equal(shouldPersistCostSummary("plan", false), true);
});

test("persistCostSummaryForStage skips implement artifact-only output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cost-summary-"));
  const summaryPath = path.join(tempDir, "estimate.json");
  const artifactsPath = path.join(tempDir, "artifacts");

  fs.writeFileSync(summaryPath, JSON.stringify({ estimated: true }, null, 2));

  const persistedPath = persistCostSummaryForStage({
    mode: "implement",
    artifactsPath,
    costSummaryPath: summaryPath,
    worktreeHasChanges: false
  });

  assert.equal(persistedPath, "");
  assert.equal(fs.existsSync(path.join(artifactsPath, "cost-summary.json")), false);
});

test("persistCostSummaryForStage writes a usage event and derived summary when allowed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cost-summary-"));
  const originalCwd = process.cwd();
  const summaryPath = path.join(tempDir, "estimate.json");
  const artifactsPath = path.join(tempDir, "artifacts");
  const summary = {
    issueNumber: 55,
    branch: "factory/55-telemetry",
    provider: "openai",
    apiSurface: "codex-action",
    pricing: {
      version: "openai-2026-03-19",
      model: "gpt-5-mini",
      currency: "USD"
    },
    current: {
      stage: "review",
      model: "gpt-5-mini",
      promptChars: 800,
      estimatedUsageBeforeCalibration: {
        inputTokens: 200,
        cachedInputTokens: 0,
        outputTokens: 70,
        reasoningTokens: null
      },
      estimatedUsage: {
        inputTokens: 200,
        cachedInputTokens: 0,
        outputTokens: 70,
        reasoningTokens: null
      },
      usageCalibration: {
        bucket: "review:gpt-5-mini:openai",
        sampleSize: 0,
        generatedAt: "",
        source: "default",
        multipliers: {
          inputTokens: 1,
          cachedInputTokens: 1,
          outputTokens: 1
        }
      },
      derivedCost: {
        stageUsdBeforeCalibration: 0.0002,
        stageUsd: 0.0002,
        totalEstimatedUsd: 0.0002,
        band: "low",
        emoji: "🟢",
        pricingSource: "fallback"
      }
    },
    stages: {
      review: {
        mode: "review",
        provider: "openai",
        apiSurface: "codex-action",
        model: "gpt-5-mini",
        promptChars: 800,
        estimatedUsageBeforeCalibration: {
          inputTokens: 200,
          cachedInputTokens: 0,
          outputTokens: 70,
          reasoningTokens: null
        },
        estimatedUsage: {
          inputTokens: 200,
          cachedInputTokens: 0,
          outputTokens: 70,
          reasoningTokens: null
        },
        usageCalibration: {
          bucket: "review:gpt-5-mini:openai",
          sampleSize: 0,
          generatedAt: "",
          source: "default",
          multipliers: {
            inputTokens: 1,
            cachedInputTokens: 1,
            outputTokens: 1
          }
        },
        derivedCost: {
          stageUsdBeforeCalibration: 0.0002,
          stageUsd: 0.0002,
          pricingSource: "fallback"
        }
      }
    },
    thresholds: { warnUsd: 0.25, highUsd: 1 }
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  try {
    process.chdir(tempDir);
    const persistedPath = persistCostSummaryForStage({
      mode: "review",
      artifactsPath,
      costSummaryPath: summaryPath,
      worktreeHasChanges: false,
      telemetryContext: {
        issueNumber: 55,
        prNumber: 56,
        branch: "factory/55-telemetry",
        runId: "987654321",
        runAttempt: "2"
      },
      now: new Date("2026-03-18T12:00:00Z")
    });

    assert.equal(persistedPath, path.join(artifactsPath, "cost-summary.json"));
    const persistedSummary = JSON.parse(fs.readFileSync(persistedPath, "utf8"));
    const usageEventsDir = path.join(tempDir, ".factory", "usage-events");
    const usageDates = fs.readdirSync(usageEventsDir);
    const eventDir = path.join(usageEventsDir, usageDates[0]);
    const eventFile = fs.readdirSync(eventDir)[0];
    const event = JSON.parse(fs.readFileSync(path.join(eventDir, eventFile), "utf8"));

    assert.equal(persistedSummary.prNumber, 56);
    assert.equal(persistedSummary.current.sourceEventPath.endsWith(".json"), true);
    assert.equal(event.stage, "review");
    assert.equal(event.model, "gpt-5-mini");
    assert.equal(event.runId, "987654321");
    assert.equal(event.runAttempt, 2);
    assert.equal(event.prNumber, 56);
    assert.equal(event.issueNumber, 55);
    assert.equal(event.outcome, "succeeded");
  } finally {
    process.chdir(originalCwd);
  }
});

test("persistCostSummaryForStage includes actual usage telemetry when provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cost-summary-"));
  const originalCwd = process.cwd();
  const summaryPath = path.join(tempDir, "estimate.json");
  const artifactsPath = path.join(tempDir, "artifacts");

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        issueNumber: 55,
        branch: "factory/55-telemetry",
        provider: "openai",
        apiSurface: "codex-action",
        pricing: {
          version: "openai-2026-03-19",
          model: "gpt-5-codex",
          currency: "USD"
        },
        current: {
          stage: "plan",
          model: "gpt-5-codex",
          promptChars: 800,
          estimatedUsageBeforeCalibration: {
            inputTokens: 200,
            cachedInputTokens: 0,
            outputTokens: 70,
            reasoningTokens: null
          },
          estimatedUsage: {
            inputTokens: 200,
            cachedInputTokens: 0,
            outputTokens: 70,
            reasoningTokens: null
          },
          usageCalibration: {
            bucket: "plan:gpt-5-codex:openai",
            sampleSize: 0,
            generatedAt: "",
            source: "default",
            multipliers: {
              inputTokens: 1,
              cachedInputTokens: 1,
              outputTokens: 1
            }
          },
          derivedCost: {
            stageUsdBeforeCalibration: 0.0002,
            stageUsd: 0.0002,
            totalEstimatedUsd: 0.0002,
            band: "low",
            emoji: "🟢",
            pricingSource: "model"
          }
        },
        stages: {
          plan: {
            mode: "plan",
            provider: "openai",
            apiSurface: "codex-action",
            model: "gpt-5-codex",
            promptChars: 800,
            estimatedUsageBeforeCalibration: {
              inputTokens: 200,
              cachedInputTokens: 0,
              outputTokens: 70,
              reasoningTokens: null
            },
            estimatedUsage: {
              inputTokens: 200,
              cachedInputTokens: 0,
              outputTokens: 70,
              reasoningTokens: null
            },
            usageCalibration: {
              bucket: "plan:gpt-5-codex:openai",
              sampleSize: 0,
              generatedAt: "",
              source: "default",
              multipliers: {
                inputTokens: 1,
                cachedInputTokens: 1,
                outputTokens: 1
              }
            },
            derivedCost: {
              stageUsdBeforeCalibration: 0.0002,
              stageUsd: 0.0002,
              pricingSource: "model"
            }
          }
        },
        thresholds: { warnUsd: 0.25, highUsd: 1 }
      },
      null,
      2
    )
  );

  try {
    process.chdir(tempDir);
    persistCostSummaryForStage({
      mode: "plan",
      artifactsPath,
      costSummaryPath: summaryPath,
      worktreeHasChanges: false,
      telemetryContext: {
        issueNumber: 55,
        branch: "factory/55-telemetry",
        runId: "987654321",
        runAttempt: "2",
        apiSurface: "codex-cli",
        actualUsage: {
          inputTokens: 321,
          cachedInputTokens: 111,
          outputTokens: 77,
          reasoningTokens: 40
        }
      },
      now: new Date("2026-03-18T12:00:00Z")
    });

    const usageEventsDir = path.join(tempDir, ".factory", "usage-events");
    const usageDates = fs.readdirSync(usageEventsDir);
    const eventDir = path.join(usageEventsDir, usageDates[0]);
    const eventFile = fs.readdirSync(eventDir)[0];
    const event = JSON.parse(fs.readFileSync(path.join(eventDir, eventFile), "utf8"));

    assert.deepEqual(event.actualUsage, {
      inputTokens: 321,
      cachedInputTokens: 111,
      outputTokens: 77,
      reasoningTokens: 40
    });
    assert.equal(event.apiSurface, "codex-cli");
    assert.equal(event.derivedCost.actualUsd, 0.0012);

    const persistedSummary = JSON.parse(
      fs.readFileSync(path.join(artifactsPath, "cost-summary.json"), "utf8")
    );
    assert.equal(persistedSummary.apiSurface, "codex-cli");
    assert.equal(persistedSummary.current.apiSurface, "codex-cli");
    assert.equal(persistedSummary.current.derivedCost.actualUsd, 0.0012);
    assert.equal(persistedSummary.stages.plan.apiSurface, "codex-cli");
    assert.equal(persistedSummary.stages.plan.derivedCost.actualUsd, 0.0012);
  } finally {
    process.chdir(originalCwd);
  }
});

test("readActualUsageTelemetry returns usage payloads when the file exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-actual-usage-"));
  const usagePath = path.join(tempDir, "usage.json");

  fs.writeFileSync(
    usagePath,
    JSON.stringify({
      apiSurface: "codex-cli",
      actualUsage: {
        inputTokens: 123,
        cachedInputTokens: 45,
        outputTokens: 67,
        reasoningTokens: 8
      }
    })
  );

  assert.deepEqual(readActualUsageTelemetry(usagePath), {
    actualUsage: {
      inputTokens: 123,
      cachedInputTokens: 45,
      outputTokens: 67,
      reasoningTokens: 8
    },
    actualUsd: null,
    apiSurface: "codex-cli"
  });
});

test("validateReviewArtifactsForStage skips non-review modes", () => {
  let called = false;

  validateReviewArtifactsForStage(
    { mode: "implement", artifactsPath: "", reviewMethod: "" },
    () => {
      called = true;
    }
  );

  assert.equal(called, false);
});

test("validateReviewArtifactsForStage requires artifacts path in review mode", () => {
  assert.throws(
    () =>
      validateReviewArtifactsForStage(
        { mode: "review", artifactsPath: "", reviewMethod: "default" },
        () => {}
      ),
    /FACTORY_ARTIFACTS_PATH is required/
  );
});

test("validateReviewArtifactsForStage delegates to loadValidatedReviewArtifacts", () => {
  let invocation = null;

  validateReviewArtifactsForStage(
    {
      mode: "review",
      artifactsPath: "/tmp/review-artifacts",
      reviewMethod: "custom"
    },
    (options) => {
      invocation = options;
    }
  );

  assert.deepEqual(invocation, {
    artifactsPath: "/tmp/review-artifacts",
    requestedMethodology: "custom"
  });
});

test("resolveStagePushAuthorization reads the live pull request labels", async () => {
  const result = await resolveStagePushAuthorization({
    env: {
      FACTORY_ENABLE_SELF_MODIFY: "true"
    },
    prNumber: 33,
    protectedPathChanges: [{ kind: "scripts", label: "scripts/**", paths: ["scripts/x.mjs"] }],
    githubClient: {
      getPullRequest: async () => ({
        labels: [{ name: FACTORY_LABELS.selfModify }]
      })
    }
  });

  assert.deepEqual(result, {
    selfModifyEnabled: true,
    hasSelfModifyLabel: true
  });
});

test("resolveStagePushAuthorization skips live PR lookup for non-protected changes", async () => {
  let called = false;

  const result = await resolveStagePushAuthorization({
    env: {
      FACTORY_ENABLE_SELF_MODIFY: "true"
    },
    prNumber: 33,
    protectedPathChanges: [],
    githubClient: {
      getPullRequest: async () => {
        called = true;
        return {
          labels: [{ name: FACTORY_LABELS.selfModify }]
        };
      }
    }
  });

  assert.deepEqual(result, {
    selfModifyEnabled: true,
    hasSelfModifyLabel: false
  });
  assert.equal(called, false);
});

test("prepare-stage-push fails before git when review payload is invalid", async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-invalid-"));
  const reviewJson = {
    methodology: "default",
    decision: "pass",
    summary: "Test summary",
    blocking_findings_count: 0,
    requirement_checks: [],
    findings: []
  };

  fs.writeFileSync(path.join(artifactsDir, "review.json"), JSON.stringify(reviewJson, null, 2));
  fs.writeFileSync(path.join(artifactsDir, "review.md"), "# Invalid review\n\nMissing traceability.");

  try {
    let thrown = null;

    try {
      await prepareStagePushMain({
        FACTORY_BRANCH: "factory/34-review-test",
        FACTORY_MODE: "review",
        FACTORY_ISSUE_NUMBER: "34",
        FACTORY_ISSUE_TITLE: "Add validation guard",
        FACTORY_ARTIFACTS_PATH: artifactsDir,
        FACTORY_REVIEW_METHOD: "default",
        GITHUB_TOKEN: "ghs_mock"
      });
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, "expected validation failure");
    assert.match(thrown.message, /requirement_checks must be a non-empty array/);
  } finally {
  }
});

test("prepare-stage-push normalizes drifted review traceability before git", async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-normalized-"));
  const reviewJson = {
    methodology: "default",
    decision: "pass",
    summary: "Test summary",
    blocking_findings_count: 0,
    requirement_checks: [
      {
        type: "acceptance_criterion",
        requirement: "Validation runs before push.",
        status: "satisfied",
        evidence: "Guarded by prepare-stage-push."
      }
    ],
    findings: []
  };

  fs.writeFileSync(path.join(artifactsDir, "review.json"), JSON.stringify(reviewJson, null, 2));
  fs.writeFileSync(
    path.join(artifactsDir, "review.md"),
    [
      "# ✅ Autonomous Review Decision: PASS",
      "",
      "## 📝 Summary",
      "Test summary",
      "",
      "## 🧭 Traceability",
      "",
      "<details><summary>Traceability: Acceptance Criteria</summary>",
      "",
      "- Acceptance Criterion: \"Validation runs before push.\" — satisfied.",
      "  - Evidence: Guarded by prepare-stage-push.",
      "",
      "</details>",
      "",
      "Methodology used: default."
    ].join("\n")
  );

  let thrown = null;

  try {
    await prepareStagePushMain({
      FACTORY_BRANCH: "factory/34-review-test",
      FACTORY_MODE: "review",
      FACTORY_ISSUE_NUMBER: "34",
      FACTORY_ISSUE_TITLE: "Add validation guard",
      FACTORY_ARTIFACTS_PATH: artifactsDir,
      FACTORY_REVIEW_METHOD: "default",
      GITHUB_TOKEN: "ghs_mock"
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, "expected git failure after validation");
  assert.doesNotMatch(thrown.message, /canonical Traceability section/);

  const normalizedReviewMarkdown = fs.readFileSync(path.join(artifactsDir, "review.md"), "utf8");
  assert.match(
    normalizedReviewMarkdown,
    /<summary>🧭 Traceability: Acceptance Criteria \(✅ 1\)<\/summary>/
  );
  assert.match(
    normalizedReviewMarkdown,
    /- ✅ \*\*Satisfied\*\*: Validation runs before push\./
  );
  assert.match(
    normalizedReviewMarkdown,
    /  - \*\*Evidence:\*\* Guarded by prepare-stage-push\./
  );
  assert.doesNotMatch(normalizedReviewMarkdown, /- Requirement:/);
  assert.doesNotMatch(normalizedReviewMarkdown, /- Status:/);
  assert.doesNotMatch(normalizedReviewMarkdown, /Methodology used: default\./);
});

test("prepare-stage-push reports stage_noop diagnostics when branch is unchanged", async () => {
  const branch = "factory/stage-noop-check";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let error = null;

  try {
    process.chdir(repoDir);
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "501",
      FACTORY_ISSUE_TITLE: "Ensure no-op classification",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "0",
      GITHUB_TOKEN: "ghs_mock"
    });
  } catch (thrown) {
    error = thrown;
  } finally {
    process.chdir(originalCwd);
  }

  assert.ok(error, "expected stage_noop failure");
  assert.match(error.message, /Stage run completed without preparing repository changes\./);
  assert.match(error.message, /Stage diagnostics:/);
  assert.match(error.message, /commits ahead of origin\/factory\/stage-noop-check: 0/);
  assert.match(error.message, /FACTORY_GITHUB_TOKEN available: no/);
  assert.match(error.message, /protected path changes detected: no/);
});

test("prepare-stage-push reports stage_setup diagnostics for workflow changes without factory token", async () => {
  const branch = "factory/stage-setup-guard";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let error = null;

  try {
    process.chdir(repoDir);
    fs.mkdirSync(path.join(repoDir, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, ".github", "workflows", "test.yml"),
      "name: Test\non: push\njobs:\n  noop:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo test\n"
    );
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "502",
      FACTORY_ISSUE_TITLE: "Workflow modifications require PAT",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "0",
      GITHUB_TOKEN: "ghs_mock"
    });
  } catch (thrown) {
    error = thrown;
  } finally {
    process.chdir(originalCwd);
  }

  assert.ok(error, "expected stage_setup failure");
  assert.match(error.message, /Stage setup prerequisites failed:/);
  assert.match(error.message, /FACTORY_GITHUB_TOKEN available: no/);
  assert.match(error.message, /workflow changes detected: yes/);
  assert.match(error.message, /protected path changes detected: yes/);
  assert.match(error.message, /\.github\/workflows\/test\.yml/);
});

test("prepare-stage-push blocks protected-path changes when self-modify mode is disabled", async () => {
  const branch = "factory/self-modify-disabled";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let error = null;

  try {
    process.chdir(repoDir);
    fs.mkdirSync(path.join(repoDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "scripts", "self-modify.mjs"), "export const x = 1;\n");
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "503",
      FACTORY_ISSUE_TITLE: "Self modify gate",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "44",
      FACTORY_ENABLE_SELF_MODIFY: "",
      FACTORY_GITHUB_TOKEN: "pat_mock",
      GITHUB_TOKEN: "ghs_mock"
    }, {
      githubClient: {
        getPullRequest: async () => ({
          labels: [{ name: FACTORY_LABELS.selfModify }]
        })
      }
    });
  } catch (thrown) {
    error = thrown;
  } finally {
    process.chdir(originalCwd);
  }

  assert.ok(error, "expected stage_setup failure");
  assert.match(error.message, /FACTORY_ENABLE_SELF_MODIFY is not enabled/);
});

test("prepare-stage-push does not require a live PR lookup for non-protected changes", async () => {
  const branch = "factory/non-protected-pr-change";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let called = false;

  try {
    process.chdir(repoDir);
    fs.writeFileSync(path.join(repoDir, "README.md"), "# Updated fixture\n");
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "506",
      FACTORY_ISSUE_TITLE: "Normal repo change",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "47",
      FACTORY_ENABLE_SELF_MODIFY: "",
      GITHUB_TOKEN: "ghs_mock"
    }, {
      githubClient: {
        getPullRequest: async () => {
          called = true;
          throw new Error("unexpected GitHub lookup");
        }
      }
    });
  } finally {
    process.chdir(originalCwd);
  }

  assert.equal(called, false);
});

test("prepare-stage-push blocks protected-path changes when the self-modify label is absent", async () => {
  const branch = "factory/self-modify-label-missing";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let error = null;

  try {
    process.chdir(repoDir);
    fs.mkdirSync(path.join(repoDir, ".factory", "messages"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, ".factory", "messages", "pr-body.md"), "override\n");
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "504",
      FACTORY_ISSUE_TITLE: "Self modify label gate",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "45",
      FACTORY_ENABLE_SELF_MODIFY: "true",
      FACTORY_GITHUB_TOKEN: "pat_mock",
      GITHUB_TOKEN: "ghs_mock"
    }, {
      githubClient: {
        getPullRequest: async () => ({
          labels: []
        })
      }
    });
  } catch (thrown) {
    error = thrown;
  } finally {
    process.chdir(originalCwd);
  }

  assert.ok(error, "expected stage_setup failure");
  assert.match(error.message, /missing the factory:self-modify label/);
});

test("prepare-stage-push allows protected-path changes when self-modify mode is fully authorized", async () => {
  const branch = "factory/self-modify-authorized";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();

  try {
    process.chdir(repoDir);
    fs.mkdirSync(path.join(repoDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "scripts", "self-modify.mjs"), "export const x = 1;\n");
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "505",
      FACTORY_ISSUE_TITLE: "Authorized self modify",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "46",
      FACTORY_ENABLE_SELF_MODIFY: "true",
      FACTORY_GITHUB_TOKEN: "pat_mock",
      GITHUB_TOKEN: "ghs_mock"
    }, {
      githubClient: {
        getPullRequest: async () => ({
          labels: [{ name: FACTORY_LABELS.selfModify }]
        })
      }
    });
  } finally {
    process.chdir(originalCwd);
  }
});

test("prepare-stage-push blocks FACTORY.md changes when self-modify mode is disabled", async () => {
  const branch = "factory/factory-policy-disabled";
  const { repoDir } = initTestRepo(branch);
  const originalCwd = process.cwd();
  let error = null;

  try {
    process.chdir(repoDir);
    fs.mkdirSync(path.join(repoDir, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, ".factory", "FACTORY.md"),
      "## Factory Policy\n\n- Guard this file.\n"
    );
    await prepareStagePushMain({
      FACTORY_BRANCH: branch,
      FACTORY_MODE: "implement",
      FACTORY_ISSUE_NUMBER: "507",
      FACTORY_ISSUE_TITLE: "Factory policy gate",
      FACTORY_ARTIFACTS_PATH: "",
      FACTORY_COST_SUMMARY_PATH: "",
      FACTORY_PR_NUMBER: "48",
      FACTORY_ENABLE_SELF_MODIFY: "",
      FACTORY_GITHUB_TOKEN: "pat_mock",
      GITHUB_TOKEN: "ghs_mock"
    }, {
      githubClient: {
        getPullRequest: async () => ({
          labels: [{ name: FACTORY_LABELS.selfModify }]
        })
      }
    });
  } catch (thrown) {
    error = thrown;
  } finally {
    process.chdir(originalCwd);
  }

  assert.ok(error, "expected stage_setup failure");
  assert.match(error.message, /\.factory\/FACTORY\.md/);
  assert.match(error.message, /FACTORY_ENABLE_SELF_MODIFY is not enabled/);
  assert.match(error.message, /workflow changes detected: no/);
  assert.match(error.message, /protected path changes detected: yes/);
});
