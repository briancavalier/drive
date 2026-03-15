import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  listBlockingFactoryRunArtifacts,
  listFactoryRunArtifacts,
  shouldBlockFactoryRunArtifacts
} from "./lib/factory-artifact-guard.mjs";

function gitDiffChanges(range) {
  const output = execFileSync("git", ["diff", "--name-status", range, "--"], {
    encoding: "utf8"
  });

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

function buildContext(eventName, payload) {
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
      changes: gitDiffChanges(`${payload.before}...${payload.after}`)
    };
  }

  return {
    eventName,
    changes: []
  };
}

const eventName = process.env.GITHUB_EVENT_NAME || "";
const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const context = buildContext(eventName, payload);
const artifacts = listFactoryRunArtifacts(context.changes);
const blockingArtifacts = listBlockingFactoryRunArtifacts(context.changes);

if (!shouldBlockFactoryRunArtifacts(context)) {
  console.log(`Factory artifact guard passed (${artifacts.length} artifact files changed).`);
  process.exit(0);
}

console.error("Factory run artifacts may only be merged to main from factory/* branches.");
for (const artifact of blockingArtifacts) {
  console.error(`- ${artifact.path}`);
}
process.exit(1);
