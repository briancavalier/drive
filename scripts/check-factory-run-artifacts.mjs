import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  listBlockingFactoryTempArtifacts,
  listBlockingFactoryRunArtifacts,
  listFactoryRunArtifacts,
  listInvalidFactoryRunArtifacts,
  shouldBlockFactoryRunArtifacts
} from "./lib/factory-artifact-guard.mjs";

export function parseNameStatusOutput(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return {
        status,
        path: rest.at(-1) || ""
      };
    });
}

function gitDiffChanges(range) {
  const output = execFileSync("git", ["diff", "--name-status", range, "--"], {
    encoding: "utf8"
  });

  return parseNameStatusOutput(output);
}

export function buildPushChangesFromCommits(commits = []) {
  const changesByPath = new Map();

  for (const commit of commits) {
    for (const path of commit.added || []) {
      changesByPath.set(path, { status: "A", path });
    }

    for (const path of commit.modified || []) {
      changesByPath.set(path, { status: "M", path });
    }

    for (const path of commit.removed || []) {
      changesByPath.set(path, { status: "D", path });
    }
  }

  return [...changesByPath.values()];
}

export function resolvePushChanges(payload, diffChanges = gitDiffChanges) {
  const range = `${payload.before}...${payload.after}`;

  try {
    return diffChanges(range);
  } catch (error) {
    const message = `${error?.stderr || error?.message || ""}`;

    if (
      error?.status === 128 &&
      (message.includes("Invalid symmetric difference expression") ||
        message.includes("bad object") ||
        message.includes("unknown revision"))
    ) {
      return buildPushChangesFromCommits(payload.commits);
    }

    throw error;
  }
}

export function buildContext(eventName, payload) {
  if (eventName === "pull_request") {
    return {
      eventName,
      baseRef: payload.pull_request?.base?.ref || "",
      headRef: payload.pull_request?.head?.ref || "",
      changes: gitDiffChanges(
        `${payload.pull_request?.base?.sha}...${payload.pull_request?.head?.sha}`
      )
    };
  }

  if (eventName === "push") {
    return {
      eventName,
      changes: resolvePushChanges(payload)
    };
  }

  return {
    eventName,
    changes: []
  };
}

export function main(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME || "";
  const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const context = buildContext(eventName, payload);
  const artifacts = listFactoryRunArtifacts(context.changes);
  const blockingArtifacts = listBlockingFactoryRunArtifacts(context.changes);
  const invalidArtifacts = listInvalidFactoryRunArtifacts(context.changes);
  const tempArtifacts = listBlockingFactoryTempArtifacts(context.changes);

  if (!shouldBlockFactoryRunArtifacts(context)) {
    console.log(`Factory artifact guard passed (${artifacts.length} artifact files changed).`);
    return;
  }

  if (invalidArtifacts.length > 0) {
    console.error(
      "Only durable factory run artifacts may be added or modified under .factory/runs/**."
    );
  }

  if (tempArtifacts.length > 0) {
    console.error("Temporary factory artifacts under .factory/tmp/** must not be committed.");
  }

  if (
    invalidArtifacts.length === 0 &&
    tempArtifacts.length === 0 &&
    blockingArtifacts.length > 0
  ) {
    console.error("Factory run artifacts may only be merged to main from factory/* branches.");
  }

  for (const artifact of [...invalidArtifacts, ...tempArtifacts, ...blockingArtifacts]) {
    console.error(`- ${artifact.path}`);
  }

  process.exit(1);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
