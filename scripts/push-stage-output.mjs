import { execFileSync } from "node:child_process";
import { setOutputs } from "./lib/actions-output.mjs";
import {
  classifyFailure,
  FAILURE_TYPES,
  isTransientFailureType,
  parseRetryLimit
} from "./lib/failure-classification.mjs";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function tryPush(branch) {
  try {
    git(["push", "origin", `HEAD:${branch}`]);
    return {
      ok: true,
      message: "",
      failureType: ""
    };
  } catch (error) {
    const message = `${error.stderr || ""}${error.stdout || ""}`.trim() || error.message;
    return {
      ok: false,
      message,
      failureType: classifyFailure(message)
    };
  }
}

function main(env = process.env) {
  const branch = `${env.FACTORY_BRANCH || ""}`.trim();

  if (!branch) {
    throw new Error("FACTORY_BRANCH is required.");
  }

  const retryLimit = parseRetryLimit(env.FACTORY_TRANSIENT_RETRY_LIMIT);
  let transientRetryAttempts = 0;
  let lastFailure = {
    message: "",
    failureType: FAILURE_TYPES.contentOrLogic
  };

  while (true) {
    const result = tryPush(branch);

    if (result.ok) {
      setOutputs({
        transient_retry_attempts: `${transientRetryAttempts}`,
        failure_type: "",
        failure_message: ""
      });
      return;
    }

    lastFailure = {
      message: result.message,
      failureType: result.failureType
    };

    if (!isTransientFailureType(result.failureType) || transientRetryAttempts >= retryLimit) {
      setOutputs({
        transient_retry_attempts: `${transientRetryAttempts}`,
        failure_type: result.failureType,
        failure_message: result.message
      });
      throw new Error(result.message);
    }

    transientRetryAttempts += 1;
    console.warn(
      `Transient push failure detected (attempt ${transientRetryAttempts}/${retryLimit}). Retrying...`
    );
    sleep(1000 * transientRetryAttempts);
  }
}

try {
  main();
} catch (error) {
  console.error(`${error.message}`);
  process.exitCode = 1;
}
