import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  routeIssueComment,
  routePullRequestReview,
  routeWorkflowRun
} from "./lib/event-router.mjs";
import {
  getCollaboratorPermission,
  findOpenPullRequestByHead,
  getPullRequest
} from "./lib/github.mjs";
import { setOutputs } from "./lib/actions-output.mjs";
import { isTrustedReviewTrigger } from "./lib/event-router.mjs";

export async function routeEvent({
  eventName,
  payload,
  githubClient = {
    getCollaboratorPermission,
    findOpenPullRequestByHead,
    getPullRequest
  }
}) {
  if (eventName === "pull_request") {
    return { action: "noop" };
  }

  if (eventName === "issue_comment") {
    return routeIssueComment(
      {
        ...payload,
        repositoryFullName:
          payload.repository?.full_name || process.env.GITHUB_REPOSITORY || ""
      },
      githubClient
    );
  }

  if (eventName === "pull_request_review") {
    const livePullRequest = payload.pull_request?.number
      ? await githubClient.getPullRequest(payload.pull_request.number)
      : payload.pull_request;
    const reviewerLogin = payload.review?.user?.login || "";
    let reviewerPermission = "";

    if (
      reviewerLogin &&
      !isTrustedReviewTrigger({ reviewerLogin }) &&
      githubClient.getCollaboratorPermission
    ) {
      try {
        reviewerPermission =
          (await githubClient.getCollaboratorPermission(reviewerLogin))?.permission || "";
      } catch {
        reviewerPermission = "";
      }
    }

    return routePullRequestReview({
      ...payload,
      repositoryFullName:
        payload.repository?.full_name || process.env.GITHUB_REPOSITORY || "",
      pull_request: livePullRequest || payload.pull_request,
      reviewerPermission
    });
  }

  if (eventName === "workflow_run") {
    const workflowRun = payload.workflow_run;
    const linkedPr = workflowRun.pull_requests?.[0];
    const pullRequest = linkedPr?.number
      ? await githubClient.getPullRequest(linkedPr.number)
      : workflowRun.head_branch
        ? await githubClient.findOpenPullRequestByHead(workflowRun.head_branch)
        : null;

    return routeWorkflowRun({
      workflowRun: {
        ...workflowRun,
        repository: payload.repository || workflowRun.repository || null
      },
      pullRequest
    });
  }

  return { action: "noop" };
}

export async function main(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME;
  const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const route = await routeEvent({ eventName, payload });

  setOutputs({
    action: route.action || "noop",
    pr_number: route.prNumber || "",
    issue_number: route.issueNumber || "",
    branch: route.branch || "",
    artifacts_path: route.artifactsPath || "",
    ci_run_id: route.ciRunId || "",
    review_id: route.reviewId || "",
    review_body: route.reviewBody || "",
    failure_intervention: route.intervention ? JSON.stringify(route.intervention) : "",
    repair_attempts: route.repairState?.repairAttempts || "",
    intervention_repeated_failure_count: route.repairState?.repeatedFailureCount || "",
    intervention_failure_signature: route.repairState?.lastFailureSignature || "",
    stage_noop_attempts: route.stageNoopAttempts ?? "",
    stage_setup_attempts: route.stageSetupAttempts ?? ""
  });
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  await main();
}
