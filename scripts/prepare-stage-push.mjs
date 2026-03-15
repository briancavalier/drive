import { execFileSync } from "node:child_process";
import { setOutputs } from "./lib/actions-output.mjs";
import { evaluateStagePush, resolveStageToken } from "./lib/stage-push.mjs";

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
  return git(["diff", "--name-only", `${remoteHead}..${localHead}`])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

function commitStageOutput(mode, issueNumber) {
  git(["add", "-A"]);

  if (!hasStagedChanges()) {
    return false;
  }

  git(["commit", "-m", `factory(${mode}): issue #${issueNumber}`]);
  return true;
}

function main(env = process.env) {
  const branch = env.FACTORY_BRANCH;
  const mode = env.FACTORY_MODE || "stage";
  const issueNumber = env.FACTORY_ISSUE_NUMBER || "0";

  if (!branch) {
    throw new Error("FACTORY_BRANCH is required.");
  }

  const resolvedToken = resolveStageToken({
    factoryToken: env.FACTORY_GITHUB_TOKEN,
    githubToken: env.GITHUB_TOKEN
  });

  commitStageOutput(mode, issueNumber);

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
    workflow_changes: evaluation.workflowChanges ? "true" : "false"
  });
}

try {
  main();
} catch (error) {
  console.error(`${error.message}`);
  process.exitCode = 1;
}
