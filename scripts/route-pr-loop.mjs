import fs from "node:fs";
import {
  routePullRequestLabeled,
  routePullRequestReview,
  routeWorkflowRun
} from "./lib/event-router.mjs";
import {
  findOpenPullRequestByHead,
  getPullRequest
} from "./lib/github.mjs";
import { setOutputs } from "./lib/actions-output.mjs";

const eventName = process.env.GITHUB_EVENT_NAME;
const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
let route = { action: "noop" };

if (eventName === "pull_request") {
  route = routePullRequestLabeled(payload);
} else if (eventName === "pull_request_review") {
  route = routePullRequestReview(payload);
} else if (eventName === "workflow_run") {
  const workflowRun = payload.workflow_run;
  const linkedPr = workflowRun.pull_requests?.[0];
  const pullRequest = linkedPr?.number
    ? await getPullRequest(linkedPr.number)
    : workflowRun.head_branch
      ? await findOpenPullRequestByHead(workflowRun.head_branch)
      : null;
  route = routeWorkflowRun({ workflowRun, pullRequest });
}

setOutputs({
  action: route.action || "noop",
  pr_number: route.prNumber || "",
  issue_number: route.issueNumber || "",
  branch: route.branch || "",
  artifacts_path: route.artifactsPath || "",
  ci_run_id: route.ciRunId || "",
  review_id: route.reviewId || "",
  review_body: route.reviewBody || "",
  repair_attempts: route.repairState?.repairAttempts || "",
  repeated_failure_count: route.repairState?.repeatedFailureCount || "",
  last_failure_signature: route.repairState?.lastFailureSignature || ""
});
