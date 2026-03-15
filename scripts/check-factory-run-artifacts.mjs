import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  listFactoryRunArtifacts,
  shouldBlockFactoryRunArtifacts
} from "./lib/factory-artifact-guard.mjs";

function gitDiffNames(range) {
  const output = execFileSync("git", ["diff", "--name-only", range, "--"], {
    encoding: "utf8"
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildContext(eventName, payload) {
  if (eventName === "pull_request") {
    return {
      eventName,
      baseRef: payload.pull_request?.base?.ref || "",
      headRef: payload.pull_request?.head?.ref || "",
      changedFiles: gitDiffNames(
        `${payload.pull_request?.base?.sha}...${payload.pull_request?.head?.sha}`
      )
    };
  }

  if (eventName === "push") {
    return {
      eventName,
      changedFiles: gitDiffNames(`${payload.before}...${payload.after}`)
    };
  }

  return {
    eventName,
    changedFiles: []
  };
}

const eventName = process.env.GITHUB_EVENT_NAME || "";
const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const context = buildContext(eventName, payload);
const artifacts = listFactoryRunArtifacts(context.changedFiles);

if (!shouldBlockFactoryRunArtifacts(context)) {
  console.log(`Factory artifact guard passed (${artifacts.length} artifact files changed).`);
  process.exit(0);
}

console.error("Factory run artifacts may only be merged to main from factory/* branches.");
for (const artifact of artifacts) {
  console.error(`- ${artifact}`);
}
process.exit(1);
