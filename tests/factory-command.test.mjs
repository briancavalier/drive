import test from "node:test";
import assert from "node:assert/strict";
import {
  getFactoryCommentContext,
  parseFactorySlashCommand
} from "../scripts/lib/factory-command.mjs";

test("parseFactorySlashCommand accepts normalized supported commands", () => {
  assert.deepEqual(parseFactorySlashCommand(" /factory start ", "issue"), {
    command: "start",
    literal: "/factory start"
  });
  assert.deepEqual(parseFactorySlashCommand("/FACTORY    IMPLEMENT", "pull_request"), {
    command: "implement",
    literal: "/factory implement"
  });
  assert.deepEqual(
    parseFactorySlashCommand(
      "/factory answer int_q_123 approve_once\n\nApproved after applying label.",
      "pull_request"
    ),
    {
      command: "answer",
      literal: "/factory answer",
      interventionId: "int_q_123",
      optionId: "approve_once",
      note: "Approved after applying label."
    }
  );
});

test("parseFactorySlashCommand rejects unsupported commands and extra words", () => {
  assert.equal(parseFactorySlashCommand("/factory implement now", "pull_request"), null);
  assert.equal(parseFactorySlashCommand("/factory dance", "pull_request"), null);
  assert.equal(parseFactorySlashCommand("/factory answer only-two-parts", "pull_request"), null);
});

test("getFactoryCommentContext distinguishes issue comments from PR comments", () => {
  assert.equal(getFactoryCommentContext({ issue: {} }), "issue");
  assert.equal(
    getFactoryCommentContext({ issue: { pull_request: { url: "https://example.test/pr/1" } } }),
    "pull_request"
  );
});
