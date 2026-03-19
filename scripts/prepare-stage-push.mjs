import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import { buildCommitMessage } from "./lib/commit-message.mjs";
import { classifyFailure } from "./lib/failure-classification.mjs";
import { COST_SUMMARY_FILE_NAME } from "./lib/cost-estimation.mjs";
import { FACTORY_LABELS } from "./lib/factory-config.mjs";
import { getPullRequest } from "./lib/github.mjs";
import { evaluateStagePush, isSelfModifyEnabled, resolveStageToken } from "./lib/stage-push.mjs";
import { pruneFactoryTempArtifacts } from "./lib/temp-artifacts.mjs";
import { loadValidatedReviewArtifacts } from "./lib/review-artifacts.mjs";
import { renderStageDiagnostics } from "./lib/stage-diagnostics.mjs";
import {
  appendTelemetryEntry,
  buildTelemetryEntry,
  ensureTelemetryArray,
  TELEMETRY_OUTCOMES
} from "./lib/cost-telemetry.mjs";

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    throw error;
  }
}

function hasStagedChanges() {
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], {
      stdio: "ignore"
    });
    return false;
  } catch (error) {
    return error.status === 1;
  }
}

function hasWorktreeChanges() {
  return git(["status", "--porcelain"]).length > 0;
}

export function shouldPersistCostSummary(mode, worktreeHasChanges) {
  if (mode === "implement" || mode === "repair") {
    return worktreeHasChanges;
  }

  return mode === "plan" || mode === "review";
}

export function persistCostSummaryForStage({
  mode,
  artifactsPath,
  costSummaryPath,
  worktreeHasChanges,
  telemetryContext = {},
  stageOutcome = TELEMETRY_OUTCOMES.succeeded,
  now = new Date()
}) {
  if (!costSummaryPath || !artifactsPath) {
    return "";
  }

  if (!fs.existsSync(costSummaryPath) || !shouldPersistCostSummary(mode, worktreeHasChanges)) {
    return "";
  }

  const rawSummary = fs.readFileSync(costSummaryPath, "utf8");
  let summary = null;

  try {
    summary = JSON.parse(rawSummary);
  } catch (error) {
    console.warn(
      `Failed to parse temporary cost summary at ${costSummaryPath}; copying without telemetry.`
    );
    const outputPath = path.join(artifactsPath, COST_SUMMARY_FILE_NAME);
    fs.mkdirSync(artifactsPath, { recursive: true });
    fs.writeFileSync(outputPath, rawSummary);
    return outputPath;
  }

  try {
    ensureTelemetryArray(summary);

    if (telemetryContext.prNumber != null && summary.prNumber == null) {
      summary.prNumber = telemetryContext.prNumber;
    }

    const stageKey = telemetryContext.stage || summary?.current?.stage || mode;
    const context = {
      issueNumber: telemetryContext.issueNumber ?? summary.issueNumber,
      prNumber: telemetryContext.prNumber ?? summary.prNumber,
      branch: telemetryContext.branch ?? summary.branch,
      runId: telemetryContext.runId || "",
      runAttempt: telemetryContext.runAttempt,
      actualInputTokens: telemetryContext.actualInputTokens,
      actualUsd: telemetryContext.actualUsd,
      actualSource: telemetryContext.actualSource,
      calibrationSampleSize: telemetryContext.calibrationSampleSize,
      calibrationGeneratedAt: telemetryContext.calibrationGeneratedAt,
      model: telemetryContext.model
    };
    const entry = buildTelemetryEntry({
      summary,
      stageKey,
      context,
      outcome: stageOutcome,
      recordedAt: telemetryContext.recordedAt || now.toISOString()
    });
    const { appended, reason } = appendTelemetryEntry(summary, entry);

    if (!appended && reason === "duplicate") {
      console.warn(
        `Telemetry entry already recorded for ${entry.stage} run ${entry.runId} attempt ${entry.runAttempt ?? ""}; skipping append.`
      );
    }
  } catch (error) {
    console.warn(`Telemetry append skipped: ${error.message}`);
  }

  const outputPath = path.join(artifactsPath, COST_SUMMARY_FILE_NAME);
  fs.mkdirSync(artifactsPath, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  return outputPath;
}

function getChangedFiles(remoteHead, localHead) {
  return git(["diff", "--name-status", `${remoteHead}..${localHead}`])
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function countCommitsAhead(remoteHead) {
  return Number(git(["rev-list", "--count", `${remoteHead}..HEAD`]));
}

function buildStageSetupError(message, diagnosticsOptions) {
  const normalized = `${message || ""}`.trim() || "Unknown setup failure.";
  const diagnostics = renderStageDiagnostics(diagnosticsOptions);
  const sections = [
    `Stage setup prerequisites failed: ${normalized}`,
    "",
    "Stage diagnostics:",
    diagnostics
  ];

  return new Error(sections.join("\n"));
}

export function resolveStageCommitAction({
  mode,
  issueNumber,
  branch,
  issueTitle,
  commitsAhead,
  stagedDiff,
  diffFromRemote
}) {
  if (commitsAhead > 1) {
    throw new Error(
      `Factory stage produced ${commitsAhead} local commits ahead of origin/${branch}. ` +
        "Expected at most one stage-output commit; rerun after removing extra commits."
    );
  }

  if (!stagedDiff && commitsAhead === 0) {
    return {
      operation: "skip",
      commitSubject: ""
    };
  }

  const commitSubject = buildCommitMessage({
    mode,
    issueNumber,
    branch,
    issueTitle,
    stagedDiff: commitsAhead === 0 ? stagedDiff : diffFromRemote
  });

  return {
    operation: commitsAhead === 0 ? "commit" : "amend",
    commitSubject
  };
}

export function prepareStageCommit({ mode, issueNumber, branch, issueTitle, remoteHead }) {
  const commitsAhead = countCommitsAhead(remoteHead);
  const stagedDiff = hasStagedChanges() ? git(["diff", "--cached", "--name-status"]) : "";
  const diffFromRemote = commitsAhead > 0 ? git(["diff", "--cached", "--name-status", remoteHead]) : "";
  const action = resolveStageCommitAction({
    mode,
    issueNumber,
    branch,
    issueTitle,
    commitsAhead,
    stagedDiff,
    diffFromRemote
  });

  if (action.operation === "skip") {
    return action;
  }

  console.log(`Factory commit summary: ${action.commitSubject}`);

  if (action.operation === "amend") {
    git(["commit", "--amend", "-m", action.commitSubject]);
    return action;
  }

  git(["commit", "-m", action.commitSubject]);
  return action;
}

export function shouldAllowNoChanges(mode) {
  return mode === "review";
}

export function validateReviewArtifactsForStage(
  { mode, artifactsPath, reviewMethod },
  validator = loadValidatedReviewArtifacts
) {
  if (mode !== "review") {
    return;
  }

  if (!artifactsPath) {
    throw new Error("FACTORY_ARTIFACTS_PATH is required when FACTORY_MODE is \"review\".");
  }

  validator({
    artifactsPath,
    requestedMethodology: reviewMethod
  });
}

function buildStageNoopError(diagnosticsOptions) {
  const diagnostics = renderStageDiagnostics(diagnosticsOptions);
  const sections = [
    "Stage run completed without preparing repository changes.",
    "",
    "Stage diagnostics:",
    diagnostics
  ];

  return new Error(sections.join("\n"));
}

function pullRequestHasLabel(pullRequest, label) {
  if (!Array.isArray(pullRequest?.labels)) {
    return false;
  }

  return pullRequest.labels.some((entry) => `${entry?.name || ""}`.trim() === label);
}

export async function resolveStagePushAuthorization({
  env,
  prNumber,
  githubClient = { getPullRequest }
}) {
  const selfModifyEnabled = isSelfModifyEnabled(env.FACTORY_ENABLE_SELF_MODIFY);

  if (!(prNumber > 0)) {
    return {
      selfModifyEnabled,
      hasSelfModifyLabel: false
    };
  }

  const pullRequest = await githubClient.getPullRequest(prNumber);

  return {
    selfModifyEnabled,
    hasSelfModifyLabel: pullRequestHasLabel(pullRequest, FACTORY_LABELS.selfModify)
  };
}

export async function main(env = process.env, { githubClient = { getPullRequest } } = {}) {
  const branch = env.FACTORY_BRANCH;
  const mode = env.FACTORY_MODE || "stage";
  const issueNumber = env.FACTORY_ISSUE_NUMBER || "0";
  const issueTitle = env.FACTORY_ISSUE_TITLE || "";
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH || "";
  const costSummaryPath = env.FACTORY_COST_SUMMARY_PATH || "";
  const reviewMethod = env.FACTORY_REVIEW_METHOD || "";
  const prNumberRaw = env.FACTORY_PR_NUMBER || "";
  const githubRunId = env.GITHUB_RUN_ID || "";
  const githubRunAttempt = env.GITHUB_RUN_ATTEMPT || "";
  const factoryTokenConfigured = Boolean(`${env.FACTORY_GITHUB_TOKEN || ""}`.trim());

  if (!branch) {
    throw new Error("FACTORY_BRANCH is required.");
  }

  const remoteHead = git(["rev-parse", `origin/${branch}`], { allowFailure: true });

  let resolvedToken;

  try {
    resolvedToken = resolveStageToken({
      factoryToken: env.FACTORY_GITHUB_TOKEN,
      githubToken: env.GITHUB_TOKEN
    });
  } catch (error) {
    throw buildStageSetupError(error?.message, {
      branch,
      remoteHead,
      hasFactoryToken: factoryTokenConfigured,
      workflowChanges: false
    });
  }

  pruneFactoryTempArtifacts();

  try {
    validateReviewArtifactsForStage(
      {
        mode,
        artifactsPath,
        reviewMethod
      }
    );
  } catch (error) {
    throw buildStageSetupError(error?.message, {
      branch,
      remoteHead,
      hasFactoryToken: resolvedToken.source === "factory",
      workflowChanges: false
    });
  }

  if (!remoteHead) {
    throw buildStageSetupError(`Remote branch origin/${branch} is missing.`, {
      branch,
      remoteHead,
      hasFactoryToken: resolvedToken.source === "factory",
      workflowChanges: false
    });
  }

  persistCostSummaryForStage({
    mode,
    artifactsPath,
    costSummaryPath,
    worktreeHasChanges: hasWorktreeChanges(),
    telemetryContext: {
      issueNumber: Number(issueNumber),
      prNumber: Number(prNumberRaw) > 0 ? Number(prNumberRaw) : null,
      branch,
      runId: githubRunId,
      runAttempt: githubRunAttempt
    }
  });
  git(["add", "-A"]);
  prepareStageCommit({ mode, issueNumber, branch, issueTitle, remoteHead });

  const localHead = git(["rev-parse", "HEAD"]);

  if (localHead === remoteHead) {
    if (shouldAllowNoChanges(mode)) {
      setOutputs({
        changed_files: "",
        token_source: resolvedToken.source,
        workflow_changes: "false",
        failure_type: "",
        failure_message: "",
        transient_retry_attempts: "0",
        prepared_head_sha: localHead
      });
      return;
    }

    throw buildStageNoopError({
      branch,
      remoteHead,
      hasFactoryToken: resolvedToken.source === "factory",
      workflowChanges: false
    });
  }

  const changedFiles = getChangedFiles(remoteHead, localHead);
  const prNumber = Number(prNumberRaw);
  const authorization = await resolveStagePushAuthorization({
    env,
    prNumber,
    githubClient
  });
  const evaluation = evaluateStagePush({
    changedFiles,
    hasFactoryToken: resolvedToken.source === "factory",
    selfModifyEnabled: authorization.selfModifyEnabled,
    hasSelfModifyLabel: authorization.hasSelfModifyLabel
  });

  if (!evaluation.allowed) {
    throw buildStageSetupError(evaluation.reason, {
      branch,
      remoteHead,
      hasFactoryToken: resolvedToken.source === "factory",
      workflowChanges: evaluation.workflowChanges
    });
  }

  setOutputs({
    changed_files: changedFiles.join("\n"),
    token_source: resolvedToken.source,
    workflow_changes: evaluation.workflowChanges ? "true" : "false",
    failure_type: "",
    failure_message: "",
    transient_retry_attempts: "0",
    prepared_head_sha: localHead
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    setOutputs({
      failure_type: classifyFailure(error.message),
      failure_message: `${error.message || ""}`.trim(),
      transient_retry_attempts: "0",
      prepared_head_sha: ""
    });
    console.error(`${error.message}`);
    process.exitCode = 1;
  }
}
