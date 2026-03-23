import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import { buildCommitMessage } from "./lib/commit-message.mjs";
import { classifyFailure } from "./lib/failure-classification.mjs";
import {
  COST_SUMMARY_FILE_NAME,
  MODEL_PRICING,
  FALLBACK_MODEL_PRICING,
  deriveUsdFromUsage
} from "./lib/cost-estimation.mjs";
import { FACTORY_LABELS } from "./lib/factory-config.mjs";
import { getPullRequest } from "./lib/github.mjs";
import {
  evaluateStagePush,
  getProtectedPathChanges,
  isSelfModifyEnabled,
  resolveStageToken
} from "./lib/stage-push.mjs";
import { pruneFactoryTempArtifacts } from "./lib/temp-artifacts.mjs";
import { loadValidatedReviewArtifacts } from "./lib/review-artifacts.mjs";
import { renderStageDiagnostics } from "./lib/stage-diagnostics.mjs";
import {
  buildUsageEvent,
  TELEMETRY_OUTCOMES
} from "./lib/cost-telemetry.mjs";
import { writeUsageEvent } from "./lib/cost-telemetry.mjs";

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

function maybeReadJson(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function readActualUsageTelemetry(filePath) {
  const parsed = maybeReadJson(filePath);

  if (!parsed) {
    return {
      actualUsage: {},
      actualUsd: null,
      apiSurface: ""
    };
  }

  return {
    actualUsage: parsed.actualUsage || {},
    actualUsd:
      parsed.actualUsd == null ? null : Number(parsed.actualUsd) || 0,
    apiSurface: `${parsed.apiSurface || ""}`.trim()
  };
}

function resolveActualUsd(stageSummary, actualUsage, explicitActualUsd) {
  if (explicitActualUsd != null) {
    return explicitActualUsd;
  }

  const usagePresent = Object.values(actualUsage || {}).some((value) => value != null);

  if (!usagePresent) {
    return null;
  }

  const model = `${stageSummary?.model || ""}`.trim();
  const pricingSource = stageSummary?.derivedCost?.pricingSource;
  const pricing =
    pricingSource === "model" && MODEL_PRICING[model]
      ? MODEL_PRICING[model]
      : FALLBACK_MODEL_PRICING;

  return deriveUsdFromUsage(actualUsage, pricing);
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
    if (telemetryContext.prNumber != null && summary.prNumber == null) {
      summary.prNumber = telemetryContext.prNumber;
    }
    const stageKey = telemetryContext.stage || summary?.current?.stage || mode;
    const stageSummary = summary?.stages?.[stageKey];

    if (!stageSummary) {
      throw new Error(`Missing stage summary for "${stageKey}".`);
    }

    const recordedAt = telemetryContext.recordedAt || now.toISOString();
    const resolvedApiSurface =
      telemetryContext.apiSurface || stageSummary.apiSurface || summary.apiSurface;
    const resolvedActualUsage = telemetryContext.actualUsage || {};
    const resolvedActualUsd = resolveActualUsd(
      stageSummary,
      resolvedActualUsage,
      telemetryContext.actualUsd
    );

    stageSummary.apiSurface = resolvedApiSurface;
    stageSummary.actualUsage = resolvedActualUsage;
    stageSummary.derivedCost = {
      ...stageSummary.derivedCost,
      actualUsd: resolvedActualUsd
    };

    if (summary.current?.stage === stageKey) {
      summary.apiSurface = resolvedApiSurface;
      summary.current.apiSurface = resolvedApiSurface;
      summary.current.actualUsage = resolvedActualUsage;
      summary.current.derivedCost = {
        ...summary.current.derivedCost,
        actualUsd: resolvedActualUsd
      };
    }

    const event = buildUsageEvent({
      category: "stage",
      stage: stageKey,
      issueNumber: telemetryContext.issueNumber ?? summary.issueNumber,
      prNumber: telemetryContext.prNumber ?? summary.prNumber,
      branch: telemetryContext.branch ?? summary.branch,
      runId: telemetryContext.runId || "",
      runAttempt: telemetryContext.runAttempt,
      provider: stageSummary.provider || summary.provider,
      apiSurface: resolvedApiSurface,
      model: telemetryContext.model || stageSummary.model,
      promptChars: stageSummary.promptChars,
      estimatedUsageBeforeCalibration:
        stageSummary.estimatedUsageBeforeCalibration,
      estimatedUsage: stageSummary.estimatedUsage,
      actualUsage: resolvedActualUsage,
      derivedCost: {
        estimatedUsdBeforeCalibration:
          stageSummary.derivedCost?.stageUsdBeforeCalibration,
        estimatedUsd: stageSummary.derivedCost?.stageUsd,
        actualUsd: resolvedActualUsd,
        pricingVersion: summary.pricing?.version,
        pricingSource: stageSummary.derivedCost?.pricingSource,
        currency: summary.pricing?.currency || "USD"
      },
      usageCalibration: stageSummary.usageCalibration,
      outcome: stageOutcome,
      recordedAt
    });
    const eventPath = writeUsageEvent(event);
    stageSummary.sourceEventPath = eventPath;
    if (summary.current?.stage === stageKey) {
      summary.current.sourceEventPath = eventPath;
    }
  } catch (error) {
    console.warn(`Usage event write skipped: ${error.message}`);
  }

  delete summary.telemetry;

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
  protectedPathChanges = [],
  githubClient = { getPullRequest }
}) {
  const selfModifyEnabled = isSelfModifyEnabled(env.FACTORY_ENABLE_SELF_MODIFY);

  if (!(prNumber > 0) || protectedPathChanges.length === 0) {
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
  const actualUsagePath = env.FACTORY_STAGE_ACTUAL_USAGE_PATH || "";
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
      workflowChanges: false,
      protectedPathChanges: false
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
      workflowChanges: false,
      protectedPathChanges: false
    });
  }

  if (!remoteHead) {
    throw buildStageSetupError(`Remote branch origin/${branch} is missing.`, {
      branch,
      remoteHead,
      hasFactoryToken: resolvedToken.source === "factory",
      workflowChanges: false,
      protectedPathChanges: false
    });
  }

  const actualUsageTelemetry = readActualUsageTelemetry(actualUsagePath);

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
      runAttempt: githubRunAttempt,
      apiSurface: actualUsageTelemetry.apiSurface,
      actualUsage: actualUsageTelemetry.actualUsage,
      actualUsd: actualUsageTelemetry.actualUsd
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
      workflowChanges: false,
      protectedPathChanges: false
    });
  }

  const changedFiles = getChangedFiles(remoteHead, localHead);
  const protectedPathChanges = getProtectedPathChanges(changedFiles);
  const prNumber = Number(prNumberRaw);
  const authorization = await resolveStagePushAuthorization({
    env,
    prNumber,
    protectedPathChanges,
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
      workflowChanges: evaluation.workflowChanges,
      protectedPathChanges: evaluation.protectedPathChanges.length > 0
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
