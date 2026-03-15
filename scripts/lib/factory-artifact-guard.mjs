export function listFactoryRunArtifacts(changes) {
  return changes.filter((change) => change.path.startsWith(".factory/runs/"));
}

export function listBlockingFactoryRunArtifacts(changes) {
  return listFactoryRunArtifacts(changes).filter((change) => change.status !== "D");
}

export function shouldBlockFactoryRunArtifacts({
  eventName,
  baseRef = "",
  headRef = "",
  changes = []
}) {
  const artifacts = listBlockingFactoryRunArtifacts(changes);

  if (artifacts.length === 0) {
    return false;
  }

  if (eventName === "pull_request") {
    return baseRef === "main" && !headRef.startsWith("factory/");
  }

  return false;
}
