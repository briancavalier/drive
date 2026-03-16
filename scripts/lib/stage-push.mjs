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

export function parseChangedFiles(value) {
  if (Array.isArray(value) && value.every((entry) => entry && typeof entry === "object")) {
    return value.map(({ status = "", path = "" }) => ({
      status: `${status}`.trim(),
      path: `${path}`.trim()
    }));
  }

  return normalizeChangedFiles(value).map((entry) => {
    const [status = "", ...pathParts] = `${entry}`.split("\t");
    const path = pathParts.join("\t").trim();

    if (!path) {
      return {
        status: "",
        path: status.trim()
      };
    }

    return {
      status: status.trim(),
      path
    };
  });
}

export function hasWorkflowFileChanges(changedFiles) {
  return parseChangedFiles(changedFiles).some(({ path, status }) =>
    path.startsWith(".github/workflows/") && status !== "D"
  );
}

export function hasTempFactoryArtifactWrites(changedFiles) {
  return parseChangedFiles(changedFiles).some(({ path, status }) =>
    path.startsWith(".factory/tmp/") && status !== "D"
  );
}

export function evaluateStagePush({ changedFiles, hasFactoryToken }) {
  const files = parseChangedFiles(changedFiles);
  const workflowChanges = hasWorkflowFileChanges(files);
  const tempArtifactWrites = hasTempFactoryArtifactWrites(files);

  if (tempArtifactWrites) {
    return {
      allowed: false,
      workflowChanges,
      reason:
        "Factory stage output attempted to add or modify temporary artifacts under .factory/tmp/. " +
        "These files are workspace-only scratch space and must be cleaned up before continuing."
    };
  }

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
