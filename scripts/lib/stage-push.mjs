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

const ENABLED_FLAG_PATTERN = /^(1|true|yes|on)$/i;
const PROTECTED_PATH_RULES = Object.freeze([
  {
    kind: "scripts",
    prefix: "scripts/",
    label: "scripts/**"
  },
  {
    kind: "prompts",
    prefix: ".factory/prompts/",
    label: ".factory/prompts/**"
  },
  {
    kind: "reviewMethods",
    prefix: ".factory/review-methods/",
    label: ".factory/review-methods/**"
  },
  {
    kind: "messages",
    prefix: ".factory/messages/",
    label: ".factory/messages/**"
  },
  {
    kind: "workflows",
    prefix: ".github/workflows/",
    label: ".github/workflows/**"
  }
]);

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
    path.startsWith(".github/workflows/")
  );
}

export function hasTempFactoryArtifactWrites(changedFiles) {
  return parseChangedFiles(changedFiles).some(({ path, status }) =>
    path.startsWith(".factory/tmp/") && status !== "D"
  );
}

export function isSelfModifyEnabled(value) {
  return ENABLED_FLAG_PATTERN.test(`${value || ""}`.trim());
}

export function getProtectedPathChanges(changedFiles) {
  const files = parseChangedFiles(changedFiles);
  const matches = [];

  for (const rule of PROTECTED_PATH_RULES) {
    const matchedPaths = files
      .filter(({ path }) => path.startsWith(rule.prefix))
      .map(({ path }) => path);

    if (matchedPaths.length > 0) {
      matches.push({
        kind: rule.kind,
        label: rule.label,
        paths: matchedPaths
      });
    }
  }

  return matches;
}

export function evaluateStagePush({
  changedFiles,
  hasFactoryToken,
  selfModifyEnabled = false,
  hasSelfModifyLabel = false
}) {
  const files = parseChangedFiles(changedFiles);
  const workflowChanges = hasWorkflowFileChanges(files);
  const tempArtifactWrites = hasTempFactoryArtifactWrites(files);
  const protectedPathChanges = getProtectedPathChanges(files);
  const protectedPathLabels = protectedPathChanges.map(({ label }) => label).join(", ");

  if (tempArtifactWrites) {
    return {
      allowed: false,
      workflowChanges,
      protectedPathChanges,
      reason:
        "Factory stage output attempted to add or modify temporary artifacts under .factory/tmp/. " +
        "These files are workspace-only scratch space and must be cleaned up before continuing."
    };
  }

  if (protectedPathChanges.length > 0 && !selfModifyEnabled) {
    return {
      allowed: false,
      workflowChanges,
      protectedPathChanges,
      reason:
        `Factory stage output touches protected control-plane paths (${protectedPathLabels}) ` +
        "but FACTORY_ENABLE_SELF_MODIFY is not enabled. Turn on that repository variable " +
        "before retrying this self-modifying factory run."
    };
  }

  if (protectedPathChanges.length > 0 && !hasSelfModifyLabel) {
    return {
      allowed: false,
      workflowChanges,
      protectedPathChanges,
      reason:
        `Factory stage output touches protected control-plane paths (${protectedPathLabels}) ` +
        "but the pull request is missing the factory:self-modify label. Add that label " +
        "before retrying this self-modifying factory run."
    };
  }

  if (protectedPathChanges.length > 0 && !hasFactoryToken) {
    return {
      allowed: false,
      workflowChanges,
      protectedPathChanges,
      reason:
        `Factory stage output touches protected control-plane paths (${protectedPathLabels}) ` +
        "but FACTORY_GITHUB_TOKEN is not configured. Add a fine-grained PAT as the " +
        "FACTORY_GITHUB_TOKEN repository secret before retrying this self-modifying factory run."
    };
  }

  return {
    allowed: true,
    workflowChanges,
    protectedPathChanges,
    reason: ""
  };
}
