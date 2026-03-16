import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

function countCommitsAhead(remoteHead) {
  return Number(git(["rev-list", "--count", `${remoteHead}..HEAD`]));
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

export function main(env = process.env) {
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
  const remoteHead = git(["rev-parse", `origin/${branch}`], { allowFailure: true });

  if (!remoteHead) {
    throw new Error(`Remote branch origin/${branch} is missing.`);
  }

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
        transient_retry_attempts: "0"
      });
      return;
    }

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

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
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
}
