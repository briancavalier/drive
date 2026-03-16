import { execFileSync } from "node:child_process";
import { setOutputs } from "./lib/actions-output.mjs";
import { buildCommitMessage } from "./lib/commit-message.mjs";
import { classifyFailure } from "./lib/failure-classification.mjs";
import { evaluateStagePush, resolveStageToken } from "./lib/stage-push.mjs";
import { pruneFactoryTempArtifacts } from "./lib/temp-artifacts.mjs";

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

function getChangedFiles(remoteHead, localHead) {
  return git(["diff", "--name-status", `${remoteHead}..${localHead}`])
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function commitStageOutput({ mode, issueNumber, branch, issueTitle }) {
  git(["add", "-A"]);

  if (!hasStagedChanges()) {
    return false;
  }

  const stagedDiff = git(["diff", "--cached", "--name-status"]);
  const commitSubject = buildCommitMessage({
    mode,
    issueNumber,
    branch,
    issueTitle,
    stagedDiff
  });

  console.log(`Factory commit summary: ${commitSubject}`);

  git(["commit", "-m", commitSubject]);
  return true;
}

function main(env = process.env) {
  const branch = env.FACTORY_BRANCH;
  const mode = env.FACTORY_MODE || "stage";
  const issueNumber = env.FACTORY_ISSUE_NUMBER || "0";
  const issueTitle = env.FACTORY_ISSUE_TITLE || "";

  if (!branch) {
    throw new Error("FACTORY_BRANCH is required.");
  }

  const resolvedToken = resolveStageToken({
    factoryToken: env.FACTORY_GITHUB_TOKEN,
    githubToken: env.GITHUB_TOKEN
  });

  pruneFactoryTempArtifacts();

  commitStageOutput({ mode, issueNumber, branch, issueTitle });

  const localHead = git(["rev-parse", "HEAD"]);
  const remoteHead = git(["rev-parse", `origin/${branch}`], { allowFailure: true });

  if (!remoteHead) {
    throw new Error(`Remote branch origin/${branch} is missing.`);
  }

  if (localHead === remoteHead) {
    throw new Error("Codex completed without producing repository changes.");
  }

  const changedFiles = getChangedFiles(remoteHead, localHead);
  const evaluation = evaluateStagePush({
    changedFiles,
    hasFactoryToken: resolvedToken.source === "factory"
  });

  if (!evaluation.allowed) {
    throw new Error(evaluation.reason);
  }

  setOutputs({
    changed_files: changedFiles.join("\n"),
    token_source: resolvedToken.source,
    workflow_changes: evaluation.workflowChanges ? "true" : "false",
    failure_type: "",
    failure_message: "",
    transient_retry_attempts: "0"
  });
}

try {
  main();
} catch (error) {
  setOutputs({
    failure_type: classifyFailure(error.message),
    failure_message: `${error.message || ""}`.trim(),
    transient_retry_attempts: "0"
  });
  console.error(`${error.message}`);
  process.exitCode = 1;
}
