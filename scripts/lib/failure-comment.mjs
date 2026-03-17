import { FAILURE_TYPES } from "./failure-classification.mjs";

function buildArtifactLinks({ repositoryUrl, branch, artifactsPath }) {
  if (!repositoryUrl || !branch || !artifactsPath) {
    return [];
  }

  const baseUrl = `${repositoryUrl}/blob/${branch}/${artifactsPath}`;

  return [
    { label: "spec.md", url: `${baseUrl}/spec.md` },
    { label: "plan.md", url: `${baseUrl}/plan.md` },
    { label: "acceptance-tests.md", url: `${baseUrl}/acceptance-tests.md` },
    { label: "repair-log.md", url: `${baseUrl}/repair-log.md` },
    { label: "review.md", url: `${baseUrl}/review.md` },
    { label: "review.json", url: `${baseUrl}/review.json` }
  ];
}

function buildHeadline({ action, phase, failureType, retryAttempts }) {
  if (phase === "review_delivery") {
    return "Autonomous review artifacts were generated, but GitHub review delivery failed.";
  }

  if (failureType === FAILURE_TYPES.staleBranchConflict) {
    return "Factory could not refresh the branch from `origin/main` before continuing.";
  }

  if (failureType === FAILURE_TYPES.transientInfra) {
    return `Factory exhausted ${retryAttempts} transient retry attempt(s) and is now blocked.`;
  }

  if (failureType === FAILURE_TYPES.configuration) {
    return "Factory encountered a configuration error and is now blocked.";
  }

  if (action === "implement") {
    return "Factory implementation failed before producing a usable branch update.";
  }

  if (action === "review") {
    return "Factory review stage failed before producing a decision.";
  }

  return "Factory repair failed before producing a usable branch update.";
}

function buildDeterministicRecoverySteps({ action, phase, failureType }) {
  if (phase === "review_delivery") {
    return [
      "Open the failing Factory PR Loop run and inspect the review-delivery failure alongside the generated review artifacts.",
      "Fix the delivery or configuration issue; if it lives in factory workflows or scripts, merge the fix to `main` first.",
      "Re-trigger autonomous review after the branch has a fresh successful PR CI run."
    ];
  }

  if (failureType === FAILURE_TYPES.staleBranchConflict) {
    return [
      "Rebase or merge `origin/main` into the factory branch and resolve the conflict.",
      "Push the updated branch.",
      "Re-run the factory stage after the branch is conflict-free."
    ];
  }

  if (failureType === FAILURE_TYPES.transientInfra) {
    return [
      "Inspect the failing Factory PR Loop run for the infrastructure error details.",
      "If the branch state is otherwise good, reset or retry the PR after the infrastructure issue clears."
    ];
  }

  if (failureType === FAILURE_TYPES.configuration) {
    return [
      "Inspect the failure message and the failing Factory PR Loop run to find the missing configuration or workflow/script contract drift.",
      "Fix the configuration or workflow/script wiring; if the issue is in factory control-plane code, merge the fix to `main` before retrying.",
      "Re-trigger the factory flow after the fix lands."
    ];
  }

  if (action === "implement") {
    return [
      "Inspect the failing Factory PR Loop run and the current branch contents.",
      "Fix the issue manually or adjust the request so implementation can proceed cleanly.",
      "Re-apply `factory:implement` after the branch and plan are back in a good state."
    ];
  }

  if (action === "review") {
    return [
      "Inspect the failing review-stage run and the durable review artifacts on the branch.",
      "Fix the branch or control-plane issue that prevented a valid autonomous review decision.",
      "Re-trigger review after the branch has a fresh successful PR CI run."
    ];
  }

  return [
    "Inspect the failing Factory PR Loop run and the current PR state.",
    "Fix the issue manually or adjust the repair path so the next attempt has valid inputs.",
    "Retry once the branch and control plane are back in a consistent state."
  ];
}

function formatArtifactLinks(artifacts) {
  if (artifacts.length === 0) {
    return "";
  }

  return artifacts.map((artifact) => `[${artifact.label}](${artifact.url})`).join(", ");
}

export function buildFailureComment({
  action,
  phase = "stage",
  failureType,
  retryAttempts = 0,
  failureMessage,
  runUrl,
  branch,
  repositoryUrl,
  artifactsPath,
  ciRunId,
  advisory
}) {
  const lines = [`⚠️ ${buildHeadline({ action, phase, failureType, retryAttempts })}`, ""];
  const artifacts = buildArtifactLinks({ repositoryUrl, branch, artifactsPath });
  const ciRunUrl = repositoryUrl && ciRunId ? `${repositoryUrl}/actions/runs/${ciRunId}` : "";
  const recoverySteps = buildDeterministicRecoverySteps({ action, phase, failureType });

  lines.push("## Where to look");

  if (runUrl) {
    lines.push(`- Factory run: [Factory PR Loop run](${runUrl})`);
  }

  if (ciRunUrl) {
    lines.push(`- Source CI run: [CI run ${ciRunId}](${ciRunUrl})`);
  }

  if (branch) {
    lines.push(`- Branch: \`${branch}\``);
  }

  if (artifacts.length > 0) {
    lines.push(`- Run artifacts: ${formatArtifactLinks(artifacts)}`);
  }

  lines.push("", "## Failure detail", `- Type: \`${failureType}\``);

  if (`${failureMessage || ""}`.trim()) {
    lines.push("", "```text", `${failureMessage}`.trim(), "```");
  } else {
    lines.push("- Message: No failure message was captured.");
  }

  if (advisory) {
    lines.push(
      "",
      "## Codex diagnosis",
      advisory.diagnosis,
      "",
      `- Scope: \`${advisory.scope}\``,
      `- Confidence: \`${advisory.confidence}\``
    );
  }

  lines.push("", "## Suggested recovery", "");

  for (const step of recoverySteps) {
    lines.push(`1. ${step}`);
  }

  if (advisory?.recovery_steps?.length) {
    lines.push("", "## Codex recovery guidance", "");

    for (const step of advisory.recovery_steps) {
      lines.push(`1. ${step}`);
    }
  }

  return lines.join("\n").trim();
}
