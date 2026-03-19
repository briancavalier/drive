import test from "node:test";
import assert from "node:assert/strict";
import { renderPrBody } from "../scripts/lib/pr-metadata.mjs";
import { validateStageFactoryContext } from "../scripts/validate-factory-context.mjs";

function managedPrBody(overrides = {}) {
  return renderPrBody({
    issueNumber: 12,
    branch: "factory/12-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/12",
    metadata: {
      issueNumber: 12,
      artifactsPath: ".factory/runs/12",
      status: "implementing",
      repairAttempts: 0,
      maxRepairAttempts: 3,
      lastFailureSignature: null,
      repeatedFailureCount: 0,
      ...overrides
    }
  });
}

function pullRequest(body = managedPrBody()) {
  return {
    number: 33,
    body,
    head: {
      ref: "factory/12-sample",
      repo: {
        full_name: "example/repo",
        fork: false
      }
    },
    base: {
      repo: {
        full_name: "example/repo"
      }
    }
  };
}

function env(overrides = {}) {
  return {
    GITHUB_REPOSITORY: "example/repo",
    FACTORY_PR_NUMBER: "33",
    FACTORY_ISSUE_NUMBER: "12",
    FACTORY_BRANCH: "factory/12-sample",
    FACTORY_ARTIFACTS_PATH: ".factory/runs/12",
    ...overrides
  };
}

test("validateStageFactoryContext passes when env matches the live PR", async () => {
  const result = await validateStageFactoryContext({
    env: env(),
    githubClient: {
      getPullRequest: async () => pullRequest()
    }
  });

  assert.equal(result.issueNumber, 12);
  assert.equal(result.branch, "factory/12-sample");
  assert.equal(result.artifactsPath, ".factory/runs/12");
});

test("validateStageFactoryContext fails on artifacts path mismatch", async () => {
  await assert.rejects(
    validateStageFactoryContext({
      env: env({
        FACTORY_ARTIFACTS_PATH: ".factory/runs/999"
      }),
      githubClient: {
        getPullRequest: async () => pullRequest()
      }
    }),
    /input artifacts path \.factory\/runs\/999 does not match canonical path \.factory\/runs\/12/
  );
});

test("validateStageFactoryContext fails on issue number mismatch", async () => {
  await assert.rejects(
    validateStageFactoryContext({
      env: env({
        FACTORY_ISSUE_NUMBER: "999"
      }),
      githubClient: {
        getPullRequest: async () => pullRequest()
      }
    }),
    /input issue number 999 does not match pull request metadata issue number 12/
  );
});

test("validateStageFactoryContext fails on branch mismatch", async () => {
  await assert.rejects(
    validateStageFactoryContext({
      env: env({
        FACTORY_BRANCH: "factory/other-branch"
      }),
      githubClient: {
        getPullRequest: async () => pullRequest()
      }
    }),
    /input branch factory\/other-branch does not match pull request head ref factory\/12-sample/
  );
});

test("validateStageFactoryContext fails on malformed PR metadata", async () => {
  await assert.rejects(
    validateStageFactoryContext({
      env: env(),
      githubClient: {
        getPullRequest: async () => pullRequest("<!-- factory-state {not-json} -->")
      }
    }),
    /missing or invalid factory PR metadata/
  );
});
