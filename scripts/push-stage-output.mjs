import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function currentHead(gitImpl = git) {
  return gitImpl(["rev-parse", "HEAD"]);
}

function fetchRemoteHead(branch, gitImpl = git) {
  gitImpl(["fetch", "origin", branch]);
  return gitImpl(["rev-parse", "FETCH_HEAD"]);
}

function remoteContainsLocalHead(localHead, remoteHead, gitImpl = git) {
  try {
    gitImpl(["merge-base", "--is-ancestor", localHead, remoteHead]);
    return true;
  } catch {
    return false;
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function tryPush(branch, gitImpl = git) {
  try {
    gitImpl(["push", "origin", `HEAD:${branch}`]);
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

export function shouldTreatPushRaceAsSuccess({
  failureType,
  localHead,
  remoteHead,
  remoteContainsLocalCommit
}) {
  if (failureType !== FAILURE_TYPES.staleStagePush || !remoteHead) {
    return false;
  }

  if (remoteHead === localHead) {
    return true;
  }

  return remoteContainsLocalCommit === true;
}

export function main(
  env = process.env,
  { gitImpl = git, setOutputsImpl = setOutputs, logger = console } = {}
) {
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
    const result = tryPush(branch, gitImpl);

    if (result.ok) {
      setOutputsImpl({
        transient_retry_attempts: `${transientRetryAttempts}`,
        failure_type: "",
        failure_message: ""
      });
      return;
    }

    if (result.failureType === FAILURE_TYPES.staleStagePush) {
      let localHead = "";
      let remoteHead = "";
      let containsLocalCommit = false;

      try {
        localHead = currentHead(gitImpl);
        remoteHead = fetchRemoteHead(branch, gitImpl);
        containsLocalCommit = remoteContainsLocalHead(localHead, remoteHead, gitImpl);
      } catch {
        remoteHead = "";
      }

      if (
        shouldTreatPushRaceAsSuccess({
          failureType: result.failureType,
          localHead,
          remoteHead,
          remoteContainsLocalCommit: containsLocalCommit
        })
      ) {
        logger.warn(
          `Remote branch ${branch} advanced during stage execution; treating rejected push as a stale duplicate.`
        );
        setOutputsImpl({
          transient_retry_attempts: `${transientRetryAttempts}`,
          failure_type: "",
          failure_message: ""
        });
        return;
      }
    }

    lastFailure = {
      message: result.message,
      failureType: result.failureType
    };

    if (!isTransientFailureType(result.failureType) || transientRetryAttempts >= retryLimit) {
      setOutputsImpl({
        transient_retry_attempts: `${transientRetryAttempts}`,
        failure_type: result.failureType,
        failure_message: result.message
      });
      throw new Error(result.message);
    }

    transientRetryAttempts += 1;
    logger.warn(
      `Transient push failure detected (attempt ${transientRetryAttempts}/${retryLimit}). Retrying...`
    );
    sleep(1000 * transientRetryAttempts);
  }
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(`${error.message}`);
    process.exitCode = 1;
  }
}
