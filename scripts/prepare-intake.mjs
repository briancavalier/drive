import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  issueArtifactsPath
} from "./lib/factory-config.mjs";
import {
  isValidIssueForm,
  missingIssueFormFields,
  parseIssueForm,
  slugifyIssueTitle
} from "./lib/issue-form.mjs";
import { defaultPrMetadata, renderPrBody } from "./lib/pr-metadata.mjs";
import {
  commentOnIssue,
  getCollaboratorPermission
} from "./lib/github.mjs";
import { setOutputs } from "./lib/actions-output.mjs";

function readEvent() {
  return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
}

function git(args) {
  execFileSync("git", args, { stdio: "inherit" });
}

function stripFactoryPrefix(title) {
  return `${title || ""}`.replace(/^\[factory\]\s*/i, "").trim();
}

const payload = readEvent();
const issue = payload.issue;

if (!issue) {
  throw new Error("Expected an issue event payload");
}

const permission = await getCollaboratorPermission(payload.sender.login);

if (!["write", "maintain", "admin"].includes(permission.permission)) {
  throw new Error(`Sender ${payload.sender.login} does not have write access`);
}

const parsedIssue = parseIssueForm(issue.body);

if (!isValidIssueForm(parsedIssue)) {
  const missing = missingIssueFormFields(parsedIssue).join(", ");
  await commentOnIssue(
    issue.number,
    `Factory intake rejected. Missing required issue sections: ${missing}.`
  );
  throw new Error(`Issue form is incomplete: ${missing}`);
}

const defaultBranch = payload.repository.default_branch;
const slug = slugifyIssueTitle(issue.title);
const branch = `factory/${issue.number}-${slug}`;
const artifactsPath = issueArtifactsPath(issue.number);
const maxRepairAttempts =
  Number(process.env.FACTORY_MAX_REPAIR_ATTEMPTS) || DEFAULT_MAX_REPAIR_ATTEMPTS;

git(["config", "user.name", "github-actions[bot]"]);
git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
git(["fetch", "origin", defaultBranch]);
git(["checkout", "-B", branch, `origin/${defaultBranch}`]);
git(["push", "origin", `HEAD:refs/heads/${branch}`]);

setOutputs({
  issue_number: issue.number,
  pr_number: "0",
  branch,
  artifacts_path: artifactsPath,
  max_repair_attempts: String(maxRepairAttempts)
});
