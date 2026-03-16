import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { pruneFactoryTempArtifacts } from "../scripts/lib/temp-artifacts.mjs";

function makeTempWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "factory-temp-"));
  const tempDir = path.join(workspace, ".factory", "tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  return { workspace, tempDir };
}

test("pruneFactoryTempArtifacts removes files and leaves temp directory", () => {
  const { workspace, tempDir } = makeTempWorkspace();
  const promptPath = path.join(tempDir, "prompt.md");

  fs.writeFileSync(promptPath, "temporary data", "utf8");

  const result = pruneFactoryTempArtifacts(workspace);

  assert.equal(result, true);
  assert.equal(fs.existsSync(promptPath), false);
  assert.equal(fs.existsSync(tempDir), true);
  assert.equal(fs.statSync(tempDir).isDirectory(), true);

  fs.rmSync(workspace, { recursive: true, force: true });
});

test("pruneFactoryTempArtifacts returns false when temp directory missing", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "factory-temp-"));

  const result = pruneFactoryTempArtifacts(workspace);

  assert.equal(result, false);

  fs.rmSync(workspace, { recursive: true, force: true });
});
