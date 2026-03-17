import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFailureDiagnosisPrompt,
  main as buildFailureDiagnosisPromptMain
} from "../scripts/build-failure-diagnosis-prompt.mjs";

test("buildFailureDiagnosisPrompt includes the advisory path and failure context", () => {
  const prompt = buildFailureDiagnosisPrompt({
    advisoryPath: "/tmp/factory-failure/advisory.json",
    phase: "stage",
    action: "review",
    failureType: "configuration",
    failureMessage: "FACTORY_ARTIFACTS_PATH is required",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/34-sample",
    artifactsPath: ".factory/runs/34",
    repositoryUrl: "https://github.com/example/repo",
    ciRunId: "456"
  });

  assert.match(prompt, /\/tmp\/factory-failure\/advisory\.json/);
  assert.match(prompt, /Failure type: configuration/);
  assert.match(prompt, /Branch: factory\/34-sample/);
});

test("buildFailureDiagnosisPrompt main writes prompt and advisory outputs under RUNNER_TEMP", () => {
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-runner-temp-"));
  const githubOutputPath = path.join(runnerTemp, "github-output.txt");
  fs.writeFileSync(githubOutputPath, "");

  buildFailureDiagnosisPromptMain({
    RUNNER_TEMP: runnerTemp,
    GITHUB_OUTPUT: githubOutputPath,
    FACTORY_FAILURE_PHASE: "review_delivery",
    FACTORY_FAILED_ACTION: "review",
    FACTORY_FAILURE_TYPE: "configuration",
    FACTORY_FAILURE_MESSAGE: "GitHub review submission failed",
    FACTORY_RUN_URL: "https://github.com/example/repo/actions/runs/123",
    FACTORY_BRANCH: "factory/34-sample",
    FACTORY_ARTIFACTS_PATH: ".factory/runs/34",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "example/repo",
    FACTORY_CI_RUN_ID: "456"
  });

  const outputText = fs.readFileSync(githubOutputPath, "utf8");
  const promptPath = outputText.match(/prompt_path<<__EOF__\n([^\n]+)\n__EOF__/)[1];
  const advisoryPath = outputText.match(/advisory_path<<__EOF__\n([^\n]+)\n__EOF__/)[1];

  assert.match(promptPath, /factory-failure\/prompt\.md$/);
  assert.match(advisoryPath, /factory-failure\/advisory\.json$/);
  assert.ok(promptPath.startsWith(runnerTemp));
  assert.ok(advisoryPath.startsWith(runnerTemp));
  assert.equal(fs.existsSync(promptPath), true);
});
