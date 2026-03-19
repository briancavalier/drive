import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isTrustedReviewTrigger,
  routePullRequestLabeled,
  routePullRequestReview,
  routeWorkflowRun,
  validateFactoryRepoTrust,
  validateTrustedFactoryContext
} from "../scripts/lib/event-router.mjs";
import { FACTORY_LABELS } from "../scripts/lib/factory-config.mjs";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";

function managedPrBody(status = "plan_ready", repairAttempts = 0, overrides = {}) {
  return renderPrBody({
    issueNumber: 12,
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    metadata: {
      issueNumber: 12,
      artifactsPath: ".factory/runs/12",
      status,
      repairAttempts,
      maxRepairAttempts: 3,
      lastFailureSignature: null,
      repeatedFailureCount: 0,
      ...overrides
    }
  });
}

function malformedManagedPrBody() {
  return [
    "# Broken",
    "",
    "<!-- factory-state {not-json} -->"
  ].join("\n");
}

function rawManagedPrBody(metadata) {
  return [
    "# Managed PR",
    "",
    `<!-- factory-state ${JSON.stringify(metadata)} -->`
  ].join("\n");
}

function managedLabels(extra = []) {
  return [{ name: FACTORY_LABELS.managed }, ...extra];
}

function sameRepoHead(overrides = {}) {
  return {
    ref: "factory/12-sample",
    repo: {
      full_name: "example/repo",
      fork: false
    },
    ...overrides
  };
}

function sameRepoBase() {
  return {
    repo: {
      full_name: "example/repo"
    }
  };
}

function basePullRequest(overrides = {}) {
  return {
    number: 33,
    body: managedPrBody(),
    labels: managedLabels(),
    head: sameRepoHead(),
    base: sameRepoBase(),
    ...overrides
  };
}

function makeOverrides(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-route-messages-"));

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }

  return dir;
}

test("validateFactoryRepoTrust accepts same-repo PR heads", () => {
  const result = validateFactoryRepoTrust(
    { repositoryFullName: "example/repo" },
    basePullRequest()
  );

  assert.equal(result.trusted, true);
  assert.equal(result.repositoryFullName, "example/repo");
});

test("validateFactoryRepoTrust rejects fork-backed PR heads", () => {
  const result = validateFactoryRepoTrust(
    { repositoryFullName: "example/repo" },
    basePullRequest({
      head: sameRepoHead({
        repo: {
          full_name: "attacker/repo",
          fork: true
        }
      })
    })
  );

  assert.equal(result.trusted, false);
  assert.match(result.reason, /fork-backed PR head/);
});

test("validateFactoryRepoTrust rejects head repo mismatches", () => {
  const result = validateFactoryRepoTrust(
    { repositoryFullName: "example/repo" },
    basePullRequest({
      head: sameRepoHead({
        repo: {
          full_name: "other/repo",
          fork: false
        }
      })
    })
  );

  assert.equal(result.trusted, false);
  assert.match(result.reason, /does not match expected repository/);
});

test("validateFactoryRepoTrust rejects missing head repo metadata", () => {
  const result = validateFactoryRepoTrust(
    { repositoryFullName: "example/repo" },
    basePullRequest({
      head: {
        ref: "factory/12-sample"
      }
    })
  );

  assert.equal(result.trusted, false);
  assert.match(result.reason, /missing pull request head repository metadata/);
});

test("validateTrustedFactoryContext accepts canonical factory identity", () => {
  const result = validateTrustedFactoryContext({
    payload: { repositoryFullName: "example/repo" },
    pullRequest: basePullRequest(),
    candidateBranch: "factory/12-sample",
    candidateIssueNumber: 12,
    candidateArtifactsPath: ".factory/runs/12"
  });

  assert.equal(result.trusted, true);
  assert.equal(result.issueNumber, 12);
  assert.equal(result.branch, "factory/12-sample");
  assert.equal(result.artifactsPath, ".factory/runs/12");
});

test("validateTrustedFactoryContext rejects malformed PR metadata", () => {
  const result = validateTrustedFactoryContext({
    payload: { repositoryFullName: "example/repo" },
    pullRequest: basePullRequest({
      body: malformedManagedPrBody()
    })
  });

  assert.equal(result.trusted, false);
  assert.match(result.reason, /missing or invalid factory PR metadata/);
});

test("validateTrustedFactoryContext rejects non-positive issue numbers", () => {
  const result = validateTrustedFactoryContext({
    payload: { repositoryFullName: "example/repo" },
    pullRequest: basePullRequest({
      body: rawManagedPrBody({
        issueNumber: 0,
        artifactsPath: ".factory/runs/12",
        status: "plan_ready"
      })
    })
  });

  assert.equal(result.trusted, false);
  assert.match(result.reason, /issueNumber must be a positive integer/);
});

test("validateTrustedFactoryContext rejects non-canonical artifacts paths", () => {
  const result = validateTrustedFactoryContext({
    payload: { repositoryFullName: "example/repo" },
    pullRequest: basePullRequest({
      body: rawManagedPrBody({
        issueNumber: 12,
        artifactsPath: ".factory/runs/999",
        status: "plan_ready"
      })
    })
  });

  assert.equal(result.trusted, false);
  assert.match(result.reason, /does not match canonical path \.factory\/runs\/12/);
});

test("routePullRequestLabeled starts implementation for approved managed PRs", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      labels: managedLabels([{ name: FACTORY_LABELS.implement }])
    })
  });

  assert.equal(result.action, "implement");
  assert.equal(result.issueNumber, 12);
  assert.equal(result.prNumber, 33);
});

test("routePullRequestLabeled ignores stale implement events when the label is no longer present", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      body: managedPrBody("implementing")
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled still parses metadata from custom PR body templates", () => {
  const overridesRoot = makeOverrides({
    "pr-body.md": [
      "# Custom",
      "",
      "{{ARTIFACTS_SECTION}}",
      "",
      "{{STATUS_SECTION}}"
    ].join("\n")
  });
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      body: renderPrBody(
        {
          issueNumber: 12,
          branch: "factory/12-sample",
          repositoryUrl: "https://github.com/example/repo",
          artifactsPath: ".factory/runs/12",
          metadata: {
            issueNumber: 12,
            artifactsPath: ".factory/runs/12",
            status: "plan_ready",
            repairAttempts: 0,
            maxRepairAttempts: 3,
            lastFailureSignature: null,
            repeatedFailureCount: 0
          }
        },
        { overridesRoot }
      ),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }])
    })
  });

  assert.equal(result.action, "implement");
  assert.equal(result.issueNumber, 12);
  assert.equal(result.prNumber, 33);
});

test("routePullRequestLabeled retries implementation for managed PRs already marked implementing", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      body: managedPrBody("implementing"),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }])
    })
  });

  assert.equal(result.action, "implement");
  assert.equal(result.issueNumber, 12);
  assert.equal(result.prNumber, 33);
});

test("routePullRequestLabeled returns noop for fork-backed PRs", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: sameRepoHead({
        repo: {
          full_name: "attacker/repo",
          fork: true
        }
      })
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled returns noop for same-branch different-repo heads", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: sameRepoHead({
        repo: {
          full_name: "other/repo",
          fork: false
        }
      })
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled returns noop when head repo metadata is missing", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      labels: managedLabels([{ name: FACTORY_LABELS.implement }]),
      head: { ref: "factory/12-sample" }
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled returns noop for malformed metadata", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      body: malformedManagedPrBody(),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }])
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestLabeled returns noop for non-canonical metadata artifacts paths", () => {
  const result = routePullRequestLabeled({
    action: "labeled",
    label: { name: FACTORY_LABELS.implement },
    repository: { full_name: "example/repo" },
    pull_request: basePullRequest({
      body: rawManagedPrBody({
        issueNumber: 12,
        artifactsPath: ".factory/runs/999",
        status: "plan_ready"
      }),
      labels: managedLabels([{ name: FACTORY_LABELS.implement }])
    })
  });

  assert.equal(result.action, "noop");
});

test("isTrustedReviewTrigger trusts maintainers and automation actors", () => {
  assert.equal(isTrustedReviewTrigger({ reviewerPermission: "write" }), true);
  assert.equal(isTrustedReviewTrigger({ reviewerPermission: "maintain" }), true);
  assert.equal(isTrustedReviewTrigger({ reviewerPermission: "admin" }), true);
  assert.equal(
    isTrustedReviewTrigger({ reviewerLogin: "github-actions[bot]" }),
    true
  );
  assert.equal(isTrustedReviewTrigger({ reviewerLogin: "app/github-actions" }), true);
  assert.equal(isTrustedReviewTrigger({ reviewerPermission: "read" }), false);
});

test("routePullRequestReview triggers repair on trusted maintainer changes requested", () => {
  const result = routePullRequestReview({
    action: "submitted",
    reviewerPermission: "write",
    repository: { full_name: "example/repo" },
    review: {
      id: 55,
      state: "changes_requested",
      body: "Please tighten the tests.",
      user: { login: "briancavalier" }
    },
    pull_request: basePullRequest({
      body: managedPrBody("implementing")
    })
  });

  assert.equal(result.action, "repair");
  assert.equal(result.reviewId, 55);
  assert.equal(result.repairState.repairAttempts, 1);
});

test("routePullRequestReview also handles reviewing status", () => {
  const result = routePullRequestReview({
    action: "submitted",
    reviewerPermission: "maintain",
    repository: { full_name: "example/repo" },
    review: { id: 56, state: "CHANGES_REQUESTED", user: { login: "maintainer" } },
    pull_request: basePullRequest({
      body: managedPrBody("reviewing")
    })
  });

  assert.equal(result.action, "repair");
  assert.equal(result.reviewId, 56);
});

test("routePullRequestReview ignores untrusted public reviewers", () => {
  const result = routePullRequestReview({
    action: "submitted",
    reviewerPermission: "read",
    repository: { full_name: "example/repo" },
    review: {
      id: 57,
      state: "changes_requested",
      body: "Force a repair run",
      user: { login: "random-user" }
    },
    pull_request: basePullRequest({
      body: managedPrBody("implementing")
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestReview trusts automation review actors", () => {
  const result = routePullRequestReview({
    action: "submitted",
    repository: { full_name: "example/repo" },
    review: {
      id: 58,
      state: "changes_requested",
      user: { login: "github-actions[bot]" }
    },
    pull_request: basePullRequest({
      body: managedPrBody("reviewing")
    })
  });

  assert.equal(result.action, "repair");
  assert.equal(result.reviewId, 58);
});

test("routePullRequestReview returns noop for repo-mismatched heads", () => {
  const result = routePullRequestReview({
    action: "submitted",
    reviewerPermission: "write",
    repository: { full_name: "example/repo" },
    review: {
      id: 59,
      state: "changes_requested",
      user: { login: "maintainer" }
    },
    pull_request: basePullRequest({
      body: managedPrBody("implementing"),
      head: sameRepoHead({
        repo: {
          full_name: "other/repo",
          fork: false
        }
      })
    })
  });

  assert.equal(result.action, "noop");
});

test("routePullRequestReview returns noop for malformed metadata", () => {
  const result = routePullRequestReview({
    action: "submitted",
    reviewerPermission: "write",
    repository: { full_name: "example/repo" },
    review: {
      id: 60,
      state: "changes_requested",
      user: { login: "maintainer" }
    },
    pull_request: basePullRequest({
      body: malformedManagedPrBody()
    })
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun routes successful CI to review stage", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "abc123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("repairing")
    })
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun resumes review after successful repair cleanup", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 178,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "resume123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("repairing", 1, {
        lastFailureType: null,
        lastReviewArtifactFailure: null,
        lastProcessedWorkflowRunId: "177"
      })
    })
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun also reruns review for managed PRs already reviewing", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 177,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "def456",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("reviewing")
    })
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun ignores CI completions for pending autonomous review commits", () => {
  const headSha = "abc123";
  const result = routeWorkflowRun({
    workflowRun: {
      id: 200,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: headSha,
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("reviewing", 0, { pendingReviewSha: headSha })
    })
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun still triggers review when CI head SHA differs from pending marker", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 201,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "def456",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("reviewing", 0, { pendingReviewSha: "abc123" })
    })
  });

  assert.equal(result.action, "review");
});

test("routeWorkflowRun ignores push-triggered CI runs for managed PR branches", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 78,
      name: "CI",
      conclusion: "success",
      event: "push",
      head_branch: "factory/12-sample",
      head_sha: "abc123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("repairing")
    })
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun ignores already-promoted green SHAs", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 79,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "abc123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("repairing", 0, { lastReadySha: "abc123" })
    })
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun blocks after exceeding repair limit", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 77,
      name: "CI",
      conclusion: "failure",
      event: "pull_request",
      head_branch: "factory/12-sample",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      body: managedPrBody("repairing", 3)
    })
  });

  assert.equal(result.action, "blocked");
});

test("routeWorkflowRun returns noop for fork-backed PRs", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 88,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/12-sample",
      head_sha: "abc123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest({
      head: sameRepoHead({
        repo: {
          full_name: "attacker/repo",
          fork: true
        }
      })
    })
  });

  assert.equal(result.action, "noop");
});

test("routeWorkflowRun returns noop when workflow branch drifts from the PR head", () => {
  const result = routeWorkflowRun({
    workflowRun: {
      id: 89,
      name: "CI",
      conclusion: "success",
      event: "pull_request",
      head_branch: "factory/other-branch",
      head_sha: "abc123",
      repository: { full_name: "example/repo" }
    },
    pullRequest: basePullRequest()
  });

  assert.equal(result.action, "noop");
});
