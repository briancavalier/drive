import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  FACTORY_LABELS,
  issueArtifactsPath
} from "./lib/factory-config.mjs";
import { renderIntakeRejectedComment } from "./lib/github-messages.mjs";
import {
  isValidIssueForm,
  missingIssueFormFields,
  parseIssueForm,
  slugifyIssueTitle
} from "./lib/issue-form.mjs";
import {
  addLabels,
  commentOnIssue,
  getCollaboratorPermission,
  removeLabel
} from "./lib/github.mjs";
import { setOutputs } from "./lib/actions-output.mjs";

function readEvent() {
  return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
}

function git(args) {
  execFileSync("git", args, { stdio: "inherit" });
}

export async function prepareIntake({
  payload = null,
  readEventImpl = readEvent,
  gitImpl = git,
  addLabelsImpl = addLabels,
  removeLabelImpl = removeLabel,
  commentOnIssueImpl = commentOnIssue,
  getCollaboratorPermissionImpl = getCollaboratorPermission,
  renderIntakeRejectedCommentImpl = renderIntakeRejectedComment,
  setOutputsImpl = setOutputs,
  env = process.env
} = {}) {
  const event = payload ?? readEventImpl();
  const issue = event?.issue;

  if (!issue) {
    throw new Error("Expected an issue event payload");
  }

  async function applyRejectionLabel() {
    if (!issue?.number) {
      return;
    }

    await addLabelsImpl(issue.number, [FACTORY_LABELS.intakeRejected]);
  }

  async function clearRejectionLabel() {
    if (!issue?.number) {
      return;
    }

    await removeLabelImpl(issue.number, FACTORY_LABELS.intakeRejected);
  }

  const permission = await getCollaboratorPermissionImpl(event.sender.login);

  if (!["write", "maintain", "admin"].includes(permission.permission)) {
    await applyRejectionLabel();
    throw new Error(`Sender ${event.sender.login} does not have write access`);
  }

  const parsedIssue = parseIssueForm(issue.body);

  if (!isValidIssueForm(parsedIssue)) {
    await applyRejectionLabel();
    const missing = missingIssueFormFields(parsedIssue).join(", ");
    await commentOnIssueImpl(
      issue.number,
      renderIntakeRejectedCommentImpl({ missingFields: missing })
    );
    throw new Error(`Issue form is incomplete: ${missing}`);
  }

  await clearRejectionLabel();

  const defaultBranch = event.repository.default_branch;
  const slug = slugifyIssueTitle(issue.title);
  const branch = `factory/${issue.number}-${slug}`;
  const artifactsPath = issueArtifactsPath(issue.number);
  const maxRepairAttempts =
    Number(env.FACTORY_MAX_REPAIR_ATTEMPTS) || DEFAULT_MAX_REPAIR_ATTEMPTS;

  gitImpl(["config", "user.name", "github-actions[bot]"]);
  gitImpl(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  gitImpl(["fetch", "origin", defaultBranch]);
  gitImpl(["checkout", "-B", branch, `origin/${defaultBranch}`]);
  gitImpl(["push", "origin", `HEAD:refs/heads/${branch}`]);

  setOutputsImpl({
    issue_number: issue.number,
    pr_number: "0",
    branch,
    artifacts_path: artifactsPath,
    max_repair_attempts: String(maxRepairAttempts)
  });
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    await prepareIntake();
  } catch (error) {
    console.error(`${error.message}`);
    process.exitCode = 1;
  }
}
