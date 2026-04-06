import test from "node:test";
import assert from "node:assert/strict";
import {
  nextRepairState,
  normalizeFailureSignature
} from "../scripts/lib/repair-state.mjs";
import { defaultFailureIntervention } from "../scripts/lib/pr-metadata.mjs";

test("normalizeFailureSignature trims and lowercases values", () => {
  assert.equal(
    normalizeFailureSignature("  CI:Build:Failed  "),
    "ci:build:failed"
  );
});

test("nextRepairState allows configured attempts before blocking", () => {
  const first = nextRepairState({ repairAttempts: 0, maxRepairAttempts: 3 }, "ci:failed");
  const second = nextRepairState(
    { ...first, maxRepairAttempts: 3 },
    "ci:failed-different"
  );
  const third = nextRepairState(
    { ...second, maxRepairAttempts: 3 },
    "ci:failed-third"
  );
  const fourth = nextRepairState(
    { ...third, maxRepairAttempts: 3 },
    "ci:failed-fourth"
  );

  assert.equal(first.blocked, false);
  assert.equal(second.blocked, false);
  assert.equal(third.blocked, false);
  assert.equal(fourth.blocked, true);
  assert.equal(fourth.exhaustedBy, "attempt_limit");
});

test("nextRepairState blocks after repeated identical failures", () => {
  const first = nextRepairState(
    {
      repairAttempts: 1,
      maxRepairAttempts: 5,
      intervention: defaultFailureIntervention({
        payload: {
          failureSignature: "ci:build:failed",
          repeatedFailureCount: 0
        }
      })
    },
    "ci:build:failed"
  );
  const second = nextRepairState(
    {
      repairAttempts: first.repairAttempts,
      maxRepairAttempts: 5,
      intervention: defaultFailureIntervention({
        payload: {
          failureSignature: first.lastFailureSignature,
          repeatedFailureCount: first.repeatedFailureCount
        }
      })
    },
    "ci:build:failed"
  );

  assert.equal(first.blocked, false);
  assert.equal(second.blocked, true);
  assert.equal(second.exhaustedBy, "repeated_failure");
});
