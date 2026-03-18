import { execFileSync } from "node:child_process";

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

function parseStatusEntries(statusOutput) {
  if (!statusOutput) {
    return [];
  }

  return statusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("??")) {
        return {
          original: line,
          staged: false,
          worktree: true
        };
      }

      const staged = line[0] && line[0] !== " ";
      const worktree = line[1] && line[1] !== " ";

      return {
        original: line,
        staged,
        worktree
      };
    });
}

function summarizeEntries(entries, limit) {
  if (!entries.length) {
    return ["  - (none)"];
  }

  return entries.slice(0, limit).map((entry) => `  - ${entry.original}`);
}

function listFromCommand(args, limit) {
  const output = git(args, { allowFailure: true });
  const lines = output
    ? output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  if (!lines.length) {
    return ["  - (none)"];
  }

  return lines.slice(0, limit).map((line) => `  - ${line}`);
}

export function renderStageDiagnostics({
  branch,
  remoteHead,
  hasFactoryToken,
  workflowChanges = false,
  statusSampleLimit = 5,
  diffSampleLimit = 5
} = {}) {
  const localHead = git(["rev-parse", "HEAD"], { allowFailure: true }) || "(unknown)";
  const commitsAhead =
    remoteHead && remoteHead !== "(missing)"
      ? Number(git(["rev-list", "--count", `${remoteHead}..HEAD`], { allowFailure: true }) || "0")
      : 0;
  const statusEntries = parseStatusEntries(
    git(["status", "--short"], { allowFailure: true })
  );
  const stagedDiffSummary = listFromCommand(["diff", "--cached", "--name-status"], diffSampleLimit);
  const remoteDiffSummary =
    remoteHead && remoteHead !== "(missing)"
      ? listFromCommand(["diff", "--name-status", `${remoteHead}...HEAD`], diffSampleLimit)
      : ["  - (unavailable)"];
  const lines = [
    `branch: ${branch || "(unknown)"}`,
    `remote head: ${remoteHead || "(missing)"}`,
    `local head: ${localHead}`,
    `commits ahead of origin/${branch || "(unknown)"}: ${commitsAhead}`,
    `staged files: ${statusEntries.filter((entry) => entry.staged).length}`,
    `worktree files: ${statusEntries.filter((entry) => entry.worktree).length}`,
    `FACTORY_GITHUB_TOKEN available: ${hasFactoryToken ? "yes" : "no"}`,
    `workflow changes detected: ${workflowChanges ? "yes" : "no"}`,
    "status sample:",
    ...summarizeEntries(statusEntries, statusSampleLimit),
    "staged diff sample:",
    ...stagedDiffSummary,
    `diff vs origin/${branch || "(unknown)"} sample:`,
    ...remoteDiffSummary
  ];

  return lines.join("\n");
}
