import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import {
  createPullRequest,
  getPullRequest,
  getRepoContext,
  githubRequest,
  searchIssues
} from "./lib/github.mjs";

const DEFAULT_TITLE = "Factory: Update usage calibration";
const DEFAULT_BRANCH_PREFIX = "automation/usage-calibration-";

function requiredEnv(name, env = process.env) {
  const value = `${env[name] || ""}`.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function buildUsageCalibrationPrBody({
  runUrl,
  branch,
  bucketsUpdated,
  entriesEvaluated,
  entriesSkipped
}) {
  const usedEntries = Math.max(0, entriesEvaluated - entriesSkipped);

  return [
    "## Summary",
    "This PR refreshes `.factory/usage-calibration.json` from merged factory usage events.",
    "",
    "## Calibration Stats",
    `- Buckets updated: ${bucketsUpdated}`,
    `- Entries evaluated: ${entriesEvaluated}`,
    `- Entries used: ${usedEntries}`,
    `- Entries skipped: ${entriesSkipped}`,
    "",
    "## Source",
    `- Workflow run: ${runUrl || "n/a"}`,
    `- Branch: \`${branch}\``
  ].join("\n");
}

function buildSearchQuery({ owner, repo, title }) {
  return `repo:${owner}/${repo} is:pr is:open in:title "${title}"`;
}

function branchRefPath(branch) {
  return `/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
}

export async function main(env = process.env, dependencies = {}) {
  const branch = requiredEnv("FACTORY_CALIBRATION_BRANCH", env);
  const base = `${env.FACTORY_CALIBRATION_BASE_BRANCH || "main"}`.trim() || "main";
  const title = `${env.FACTORY_CALIBRATION_PR_TITLE || DEFAULT_TITLE}`.trim() || DEFAULT_TITLE;
  const branchPrefix =
    `${env.FACTORY_CALIBRATION_BRANCH_PREFIX || DEFAULT_BRANCH_PREFIX}`.trim() ||
    DEFAULT_BRANCH_PREFIX;
  const runUrl = `${env.FACTORY_CALIBRATION_RUN_URL || ""}`.trim();
  const bucketsUpdated = Number(env.FACTORY_CALIBRATION_BUCKETS_UPDATED) || 0;
  const entriesEvaluated = Number(env.FACTORY_CALIBRATION_ENTRIES_EVALUATED) || 0;
  const entriesSkipped = Number(env.FACTORY_CALIBRATION_ENTRIES_SKIPPED) || 0;
  const createPullRequestImpl = dependencies.createPullRequestImpl || createPullRequest;
  const getPullRequestImpl = dependencies.getPullRequestImpl || getPullRequest;
  const searchIssuesImpl = dependencies.searchIssuesImpl || searchIssues;
  const githubRequestImpl = dependencies.githubRequestImpl || githubRequest;
  const getRepoContextImpl = dependencies.getRepoContextImpl || getRepoContext;
  const { owner, repo, serverUrl } = getRepoContextImpl();

  const searchResults = await searchIssuesImpl({
    query: buildSearchQuery({ owner, repo, title }),
    perPage: 20
  });

  const openCalibrationPrs = [];

  for (const item of searchResults?.items || []) {
    if (!item?.pull_request || item.title !== title) {
      continue;
    }

    const pr = await getPullRequestImpl(item.number);

    if (pr?.state !== "open") {
      continue;
    }

    if (pr?.base?.ref !== base) {
      continue;
    }

    if (!`${pr?.head?.ref || ""}`.startsWith(branchPrefix)) {
      continue;
    }

    openCalibrationPrs.push(pr);
  }

  const body = buildUsageCalibrationPrBody({
    runUrl,
    branch,
    bucketsUpdated,
    entriesEvaluated,
    entriesSkipped
  });

  const nextPr = await createPullRequestImpl({
    title,
    head: branch,
    base,
    body,
    draft: true
  });

  let closedCount = 0;
  let deletedBranchCount = 0;

  for (const pr of openCalibrationPrs) {
    if (pr.number === nextPr.number) {
      continue;
    }

    await githubRequestImpl(`/repos/${owner}/${repo}/pulls/${pr.number}`, {
      method: "PATCH",
      body: { state: "closed" }
    });
    closedCount += 1;

    const previousBranch = `${pr?.head?.ref || ""}`.trim();
    if (
      previousBranch &&
      previousBranch !== branch &&
      previousBranch.startsWith(branchPrefix)
    ) {
      try {
        await githubRequestImpl(
          `/repos/${owner}/${repo}${branchRefPath(previousBranch)}`,
          { method: "DELETE" }
        );
        deletedBranchCount += 1;
      } catch (error) {
        if (!`${error.message || ""}`.includes("404")) {
          throw error;
        }
      }
    }
  }

  const prUrl =
    nextPr.html_url || `${serverUrl}/${owner}/${repo}/pull/${nextPr.number}`;

  setOutputs({
    pr_number: String(nextPr.number),
    pr_url: prUrl,
    replaced_pr_count: String(closedCount),
    deleted_branch_count: String(deletedBranchCount)
  });

  process.stdout.write(
    `Opened calibration PR #${nextPr.number}; closed ${closedCount} prior calibration PR(s) and deleted ${deletedBranchCount} branch(es).\n`
  );

  return {
    prNumber: nextPr.number,
    prUrl,
    replacedPrCount: closedCount,
    deletedBranchCount: deletedBranchCount
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
