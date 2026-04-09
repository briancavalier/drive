import test from "node:test";
import assert from "node:assert/strict";
import { buildRepairExhaustionQuestion } from "../scripts/lib/repair-interventions.mjs";

test("buildRepairExhaustionQuestion summarizes attempt limit exhaustion", () => {
  const intervention = buildRepairExhaustionQuestion({
    action: "repair",
    repairState: {
      repairAttempts: 4,
      maxRepairAttempts: 3,
      repeatedFailureCount: 0,
      lastFailureSignature: "ci:build:failed",
      exhaustedBy: "attempt_limit"
    },
    failureDetail: "⚠️ Factory repair run failed.",
    resumeContext: {
      repairAttempts: 4,
      repeatedFailureCount: 0,
      failureSignature: "ci:build:failed",
      stageNoopAttempts: 0,
      stageSetupAttempts: 0
    },
    runInfo: {
      runId: 123,
      runUrl: "https://github.com/example/repo/actions/runs/123"
    }
  });

  assert.equal(intervention.payload.questionKind, "repair_exhaustion");
  assert.match(intervention.summary, /exhausted after 3\/3 attempts/);
  assert.equal(intervention.payload.recommendedOptionId, "retry_repair");
  assert.deepEqual(
    intervention.payload.options.map((option) => option.id),
    ["retry_repair", "reset_plan", "human_takeover"]
  );
  assert.equal(intervention.payload.resumeContext.repairAttempts, 4);
  assert.equal(intervention.payload.resumeContext.failureSignature, "ci:build:failed");
  assert.equal(intervention.runId, "123");
});

test("buildRepairExhaustionQuestion tracks repeated failure streaks", () => {
  const intervention = buildRepairExhaustionQuestion({
    action: "repair",
    repairState: {
      repairAttempts: 2,
      maxRepairAttempts: 5,
      repeatedFailureCount: 3,
      lastFailureSignature: "review:44:changes requested",
      exhaustedBy: "repeated_failure"
    },
    failureDetail: "⚠️ Review requested changes again.",
    resumeContext: {
      reviewId: 44,
      repairAttempts: 2,
      repeatedFailureCount: 3,
      failureSignature: "review:44:changes requested",
      stageNoopAttempts: 0,
      stageSetupAttempts: 0
    }
  });

  assert.match(intervention.summary, /Repeated repair failures/);
  assert.equal(intervention.payload.resumeContext.reviewId, "44");
  assert.equal(intervention.payload.resumeContext.repeatedFailureCount, 3);
});
