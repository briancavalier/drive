const DURABLE_FACTORY_RUN_FILES = new Set([
  "spec.md",
  "plan.md",
  "acceptance-tests.md",
  "repair-log.md",
  "review.md",
  "review.json"
]);

export function listFactoryRunArtifacts(changes) {
  return changes.filter((change) => change.path.startsWith(".factory/runs/"));
}

export function listBlockingFactoryRunArtifacts(changes) {
  return listFactoryRunArtifacts(changes).filter((change) => change.status !== "D");
}

export function listInvalidFactoryRunArtifacts(changes) {
  return listBlockingFactoryRunArtifacts(changes).filter((change) => {
    const parts = change.path.split("/");

    return (
      parts.length !== 4 ||
      parts[0] !== ".factory" ||
      parts[1] !== "runs" ||
      !DURABLE_FACTORY_RUN_FILES.has(parts[3])
    );
  });
}

export function listBlockingFactoryTempArtifacts(changes) {
  return changes.filter(
    (change) => change.path.startsWith(".factory/tmp/") && change.status !== "D"
  );
}

export function shouldBlockFactoryRunArtifacts({
  eventName,
  baseRef = "",
  headRef = "",
  changes = []
}) {
  const artifacts = listBlockingFactoryRunArtifacts(changes);
  const invalidArtifacts = listInvalidFactoryRunArtifacts(changes);
  const tempArtifacts = listBlockingFactoryTempArtifacts(changes);

  if (invalidArtifacts.length > 0 || tempArtifacts.length > 0) {
    return true;
  }

  if (artifacts.length === 0) {
    return false;
  }

  if (eventName === "pull_request") {
    return baseRef === "main" && !headRef.startsWith("factory/");
  }

  return false;
}
