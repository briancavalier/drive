import test from "node:test";
import assert from "node:assert/strict";
import {
  main as pushStageOutputMain,
  shouldTreatPushRaceAsSuccess
} from "../scripts/push-stage-output.mjs";
import { FAILURE_TYPES } from "../scripts/lib/failure-classification.mjs";

test("shouldTreatPushRaceAsSuccess accepts remote branch advancement during the stage", () => {
  assert.equal(
    shouldTreatPushRaceAsSuccess({
      failureType: FAILURE_TYPES.staleStagePush,
      stageStartHead: "base123",
      localHead: "local456",
      remoteHead: "remote789"
    }),
    true
  );
});

test("push stage output treats a rejected stale duplicate push as success", () => {
  const calls = [];
  const outputs = {};
  const env = {
    FACTORY_BRANCH: "factory/12-sample",
    FACTORY_REFRESHED_HEAD_SHA: "base123",
    FACTORY_TRANSIENT_RETRY_LIMIT: "2"
  };

  pushStageOutputMain(env, {
    gitImpl: (args) => {
      calls.push(args.join(" "));

      if (args[0] === "push") {
        const error = new Error("push rejected");
        error.stderr = "! [rejected] HEAD -> factory/12-sample (fetch first)\n";
        error.stdout = "error: failed to push some refs to 'https://github.com/example/repo'\n";
        throw error;
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return "local456";
      }

      if (args[0] === "fetch") {
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "FETCH_HEAD") {
        return "remote789";
      }

      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    },
    setOutputsImpl: (next) => Object.assign(outputs, next),
    logger: {
      warn: () => {}
    }
  });

  assert.deepEqual(outputs, {
    transient_retry_attempts: "0",
    failure_type: "",
    failure_message: ""
  });
  assert.deepEqual(calls, [
    "push origin HEAD:factory/12-sample",
    "rev-parse HEAD",
    "fetch origin factory/12-sample",
    "rev-parse FETCH_HEAD"
  ]);
});
