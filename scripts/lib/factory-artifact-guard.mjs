export function listFactoryRunArtifacts(changedFiles) {
  return changedFiles.filter((file) => file.startsWith(".factory/runs/"));
}

export function shouldBlockFactoryRunArtifacts({
  eventName,
  baseRef = "",
  headRef = "",
  changedFiles = []
}) {
  const artifacts = listFactoryRunArtifacts(changedFiles);

  if (artifacts.length === 0) {
    return false;
  }

  if (eventName === "pull_request") {
    return baseRef === "main" && !headRef.startsWith("factory/");
  }

  return false;
}
