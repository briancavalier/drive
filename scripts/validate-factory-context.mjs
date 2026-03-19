import path from "node:path";
import { fileURLToPath } from "node:url";
import { setOutputs } from "./lib/actions-output.mjs";
import { getPullRequest } from "./lib/github.mjs";
import { validateTrustedFactoryContext } from "./lib/factory-trust.mjs";

export async function validateStageFactoryContext({
  env = process.env,
  githubClient = { getPullRequest }
} = {}) {
  const prNumber = Number(env.FACTORY_PR_NUMBER || 0);

  if (!(prNumber > 0)) {
    return null;
  }

  const pullRequest = await githubClient.getPullRequest(prNumber);
  const trustedContext = validateTrustedFactoryContext({
    payload: {
      repositoryFullName: env.GITHUB_REPOSITORY || ""
    },
    pullRequest,
    candidateBranch: env.FACTORY_BRANCH || "",
    candidateIssueNumber: env.FACTORY_ISSUE_NUMBER,
    candidateArtifactsPath: env.FACTORY_ARTIFACTS_PATH || ""
  });

  if (!trustedContext.trusted) {
    throw new Error(`Factory context validation failed: ${trustedContext.reason}.`);
  }

  return trustedContext;
}

export async function main(
  env = process.env,
  {
    githubClient = { getPullRequest },
    setOutputsImpl = setOutputs
  } = {}
) {
  try {
    await validateStageFactoryContext({ env, githubClient });
  } catch (error) {
    setOutputsImpl({
      failure_type: "configuration",
      failure_message: error.message
    });
    throw error;
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
