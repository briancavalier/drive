import fs from "node:fs";
import path from "node:path";
import { parseIssueForm } from "./lib/issue-form.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import {
  getIssue,
  getPullRequest,
  getReview,
  listReviewComments,
  listWorkflowRunJobs
} from "./lib/github.mjs";

function maybeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function truncate(text, length = 6000) {
  const value = `${text || ""}`.trim();
  return value.length > length ? `${value.slice(0, length)}\n...[truncated]` : value;
}

function section(title, body) {
  return body ? `## ${title}\n${body.trim()}\n` : "";
}

function renderIssueSections(parsedIssue) {
  return [
    section("Problem Statement", parsedIssue.problemStatement),
    section("Goals", parsedIssue.goals),
    section("Non-Goals", parsedIssue.nonGoals),
    section("Constraints", parsedIssue.constraints),
    section("Acceptance Criteria", parsedIssue.acceptanceCriteria),
    section("Risk", parsedIssue.risk),
    section("Affected Area", parsedIssue.affectedArea)
  ].join("\n");
}

function renderArtifacts(artifactsPath) {
  const files = [
    "spec.md",
    "plan.md",
    "acceptance-tests.md",
    "repair-log.md"
  ];

  return files
    .map((fileName) => {
      const fullPath = path.join(artifactsPath, fileName);
      const contents = maybeRead(fullPath);
      return [
        `### ${fileName}`,
        "",
        contents ? "```md\n" + truncate(contents) + "\n```" : "_Not present yet_",
        ""
      ].join("\n");
    })
    .join("\n");
}

function renderJobsSummary(jobsPayload) {
  const jobs = jobsPayload?.jobs || [];

  if (!jobs.length) {
    return "";
  }

  return jobs
    .map((job) => {
      const failedSteps = (job.steps || [])
        .filter((step) => step.conclusion && step.conclusion !== "success")
        .map((step) => `  - ${step.name}: ${step.conclusion}`);

      return [
        `- ${job.name}: ${job.conclusion}`,
        ...failedSteps
      ].join("\n");
    })
    .join("\n");
}

const mode = process.env.FACTORY_MODE;
const issueNumber = Number(process.env.FACTORY_ISSUE_NUMBER);
const prNumber = Number(process.env.FACTORY_PR_NUMBER);
const artifactsPath = process.env.FACTORY_ARTIFACTS_PATH;
const reviewId = process.env.FACTORY_REVIEW_ID;
const ciRunId = process.env.FACTORY_CI_RUN_ID;

const [issue, pullRequest] = await Promise.all([
  getIssue(issueNumber),
  getPullRequest(prNumber)
]);
const parsedIssue = parseIssueForm(issue.body);
const metadata = extractPrMetadata(pullRequest.body) || {};
const review =
  reviewId && mode === "repair" ? await getReview(prNumber, reviewId) : null;
const reviewComments =
  reviewId && mode === "repair"
    ? await listReviewComments(prNumber, reviewId)
    : [];
const jobsPayload =
  ciRunId && mode === "repair" ? await listWorkflowRunJobs(ciRunId) : null;

const context = [
  section(
    "Run Metadata",
    [
      `- Mode: ${mode}`,
      `- Issue: #${issueNumber}`,
      `- Pull Request: #${prNumber}`,
      `- Branch: ${pullRequest.head.ref}`,
      `- Current status: ${metadata.status || "unknown"}`
    ].join("\n")
  ),
  section("Issue Request", renderIssueSections(parsedIssue)),
  section(
    "Pull Request Summary",
    truncate(pullRequest.body.replace(/<!--\s*factory-state[\s\S]*?-->/m, "").trim())
  ),
  section("Existing Artifacts", renderArtifacts(artifactsPath)),
  review
    ? section(
        "Review Feedback",
        [
          `- Review state: ${review.state}`,
          `- Review body: ${review.body || "(empty)"}`,
          "",
          "### Review comments",
          reviewComments.length
            ? reviewComments
                .map((comment) => `- ${comment.path || "general"}: ${comment.body}`)
                .join("\n")
            : "- No line comments attached to the review"
        ].join("\n")
      )
    : "",
  jobsPayload
    ? section(
        "CI Failure Context",
        [
          `- Workflow run id: ${ciRunId}`,
          "",
          renderJobsSummary(jobsPayload)
        ].join("\n")
      )
    : ""
].filter(Boolean).join("\n");

const templatePath = path.join(".factory", "prompts", `${mode}.md`);
const template = fs.readFileSync(templatePath, "utf8");
const prompt = template
  .replaceAll("{{ISSUE_NUMBER}}", String(issueNumber))
  .replaceAll("{{ARTIFACTS_PATH}}", artifactsPath)
  .replace("{{CONTEXT}}", context);

fs.mkdirSync(path.join(".factory", "tmp"), { recursive: true });
fs.writeFileSync(path.join(".factory", "tmp", "prompt.md"), prompt);
