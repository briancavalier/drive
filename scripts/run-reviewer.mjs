import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewerConfig, REVIEWER_CONFIG_PATH } from "./lib/reviewer-config.mjs";

function renderPrompt(template, variables) {
  let output = template;

  for (const [key, value] of Object.entries(variables)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }

  return output;
}

export function buildReviewerPrompt({
  reviewerName,
  artifactsPath,
  configPath = REVIEWER_CONFIG_PATH
}) {
  const config = loadReviewerConfig({ configPath });
  const reviewer = config.reviewers[reviewerName];

  if (!reviewer) {
    throw new Error(`Unknown reviewer "${reviewerName}"`);
  }

  const template = fs.readFileSync(path.join(".factory", "prompts", "reviewer.md"), "utf8");
  const instructions = fs.readFileSync(reviewer.instructions_path, "utf8");

  return renderPrompt(template, {
    REVIEWER_NAME: reviewerName,
    REVIEWER_PURPOSE: reviewer.purpose,
    REVIEWER_INSTRUCTIONS_PATH: reviewer.instructions_path,
    REVIEWER_INSTRUCTIONS: instructions.trim(),
    REVIEWER_OUTPUT_PATH: path.join(artifactsPath, "reviewers", `${reviewerName}.json`),
    ARTIFACTS_PATH: artifactsPath,
    CONTEXT: ""
  });
}

export function main(env = process.env) {
  const reviewerName = `${env.FACTORY_REVIEWER_NAME || ""}`.trim();
  const artifactsPath = `${env.FACTORY_ARTIFACTS_PATH || ""}`.trim();
  const configPath = `${env.FACTORY_REVIEWERS_CONFIG_PATH || REVIEWER_CONFIG_PATH}`.trim();

  if (!reviewerName || !artifactsPath) {
    throw new Error("FACTORY_REVIEWER_NAME and FACTORY_ARTIFACTS_PATH are required");
  }

  const prompt = buildReviewerPrompt({ reviewerName, artifactsPath, configPath });
  const outputPath = path.join(".factory", "tmp", `reviewer-${reviewerName}-prompt.md`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${prompt}\n`);
  console.log(outputPath);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
