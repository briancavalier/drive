import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FACTORY_LABELS } from "./lib/factory-config.mjs";
import { addLabels, commentOnIssue } from "./lib/github.mjs";
import { renderIntakeBranchExistsComment } from "./lib/github-messages.mjs";

export const INTAKE_FAILURE_CODES = Object.freeze({
  branchExists: "factory_branch_exists"
});

export function readIntakeFailure(failurePath) {
  const normalizedPath = `${failurePath || ""}`.trim();

  if (!normalizedPath) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(normalizedPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function buildIntakeFailureComment(failure) {
  if (!failure || failure.code !== INTAKE_FAILURE_CODES.branchExists) {
    return "";
  }

  return renderIntakeBranchExistsComment({
    branch: failure.branch,
    retryCommand: "/factory start"
  });
}

export async function main(env = process.env, dependencies = {}) {
  const failure = readIntakeFailure(env.FACTORY_INTAKE_FAILURE_PATH);

  if (!failure || failure.code !== INTAKE_FAILURE_CODES.branchExists) {
    return { handled: false, failure };
  }

  const issueNumber = Number(failure.issueNumber || env.FACTORY_ISSUE_NUMBER || 0);

  if (!issueNumber) {
    throw new Error("FACTORY_ISSUE_NUMBER is required to handle intake failures");
  }

  const githubClient = {
    addLabels,
    commentOnIssue,
    ...(dependencies.githubClient || {})
  };

  await githubClient.addLabels(issueNumber, [FACTORY_LABELS.intakeRejected]);
  await githubClient.commentOnIssue(issueNumber, buildIntakeFailureComment(failure));

  return { handled: true, failure };
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(`${error.message}`);
    process.exitCode = 1;
  }
}
