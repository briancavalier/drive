import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FACTORY_STAGE_MODES } from "./lib/factory-config.mjs";
import { setOutputs as defaultSetOutputs } from "./lib/actions-output.mjs";

export const INTERVENTION_REQUEST_PATH = path.join(
  ".factory",
  "tmp",
  "intervention-request.json"
);

function normalizeOption(option = {}) {
  return {
    id: `${option.id || ""}`.trim(),
    label: `${option.label || ""}`.trim(),
    effect: `${option.effect || ""}`.trim(),
    instruction: `${option.instruction || ""}`.trim() || null
  };
}

function parseGitStatusLines(output = "") {
  return `${output || ""}`
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .flatMap((rawPath) => rawPath.split(" -> ").map((value) => value.trim()))
    .filter(Boolean);
}

export function validateInterventionRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Intervention request must be a JSON object.");
  }

  if (`${request.type || ""}`.trim() !== "question") {
    throw new Error('Intervention request type must be "question".');
  }

  if (`${request.questionKind || ""}`.trim() !== "ambiguity") {
    throw new Error('Intervention request questionKind must be "ambiguity".');
  }

  const summary = `${request.summary || ""}`.trim();
  const question = `${request.question || ""}`.trim();
  const recommendedOptionId = `${request.recommendedOptionId || ""}`.trim();
  const detail = `${request.detail || ""}`.trim();
  const options = Array.isArray(request.options)
    ? request.options.map(normalizeOption)
    : [];

  if (!summary) {
    throw new Error("Intervention request summary is required.");
  }

  if (!question) {
    throw new Error("Intervention request question is required.");
  }

  if (options.length < 2 || options.length > 3) {
    throw new Error("Intervention request must define 2 or 3 options.");
  }

  const optionIds = new Set();
  let resumableOptions = 0;

  for (const option of options) {
    if (!option.id || !option.label || !option.effect) {
      throw new Error("Each intervention option must include id, label, and effect.");
    }

    if (optionIds.has(option.id)) {
      throw new Error(`Duplicate intervention option id: ${option.id}`);
    }

    optionIds.add(option.id);

    if (option.effect === "resume_current_stage") {
      resumableOptions += 1;

      if (!option.instruction) {
        throw new Error(
          `Intervention option ${option.id} must include instruction for resume_current_stage.`
        );
      }

      continue;
    }

    if (option.effect !== "manual_only") {
      throw new Error(
        `Intervention option ${option.id} has unsupported effect ${option.effect}.`
      );
    }
  }

  if (resumableOptions < 1 || resumableOptions > 2) {
    throw new Error("Intervention request must define 1 or 2 resumable options.");
  }

  if (!recommendedOptionId || !optionIds.has(recommendedOptionId)) {
    throw new Error("Intervention request recommendedOptionId must match a defined option.");
  }

  return {
    type: "question",
    questionKind: "ambiguity",
    summary,
    detail,
    question,
    recommendedOptionId,
    options
  };
}

export function detectChangedRepoPaths({
  gitStatus = () =>
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
} = {}) {
  return parseGitStatusLines(gitStatus()).filter(
    (changedPath) => !changedPath.startsWith(".factory/tmp/")
  );
}

export async function detectStageInterventionRequest({
  env = process.env,
  dependencies = {}
} = {}) {
  const setOutputs = dependencies.setOutputs || defaultSetOutputs;
  const readFile = dependencies.readFile || fs.readFileSync;
  const unlinkFile = dependencies.unlinkFile || fs.unlinkSync;
  const exists =
    dependencies.exists ||
    ((filePath) => {
      try {
        fs.accessSync(filePath);
        return true;
      } catch {
        return false;
      }
    });
  const listChangedRepoPaths =
    dependencies.listChangedRepoPaths || (() => detectChangedRepoPaths());
  const mode = `${env.FACTORY_MODE || ""}`.trim();

  const hasRequestFile = exists(INTERVENTION_REQUEST_PATH);

  if (mode !== FACTORY_STAGE_MODES.implement && hasRequestFile) {
    try {
      unlinkFile(INTERVENTION_REQUEST_PATH);
    } catch {
      // Best-effort cleanup only.
    }

    setOutputs({
      intervention_requested: "false",
      intervention_payload: "",
      failure_type: "stage_setup",
      failure_message:
        "Implement-stage ambiguity requests are only supported for implement runs."
    });
    throw new Error(
      "Implement-stage ambiguity requests are only supported for implement runs."
    );
  }

  if (mode !== FACTORY_STAGE_MODES.implement) {
    setOutputs({
      intervention_requested: "false",
      intervention_payload: "",
      failure_type: "",
      failure_message: ""
    });
    return null;
  }

  if (!hasRequestFile) {
    setOutputs({
      intervention_requested: "false",
      intervention_payload: "",
      failure_type: "",
      failure_message: ""
    });
    return null;
  }

  try {
    const rawRequest = readFile(INTERVENTION_REQUEST_PATH, "utf8");
    const parsed = JSON.parse(rawRequest);
    const validated = validateInterventionRequest(parsed);
    const changedRepoPaths = listChangedRepoPaths();

    if (changedRepoPaths.length > 0) {
      throw new Error(
        `Ambiguity intervention requests must not include repo-tracked changes: ${changedRepoPaths.join(", ")}`
      );
    }

    unlinkFile(INTERVENTION_REQUEST_PATH);
    setOutputs({
      intervention_requested: "true",
      intervention_payload: JSON.stringify(validated),
      failure_type: "",
      failure_message: ""
    });

    return validated;
  } catch (error) {
    try {
      unlinkFile(INTERVENTION_REQUEST_PATH);
    } catch {
      // Best-effort cleanup only.
    }

    setOutputs({
      intervention_requested: "false",
      intervention_payload: "",
      failure_type: "stage_setup",
      failure_message: `Invalid implement-stage ambiguity request: ${error.message}`
    });
    throw error;
  }
}

export async function main(env = process.env) {
  await detectStageInterventionRequest({ env });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
