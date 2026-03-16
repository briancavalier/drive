import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPushChangesFromCommits,
  parseNameStatusOutput,
  resolvePushChanges
} from "../scripts/check-factory-run-artifacts.mjs";

test("parseNameStatusOutput parses git diff name-status output", () => {
  assert.deepEqual(
    parseNameStatusOutput("A\t.factory/runs/1/spec.md\nM\tREADME.md\n"),
    [
      { status: "A", path: ".factory/runs/1/spec.md" },
      { status: "M", path: "README.md" }
    ]
  );
});

test("buildPushChangesFromCommits keeps the latest status per path", () => {
  assert.deepEqual(
    buildPushChangesFromCommits([
      {
        added: [".factory/runs/1/spec.md"],
        modified: ["README.md"],
        removed: []
      },
      {
        added: [],
        modified: [".factory/runs/1/spec.md"],
        removed: ["README.md"]
      }
    ]),
    [
      { status: "M", path: ".factory/runs/1/spec.md" },
      { status: "D", path: "README.md" }
    ]
  );
});

test("resolvePushChanges falls back to push payload commits when diff range is invalid", () => {
  const payload = {
    before: "2a4a04a0a221e136b3df3933a69d2de36a3d6168",
    after: "c216f3c6c74e94bdf9810547b3b2e0d76d55a0bf",
    commits: [
      {
        added: [".factory/runs/34/review.json"],
        modified: [".github/workflows/_factory-stage.yml"],
        removed: []
      }
    ]
  };

  const changes = resolvePushChanges(payload, () => {
    const error = new Error(
      `fatal: Invalid symmetric difference expression ${payload.before}...${payload.after}`
    );
    error.status = 128;
    error.stderr = error.message;
    throw error;
  });

  assert.deepEqual(changes, [
    { status: "A", path: ".factory/runs/34/review.json" },
    { status: "M", path: ".github/workflows/_factory-stage.yml" }
  ]);
});

test("resolvePushChanges rethrows unexpected diff failures", () => {
  const error = new Error("permission denied");
  error.status = 1;

  assert.throws(
    () =>
      resolvePushChanges(
        { before: "a", after: "b", commits: [] },
        () => {
          throw error;
        }
      ),
    /permission denied/
  );
});
