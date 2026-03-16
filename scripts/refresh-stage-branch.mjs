import { execFileSync } from "node:child_process";
import { setOutputs } from "./lib/actions-output.mjs";
import { FAILURE_TYPES } from "./lib/failure-classification.mjs";

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

function mergeBaseIsAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore"
    });
    return true;
  } catch (error) {
    return error.status === 0;
  }
}

function mergeOriginMain() {
  try {
    git(["merge", "--no-edit", "--no-ff", "origin/main"]);
    return { merged: true, conflict: false, message: "" };
  } catch (error) {
    const output = `${error.stderr || ""}${error.stdout || ""}`.trim();
    git(["merge", "--abort"], { allowFailure: true });
    return {
      merged: false,
      conflict: true,
      message:
        output ||
        "Automatic merge failed while refreshing the factory branch from origin/main."
    };
  }
}

function main(env = process.env) {
  const branch = `${env.FACTORY_BRANCH || ""}`.trim();

  if (!branch) {
    throw new Error("FACTORY_BRANCH is required.");
  }

  git(["fetch", "origin", "main"]);

  const originalHead = git(["rev-parse", "HEAD"]);
  const mainHead = git(["rev-parse", "origin/main"]);

  if (mergeBaseIsAncestor("origin/main", "HEAD")) {
    setOutputs({
      refreshed: "false",
      refreshed_head_sha: originalHead,
      base_main_sha: mainHead,
      failure_type: "",
      failure_message: ""
    });
    return;
  }

  const mergeResult = mergeOriginMain();

  if (!mergeResult.merged) {
    setOutputs({
      refreshed: "false",
      refreshed_head_sha: originalHead,
      base_main_sha: mainHead,
      failure_type: FAILURE_TYPES.staleBranchConflict,
      failure_message: mergeResult.message
    });
    throw new Error(mergeResult.message);
  }

  setOutputs({
    refreshed: "true",
    refreshed_head_sha: git(["rev-parse", "HEAD"]),
    base_main_sha: mainHead,
    failure_type: "",
    failure_message: ""
  });
}

try {
  main();
} catch (error) {
  console.error(`${error.message}`);
  process.exitCode = 1;
}
