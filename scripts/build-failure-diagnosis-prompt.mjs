import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalize(value, fallback = "") {
  return `${value || ""}`.trim() || fallback;
}

function compact(value) {
  return normalize(value).replace(/\s+/g, " ");
}

function writeOutputs(outputPath, outputs) {
  if (!outputPath) {
    return;
  }

  let payload = "";

  for (const [key, value] of Object.entries(outputs)) {
    payload += `${key}<<__EOF__\n${value ?? ""}\n__EOF__\n`;
  }

  fs.appendFileSync(outputPath, payload);
}

export function buildFailureDiagnosisPrompt({
  advisoryPath,
  phase,
  action,
  failureType,
  failureMessage,
  runUrl,
  branch,
  artifactsPath,
  repositoryUrl,
  ciRunId
}) {
  const contextLines = [
    `- Phase: ${phase}`,
    `- Action: ${action}`,
    `- Failure type: ${failureType}`,
    `- Factory run URL: ${runUrl || "(missing)"}`,
    `- Repository URL: ${repositoryUrl || "(missing)"}`,
    `- Branch: ${branch || "(missing)"}`,
    `- Artifacts path: ${artifactsPath || "(missing)"}`,
    `- Source CI run ID: ${ciRunId || "(missing)"}`,
    `- Failure message: ${compact(failureMessage) || "(missing)"}`
  ];

  return [
    "You are diagnosing a failed run of the GitHub-native autonomous factory in the current repository.",
    "This is an advisory-only task. Do not decide labels, statuses, retries, or any workflow control flow.",
    "",
    "Inspect relevant local files and artifacts if needed, then write exactly one JSON object to this file:",
    advisoryPath,
    "",
    "Required schema:",
    '{',
    '  "diagnosis": "short paragraph",',
    '  "scope": "control_plane | pr_branch | external | unclear",',
    '  "recovery_steps": ["step 1", "step 2"],',
    '  "confidence": "low | medium | high"',
    '}',
    "",
    "Rules:",
    "- Do not include URLs in the JSON output.",
    "- Do not recommend label or status changes directly.",
    "- Keep recovery_steps concise and operator-facing.",
    "- If evidence is weak, use scope `unclear` and confidence `low`.",
    "- Write only the JSON object to the target file.",
    "- Do not modify any tracked repository files.",
    "",
    "Failure context:",
    ...contextLines
  ].join("\n");
}

export function main(env = process.env) {
  const tempRoot = env.RUNNER_TEMP
    ? path.join(env.RUNNER_TEMP, "factory-failure")
    : path.join(os.tmpdir(), "factory-failure");
  const promptPath = path.join(tempRoot, "prompt.md");
  const advisoryPath = path.join(tempRoot, "advisory.json");
  const prompt = buildFailureDiagnosisPrompt({
    advisoryPath,
    phase: normalize(env.FACTORY_FAILURE_PHASE, "stage"),
    action: normalize(env.FACTORY_FAILED_ACTION, "review"),
    failureType: normalize(env.FACTORY_FAILURE_TYPE, "content_or_logic"),
    failureMessage: env.FACTORY_FAILURE_MESSAGE || "",
    runUrl: env.FACTORY_RUN_URL || "",
    branch: env.FACTORY_BRANCH || "",
    artifactsPath: env.FACTORY_ARTIFACTS_PATH || "",
    repositoryUrl:
      env.FACTORY_REPOSITORY_URL ||
      (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
        : ""),
    ciRunId: env.FACTORY_CI_RUN_ID || ""
  });

  fs.mkdirSync(tempRoot, { recursive: true });
  fs.rmSync(advisoryPath, { force: true });
  fs.writeFileSync(promptPath, prompt);
  writeOutputs(env.GITHUB_OUTPUT, {
    prompt_path: promptPath,
    advisory_path: advisoryPath
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
