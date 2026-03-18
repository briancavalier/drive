import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildFailureComment } from "../scripts/lib/failure-comment.mjs";
import { readFailureAdvisory } from "../scripts/lib/failure-diagnosis.mjs";
import { FAILURE_TYPES } from "../scripts/lib/failure-classification.mjs";

test("fallback failure comment includes run link, branch, type, and raw message", () => {
  const comment = buildFailureComment({
    action: "implement",
    failureType: FAILURE_TYPES.configuration,
    failureMessage: "FACTORY_ARTIFACTS_PATH is required when FACTORY_MODE is \"review\".",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/34-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/34",
    ciRunId: "456"
  });

  assert.match(comment, /## Where to look/);
  assert.match(comment, /\[Factory PR Loop run\]\(https:\/\/github\.com\/example\/repo\/actions\/runs\/123\)/);
  assert.match(comment, /Branch: `factory\/34-sample`/);
  assert.match(comment, /Type: `configuration`/);
  assert.match(comment, /FACTORY_ARTIFACTS_PATH is required when FACTORY_MODE is "review"\./);
});

test("review-mode fallback comment includes review artifacts", () => {
  const comment = buildFailureComment({
    action: "review",
    failureType: FAILURE_TYPES.contentOrLogic,
    failureMessage: "review.md must include the canonical Traceability section derived from review.json",
    runUrl: "https://github.com/example/repo/actions/runs/999",
    branch: "factory/34-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/34",
    ciRunId: "456"
  });

  assert.match(comment, /\[review\.md\]\(https:\/\/github\.com\/example\/repo\/blob\/factory\/34-sample\/\.factory\/runs\/34\/review\.md\)/);
  assert.match(comment, /\[review\.json\]\(https:\/\/github\.com\/example\/repo\/blob\/factory\/34-sample\/\.factory\/runs\/34\/review\.json\)/);
});

test("valid Codex advisory is merged into the failure comment", () => {
  const comment = buildFailureComment({
    action: "review",
    phase: "review_delivery",
    failureType: FAILURE_TYPES.configuration,
    failureMessage: "GitHub review submission failed",
    runUrl: "https://github.com/example/repo/actions/runs/999",
    branch: "factory/34-sample",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/34",
    advisory: {
      diagnosis: "The likely cause is control-plane workflow drift after a factory self-change.",
      scope: "control_plane",
      recovery_steps: [
        "Inspect the review delivery job and compare it with the current main branch workflow definitions.",
        "Merge the control-plane fix to `main` before retrying the review path."
      ],
      confidence: "high"
    }
  });

  assert.match(comment, /## Codex diagnosis/);
  assert.match(comment, /control-plane workflow drift/);
  assert.match(comment, /Scope: `control_plane`/);
  assert.match(comment, /Confidence: `high`/);
  assert.match(comment, /## Suggested recovery/);
  assert.match(comment, /Fix the delivery or configuration issue; if it lives in factory workflows or scripts, merge the fix to `main` first\./);
  assert.match(comment, /## Codex recovery guidance/);
  assert.match(comment, /Merge the control-plane fix to `main` before retrying/);
});

test("configuration failure comments render actionable guidance inside the fenced block", () => {
  const message =
    'Resolved review stage model "gpt-unknown" is not available. Update FACTORY_REVIEW_MODEL to point at a supported model.';
  const comment = buildFailureComment({
    action: "review",
    failureType: FAILURE_TYPES.configuration,
    failureMessage: message,
    runUrl: "https://github.com/example/repo/actions/runs/123",
    branch: "factory/44-example",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/44"
  });

  assert.match(comment, /## Failure detail/);
  assert.match(comment, /```text\nResolved review stage model "gpt-unknown" is not available[\s\S]*```/);
});

test("missing or invalid advisory files are ignored cleanly", () => {
  const missing = readFailureAdvisory("/tmp/does-not-exist-advisory.json");
  assert.equal(missing, null);

  const advisoryPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "factory-failure-advisory-")),
    "advisory.json"
  );
  fs.writeFileSync(advisoryPath, "{\"diagnosis\":true}");
  const warnings = [];
  const invalid = readFailureAdvisory(advisoryPath, {
    logger: {
      warn: (message) => warnings.push(message)
    }
  });

  assert.equal(invalid, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Ignoring invalid failure advisory/);
});

test("stage_noop failure comment surfaces diagnostics and targeted recovery", () => {
  const failureMessage = [
    "Stage run completed without preparing repository changes.",
    "",
    "Stage diagnostics:",
    "branch: factory/77-noop",
    "remote head: abc123",
    "local head: abc123",
    "commits ahead of origin/factory/77-noop: 0",
    "FACTORY_GITHUB_TOKEN available: no",
    "workflow changes detected: no",
    "status sample:",
    "  - (none)"
  ].join("\n");
  const comment = buildFailureComment({
    action: "implement",
    failureType: FAILURE_TYPES.stageNoop,
    failureMessage,
    runUrl: "https://github.com/example/repo/actions/runs/501",
    branch: "factory/77-noop",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/77"
  });

  assert.match(comment, /Factory stage completed without any repository updates\./);
  assert.match(comment, /Stage diagnostics/);
  assert.match(comment, /<summary>Stage diagnostics<\/summary>/);
  assert.match(comment, /Review the stage diagnostics to confirm the branch remained unchanged/);
});

test("stage_setup failure comment highlights prerequisite guidance", () => {
  const failureMessage = [
    "Stage setup prerequisites failed: Factory stage output modifies .github/workflows/** but FACTORY_GITHUB_TOKEN is not configured.",
    "",
    "Stage diagnostics:",
    "branch: factory/78-setup",
    "remote head: def456",
    "local head: ghi789",
    "commits ahead of origin/factory/78-setup: 1",
    "FACTORY_GITHUB_TOKEN available: no",
    "workflow changes detected: yes",
    "status sample:",
    "  - M  .github/workflows/test.yml"
  ].join("\n");
  const comment = buildFailureComment({
    action: "implement",
    failureType: FAILURE_TYPES.stageSetup,
    failureMessage,
    runUrl: "https://github.com/example/repo/actions/runs/777",
    branch: "factory/78-setup",
    repositoryUrl: "https://github.com/example/repo",
    artifactsPath: ".factory/runs/78"
  });

  assert.match(comment, /Factory stage cannot start until setup prerequisites are satisfied\./);
  assert.match(comment, /Stage diagnostics/);
  assert.match(comment, /Factory stage output modifies \.github\/workflows/);
  assert.match(comment, /Fix the setup issue/);
});
