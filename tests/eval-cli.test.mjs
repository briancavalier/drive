import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as evalMain } from "../scripts/eval.mjs";

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, ".."));

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("eval CLI runs against the checked-in corpus with a task filter", () => {
  const tempOutput = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cli-"));
  const outputDir = path.join(tempOutput, "manual-smoke");
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    const result = evalMain(
      [
        "--task",
        "factory-run-55-cost-telemetry-calibration",
        "--output",
        outputDir
      ],
      REPO_ROOT
    );

    assert.equal(result.summary.task_count, 1);
    assert.equal(
      fileExists(path.join(outputDir, "tasks", "factory-run-55-cost-telemetry-calibration.json")),
      true
    );
    assert.match(writes.join(""), /Wrote eval results to/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("eval CLI rejects invalid task IDs", () => {
  assert.throws(
    () => evalMain(["--task", "does-not-exist"], REPO_ROOT),
    /Unknown eval task IDs/
  );
});

test("eval CLI propagates invalid corpus failures", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cli-invalid-"));
  fs.mkdirSync(path.join(repoRoot, "eval", "corpus"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "eval", "corpus", "index.json"), "{}\n");
  fs.writeFileSync(
    path.join(repoRoot, "eval", "corpus", "holdout-manifest.json"),
    JSON.stringify({ schema_version: 1, holdout_revision: 1, entries: [] })
  );
  fs.mkdirSync(path.join(repoRoot, "eval", "corpus", "tasks"), { recursive: true });

  assert.throws(() => evalMain([], repoRoot), /index\.json schema_version must be 1/);
});
