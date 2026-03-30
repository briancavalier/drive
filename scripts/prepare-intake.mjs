import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  APPROVED_ISSUE_FILE_NAME,
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
import { INTAKE_FAILURE_CODES } from "./handle-intake-failure.mjs";

const RETRY_ACTION_TEXT =
  "Reuse or clean up the existing planning branch or PR before retrying /factory start.";

export class IntakeFailure extends Error {
  constructor(message, payload) {
    super(message);
    this.name = "IntakeFailure";
    this.payload = payload;
  }
}

function isIntakeFailure(error) {
  return error instanceof IntakeFailure && error.payload && typeof error.payload === "object";
}

function readEvent() {
  return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
}

function git(args) {
  execFileSync("git", args, { stdio: "inherit" });
}

function gitRemoteBranchExists(branch) {
  try {
    execFileSync("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}

function writeIntakeFailurePayload({ failurePath, payload, writeFileImpl = fs.writeFileSync }) {
  const normalizedPath = `${failurePath || ""}`.trim();

  if (!normalizedPath) {
    return;
  }

  writeFileImpl(normalizedPath, `${JSON.stringify(payload)}\n`);
}

function buildBranchExistsFailure({ issueNumber, branch, artifactsPath }) {
  return {
    code: INTAKE_FAILURE_CODES.branchExists,
    issueNumber,
    branch,
    artifactsPath,
    nextAction: RETRY_ACTION_TEXT
  };
}

function isPushBranchCollision(error) {
  const combined = `${error?.stderr || ""}\n${error?.stdout || ""}\n${error?.message || ""}`;

  return (
    /non-fast-forward/i.test(combined) ||
    /fetch first/i.test(combined) ||
    /failed to push some refs/i.test(combined)
  );
}

const TRUSTED_PERMISSIONS = new Set(["write", "maintain", "admin"]);
const INTAKE_COMMIT_MESSAGE = "factory(intake): snapshot approved request";

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
  mkdirImpl = fs.mkdirSync,
  writeFileImpl = fs.writeFileSync,
  branchExistsImpl = gitRemoteBranchExists,
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

  async function requireTrustedPermission(login, actorDescription) {
    const normalizedLogin = `${login || ""}`.trim();
    const permission = await getCollaboratorPermissionImpl(normalizedLogin);

    if (!TRUSTED_PERMISSIONS.has(permission.permission)) {
      await applyRejectionLabel();
      throw new Error(`${actorDescription} ${normalizedLogin} does not have write access`);
    }
  }

  await requireTrustedPermission(event.sender.login, "Sender");
  await requireTrustedPermission(issue.user?.login, "Issue author");

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

  async function failForExistingBranch() {
    const failure = buildBranchExistsFailure({
      issueNumber: issue.number,
      branch,
      artifactsPath
    });

    await applyRejectionLabel();
    setOutputsImpl({
      intake_failure: JSON.stringify(failure)
    });
    writeIntakeFailurePayload({
      failurePath: env.FACTORY_INTAKE_FAILURE_PATH,
      payload: failure,
      writeFileImpl
    });
    throw new IntakeFailure(
      `Factory planning branch already exists on origin: ${branch}`,
      failure
    );
  }

  gitImpl(["config", "user.name", "github-actions[bot]"]);
  gitImpl(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  gitImpl(["fetch", "origin", defaultBranch]);

  if (branchExistsImpl(branch)) {
    await failForExistingBranch();
  }

  gitImpl(["checkout", "-B", branch, `origin/${defaultBranch}`]);
  mkdirImpl(artifactsPath, { recursive: true });
  writeFileImpl(path.join(artifactsPath, APPROVED_ISSUE_FILE_NAME), issue.body || "");
  gitImpl(["add", path.join(artifactsPath, APPROVED_ISSUE_FILE_NAME)]);
  gitImpl(["commit", "-m", INTAKE_COMMIT_MESSAGE]);

  try {
    gitImpl(["push", "origin", `HEAD:refs/heads/${branch}`]);
  } catch (error) {
    if (isPushBranchCollision(error)) {
      await failForExistingBranch();
    }

    throw error;
  }

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
    if (isIntakeFailure(error)) {
      console.error(`FACTORY_INTAKE_FAILURE=${JSON.stringify(error.payload)}`);
    }
    console.error(`${error.message}`);
    process.exitCode = 1;
  }
}
