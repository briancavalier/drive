export function resolveStageToken({ factoryToken, githubToken }) {
  const normalizedFactoryToken = `${factoryToken || ""}`.trim();
  const normalizedGithubToken = `${githubToken || ""}`.trim();

  if (normalizedFactoryToken) {
    return {
      source: "factory",
      token: normalizedFactoryToken
    };
  }

  if (normalizedGithubToken) {
    return {
      source: "github",
      token: normalizedGithubToken
    };
  }

  throw new Error("A GitHub token is required for factory stage runs.");
}

export function normalizeChangedFiles(value) {
  if (Array.isArray(value)) {
    return value
      .map((file) => `${file || ""}`.trim())
      .filter(Boolean);
  }

  return `${value || ""}`
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

export function hasWorkflowFileChanges(changedFiles) {
  return normalizeChangedFiles(changedFiles).some((file) =>
    file.startsWith(".github/workflows/")
  );
}

export function evaluateStagePush({ changedFiles, hasFactoryToken }) {
  const files = normalizeChangedFiles(changedFiles);
  const workflowChanges = hasWorkflowFileChanges(files);

  if (workflowChanges && !hasFactoryToken) {
    return {
      allowed: false,
      workflowChanges,
      reason:
        "Factory stage output modifies .github/workflows/** but FACTORY_GITHUB_TOKEN is not configured. " +
        "Add a fine-grained PAT with workflow write access as the FACTORY_GITHUB_TOKEN repository secret " +
        "before retrying this self-modifying factory run."
    };
  }

  return {
    allowed: true,
    workflowChanges,
    reason: ""
  };
}
