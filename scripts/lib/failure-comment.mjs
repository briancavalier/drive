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
    { label: "cost-summary.json", url: `${baseUrl}/cost-summary.json` },
    { label: "review.md", url: `${baseUrl}/review.md` },
    { label: "review.json", url: `${baseUrl}/review.json` }
  ];
}

function buildHeadline({ action, phase, failureType, retryAttempts }) {
  if (phase === "review_delivery") {
    return "Autonomous review artifacts were generated, but GitHub review delivery failed.";
  }

  if (failureType === FAILURE_TYPES.reviewArtifactContract) {
    return "Autonomous review artifacts were invalid and could not be published.";
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

  if (failureType === FAILURE_TYPES.stageNoop) {
    return "Factory stage completed without any repository updates.";
  }

  if (failureType === FAILURE_TYPES.stageSetup) {
    return "Factory stage cannot start until setup prerequisites are satisfied.";
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

  if (failureType === FAILURE_TYPES.reviewArtifactContract) {
    return [
      "Open the failing Factory PR Loop run and inspect `review.json` and `review.md` to pinpoint the contract violation.",
      "Update the autonomous review generator or branch content so the artifacts satisfy the schema and traceability requirements.",
      "Push the corrected artifacts and re-trigger autonomous review after CI succeeds."
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

  if (failureType === FAILURE_TYPES.stageNoop) {
    return [
      "Review the stage diagnostics to confirm the branch remained unchanged and identify the blocked work.",
      "Update the branch or plan so the next attempt will make substantive repository changes.",
      "Re-apply the factory stage when the branch is ready for another automated run."
    ];
  }

  if (failureType === FAILURE_TYPES.stageSetup) {
    return [
      "Read the failure message and diagnostics to identify which prerequisite is missing.",
      "Fix the setup issue (for example configure `FACTORY_GITHUB_TOKEN` before allowing workflow edits).",
      "Comment `/factory resume` after the missing prerequisite is in place, or `/factory reset` if the PR needs to be restored to plan-ready first."
    ];
  }

  if (action === "implement") {
    return [
      "Inspect the failing Factory PR Loop run and the current branch contents.",
      "Fix the issue manually or adjust the request so implementation can proceed cleanly.",
      "Comment `/factory implement`, `/factory resume`, or `/factory reset` once the branch and metadata are back in a good state."
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

function extractDiagnosticsSections(message) {
  const normalized = `${message || ""}`.trim();

  if (!normalized) {
    return { detail: "", diagnostics: "" };
  }

  const marker = "Stage diagnostics:";
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) {
    return { detail: normalized, diagnostics: "" };
  }

  const detail = normalized.slice(0, markerIndex).trim();
  const diagnostics = normalized.slice(markerIndex + marker.length).trim();

  return { detail, diagnostics };
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
  const { detail, diagnostics } = extractDiagnosticsSections(failureMessage);

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

  if (detail) {
    lines.push("", "```text", detail, "```");
  } else if (diagnostics) {
    lines.push("- Message: Stage diagnostics captured below.");
  } else {
    lines.push("- Message: No failure message was captured.");
  }

  if (diagnostics) {
    lines.push("", "<details>");
    lines.push("<summary>Stage diagnostics</summary>");
    lines.push("");
    lines.push("```text");
    lines.push(diagnostics);
    lines.push("```");
    lines.push("</details>");
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
