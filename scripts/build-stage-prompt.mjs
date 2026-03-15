import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIssueForm } from "./lib/issue-form.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import {
  getIssue,
  getPullRequest,
  getReview,
  listReviewComments,
  listWorkflowRunJobs
} from "./lib/github.mjs";

export const DEFAULT_PROMPT_BUDGETS = Object.freeze({
  plan: 20000,
  implement: 12000,
  repair: 14000,
  hardMax: 24000
});

const ARTIFACT_FILES = [
  "spec.md",
  "plan.md",
  "acceptance-tests.md",
  "repair-log.md"
];

const ISSUE_SECTION_CONFIG = [
  { key: "problemStatement", title: "Problem Statement", priority: 6 },
  { key: "goals", title: "Goals", priority: 5 },
  { key: "acceptanceCriteria", title: "Acceptance Criteria", priority: 4 },
  { key: "constraints", title: "Constraints", priority: 3 },
  { key: "risk", title: "Risk", priority: 2 },
  { key: "affectedArea", title: "Affected Area", priority: 1 },
  { key: "nonGoals", title: "Non-Goals", priority: 0 }
];

const STAGE_SECTION_CONFIG = {
  plan: {
    order: ["run-metadata", "problem", "goals", "acceptance", "constraints", "risk", "affected-area", "non-goals", "artifacts"],
    preferredChars: {
      "run-metadata": 500,
      problem: 3500,
      goals: 2500,
      acceptance: 2500,
      constraints: 1800,
      risk: 1200,
      "affected-area": 400,
      "non-goals": 1000,
      artifacts: 1500
    },
    minChars: {
      "run-metadata": 200,
      problem: 500,
      goals: 300,
      acceptance: 300,
      constraints: 200,
      risk: 120,
      "affected-area": 0,
      "non-goals": 0,
      artifacts: 0
    },
    dropPriority: ["non-goals", "affected-area", "risk", "constraints", "artifacts", "acceptance", "goals", "problem"]
  },
  implement: {
    order: ["run-metadata", "issue-synopsis", "artifact-index"],
    preferredChars: {
      "run-metadata": 500,
      "issue-synopsis": 1200,
      "artifact-index": 5000
    },
    minChars: {
      "run-metadata": 200,
      "issue-synopsis": 200,
      "artifact-index": 800
    },
    dropPriority: ["issue-synopsis", "artifact-index"]
  },
  repair: {
    order: ["run-metadata", "failure-context", "artifact-index", "repair-log-tail", "issue-synopsis"],
    preferredChars: {
      "run-metadata": 500,
      "failure-context": 5000,
      "artifact-index": 3500,
      "repair-log-tail": 1200,
      "issue-synopsis": 800
    },
    minChars: {
      "run-metadata": 200,
      "failure-context": 800,
      "artifact-index": 600,
      "repair-log-tail": 0,
      "issue-synopsis": 120
    },
    dropPriority: ["issue-synopsis", "repair-log-tail", "artifact-index", "failure-context"]
  }
};

function positiveInt(input, fallback) {
  const parsed = Number(input);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolvePromptBudgets(env = process.env) {
  const hardMax = positiveInt(
    env.FACTORY_PROMPT_HARD_MAX_CHARS,
    DEFAULT_PROMPT_BUDGETS.hardMax
  );

  return {
    hardMax,
    plan: Math.min(
      positiveInt(env.FACTORY_PLAN_PROMPT_MAX_CHARS, DEFAULT_PROMPT_BUDGETS.plan),
      hardMax
    ),
    implement: Math.min(
      positiveInt(
        env.FACTORY_IMPLEMENT_PROMPT_MAX_CHARS,
        DEFAULT_PROMPT_BUDGETS.implement
      ),
      hardMax
    ),
    repair: Math.min(
      positiveInt(env.FACTORY_REPAIR_PROMPT_MAX_CHARS, DEFAULT_PROMPT_BUDGETS.repair),
      hardMax
    )
  };
}

function maybeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function truncateText(text, maxChars) {
  const value = `${text || ""}`.trim();

  if (!value || maxChars <= 0) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  if (maxChars <= 16) {
    return value.slice(0, maxChars);
  }

  return `${value.slice(0, maxChars - 16).trimEnd()}\n...[truncated]`;
}

function tailText(text, maxChars) {
  const value = `${text || ""}`.trim();

  if (!value || value.length <= maxChars) {
    return value;
  }

  if (maxChars <= 18) {
    return value.slice(-maxChars);
  }

  return `...[tail]\n${value.slice(-(maxChars - 10)).trimStart()}`;
}

function compactLines(text, maxLines = 4, maxChars = 400) {
  const lines = `${text || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return truncateText(lines.join("\n"), maxChars);
}

function firstParagraph(text, maxChars = 260) {
  const paragraphs = `${text || ""}`
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return truncateText(paragraphs[0] || "", maxChars);
}

function extractMarkdownHeadings(text, maxHeadings = 8) {
  const headings = [];

  for (const line of `${text || ""}`.split("\n")) {
    const match = line.match(/^#{1,6}\s+(.*)$/);

    if (!match) {
      continue;
    }

    headings.push(match[1].trim());

    if (headings.length >= maxHeadings) {
      break;
    }
  }

  return headings;
}

function renderSection(title, body) {
  return body ? `## ${title}\n${body.trim()}\n` : "";
}

function serializeSection(section) {
  return renderSection(section.title, section.body);
}

function describeIssueSynopsis(parsedIssue) {
  const parts = [];

  if (parsedIssue.problemStatement) {
    parts.push(`Problem: ${firstParagraph(parsedIssue.problemStatement, 260)}`);
  }

  if (parsedIssue.goals) {
    parts.push(`Goals:\n${compactLines(parsedIssue.goals, 4, 320)}`);
  }

  if (parsedIssue.acceptanceCriteria) {
    parts.push(
      `Acceptance:\n${compactLines(parsedIssue.acceptanceCriteria, 4, 320)}`
    );
  }

  if (parsedIssue.constraints) {
    parts.push(`Constraints:\n${compactLines(parsedIssue.constraints, 3, 220)}`);
  }

  return parts.join("\n\n");
}

function summarizeArtifact(fileName, artifactsPath) {
  const filePath = path.join(artifactsPath, fileName);
  const contents = maybeRead(filePath);
  const headings = extractMarkdownHeadings(contents);
  const summary = headings.length
    ? `headings: ${headings.join(" | ")}`
    : firstParagraph(contents, 220);

  return {
    id: fileName,
    fileName,
    filePath,
    exists: Boolean(contents),
    headings,
    summary
  };
}

function renderPlanArtifactsSection(artifactsPath) {
  const lines = ARTIFACT_FILES.map((fileName) => {
    const contents = maybeRead(path.join(artifactsPath, fileName));
    return `- ${fileName}: ${contents ? "present" : "missing"}`;
  });

  const repairLog = maybeRead(path.join(artifactsPath, "repair-log.md"));

  if (repairLog) {
    lines.push("");
    lines.push("repair-log tail:");
    lines.push(tailText(repairLog, 700));
  }

  return lines.join("\n").trim();
}

function renderArtifactIndex(artifactsPath) {
  return ARTIFACT_FILES
    .filter((fileName) => fileName !== "repair-log.md")
    .map((fileName) => {
      const artifact = summarizeArtifact(fileName, artifactsPath);
      const parts = [
        `- ${artifact.fileName}: ${artifact.exists ? "present" : "missing"} at \`${artifact.filePath}\``
      ];

      if (artifact.exists && artifact.summary) {
        parts.push(`  ${artifact.summary}`);
      }

      return parts.join("\n");
    })
    .join("\n");
}

function renderRunMetadata({
  mode,
  issueNumber,
  prNumber,
  branch,
  metadata
}) {
  return [
    `- Mode: ${mode}`,
    `- Issue: #${issueNumber}`,
    `- Pull Request: ${prNumber > 0 ? `#${prNumber}` : "not created yet"}`,
    `- Branch: ${branch}`,
    `- Current status: ${metadata.status || "unknown"}`
  ].join("\n");
}

function renderFailureContext({
  mode,
  ciRunId,
  jobsPayload,
  review,
  reviewComments
}) {
  if (mode !== "repair") {
    return "";
  }

  if (jobsPayload?.jobs?.length) {
    const lines = [`- Workflow run id: ${ciRunId}`];
    const failedJobs = jobsPayload.jobs.filter(
      (job) => job.conclusion && job.conclusion !== "success"
    );

    for (const job of failedJobs) {
      lines.push(`- ${job.name}: ${job.conclusion}`);

      for (const step of (job.steps || []).filter(
        (item) => item.conclusion && item.conclusion !== "success"
      )) {
        lines.push(`  - ${step.name}: ${step.conclusion}`);
      }
    }

    return lines.join("\n");
  }

  if (review) {
    const lines = [
      `- Review state: ${review.state}`,
      `- Review body: ${truncateText(review.body || "(empty)", 1800)}`
    ];

    if (reviewComments.length) {
      lines.push("");
      lines.push("Review comments:");

      for (const comment of reviewComments.slice(0, 8)) {
        lines.push(
          `- ${comment.path || "general"}: ${truncateText(comment.body || "", 220)}`
        );
      }
    }

    return lines.join("\n");
  }

  return "";
}

function buildSection(id, title, body) {
  return {
    id,
    title,
    body: `${body || ""}`.trim(),
    originalChars: `${body || ""}`.trim().length,
    included: Boolean(`${body || ""}`.trim()),
    truncated: false,
    dropped: false
  };
}

function applyPreferredCaps(sections, modeConfig) {
  for (const section of sections) {
    const preferred = modeConfig.preferredChars[section.id];

    if (!preferred || !section.body) {
      continue;
    }

    if (section.body.length > preferred) {
      section.body = truncateText(section.body, preferred);
      section.truncated = true;
    }
  }
}

function fitSectionsToBudget(sections, modeConfig, budget) {
  const byId = new Map(sections.map((section) => [section.id, section]));

  function totalChars() {
    return sections
      .filter((section) => section.included && section.body)
      .map((section) => serializeSection(section).length)
      .reduce((sum, value) => sum + value, 0);
  }

  let total = totalChars();

  for (const id of modeConfig.dropPriority) {
    if (total <= budget) {
      break;
    }

    const section = byId.get(id);

    if (!section || !section.included || !section.body) {
      continue;
    }

    const minChars = modeConfig.minChars[id] ?? 0;

    if (section.body.length > minChars) {
      const reductionNeeded = total - budget;
      const nextLength = Math.max(minChars, section.body.length - reductionNeeded);

      if (nextLength < section.body.length) {
        section.body = truncateText(section.body, nextLength);
        section.truncated = true;
        total = totalChars();
      }
    }

    if (total <= budget) {
      break;
    }

    if (minChars === 0 && section.body) {
      section.body = "";
      section.included = false;
      section.dropped = true;
      total = totalChars();
    }
  }

  return total;
}

function buildSectionsForMode({
  mode,
  issueNumber,
  prNumber,
  branch,
  artifactsPath,
  parsedIssue,
  metadata,
  review,
  reviewComments,
  jobsPayload,
  ciRunId
}) {
  const sections = [];

  sections.push(
    buildSection(
      "run-metadata",
      "Run Metadata",
      renderRunMetadata({ mode, issueNumber, prNumber, branch, metadata })
    )
  );

  if (mode === "plan") {
    const byKey = Object.fromEntries(
      ISSUE_SECTION_CONFIG.map((entry) => [entry.key, entry])
    );

    sections.push(
      buildSection(
        "problem",
        byKey.problemStatement.title,
        parsedIssue.problemStatement
      ),
      buildSection("goals", byKey.goals.title, parsedIssue.goals),
      buildSection(
        "acceptance",
        byKey.acceptanceCriteria.title,
        parsedIssue.acceptanceCriteria
      ),
      buildSection(
        "constraints",
        byKey.constraints.title,
        parsedIssue.constraints
      ),
      buildSection("risk", byKey.risk.title, parsedIssue.risk),
      buildSection(
        "affected-area",
        byKey.affectedArea.title,
        parsedIssue.affectedArea
      ),
      buildSection("non-goals", byKey.nonGoals.title, parsedIssue.nonGoals),
      buildSection(
        "artifacts",
        "Artifact Status",
        renderPlanArtifactsSection(artifactsPath)
      )
    );
  }

  if (mode === "implement") {
    sections.push(
      buildSection(
        "issue-synopsis",
        "Issue Synopsis",
        describeIssueSynopsis(parsedIssue)
      ),
      buildSection(
        "artifact-index",
        "Artifact Index",
        renderArtifactIndex(artifactsPath)
      )
    );
  }

  if (mode === "repair") {
    const repairLog = maybeRead(path.join(artifactsPath, "repair-log.md"));

    sections.push(
      buildSection(
        "failure-context",
        "Failure Context",
        renderFailureContext({
          mode,
          ciRunId,
          jobsPayload,
          review,
          reviewComments
        })
      ),
      buildSection(
        "artifact-index",
        "Artifact Index",
        renderArtifactIndex(artifactsPath)
      ),
      buildSection(
        "repair-log-tail",
        "Repair Log Tail",
        tailText(repairLog, 1000)
      ),
      buildSection(
        "issue-synopsis",
        "Issue Synopsis",
        describeIssueSynopsis(parsedIssue)
      )
    );
  }

  return sections;
}

export function buildStagePrompt({
  mode,
  issueNumber,
  prNumber = 0,
  branch,
  artifactsPath,
  issueBody,
  pullRequestBody = "",
  budgets = DEFAULT_PROMPT_BUDGETS,
  review = null,
  reviewComments = [],
  jobsPayload = null,
  ciRunId = "",
  templateText
}) {
  const parsedIssue = parseIssueForm(issueBody);
  const metadata = pullRequestBody ? extractPrMetadata(pullRequestBody) || {} : {};
  const modeConfig = STAGE_SECTION_CONFIG[mode];

  if (!modeConfig) {
    throw new Error(`Unsupported FACTORY_MODE: ${mode}`);
  }

  const promptWithoutContext = templateText
    .replaceAll("{{ISSUE_NUMBER}}", String(issueNumber))
    .replaceAll("{{ARTIFACTS_PATH}}", artifactsPath)
    .replace("{{CONTEXT}}", "");
  const contextBudget = Math.max(1000, budgets[mode] - promptWithoutContext.length);
  const sections = buildSectionsForMode({
    mode,
    issueNumber,
    prNumber,
    branch,
    artifactsPath,
    parsedIssue,
    metadata,
    review,
    reviewComments,
    jobsPayload,
    ciRunId
  }).filter((section) => section.included && section.body);

  applyPreferredCaps(sections, modeConfig);
  fitSectionsToBudget(sections, modeConfig, contextBudget);

  function renderPrompt() {
    const orderedSections = modeConfig.order
      .map((id) => sections.find((section) => section.id === id))
      .filter(Boolean)
      .filter((section) => section.included && section.body);
    const context = orderedSections
      .map((section) => serializeSection(section))
      .join("\n");
    const prompt = templateText
      .replaceAll("{{ISSUE_NUMBER}}", String(issueNumber))
      .replaceAll("{{ARTIFACTS_PATH}}", artifactsPath)
      .replace("{{CONTEXT}}", context);

    return { orderedSections, context, prompt };
  }

  let rendered = renderPrompt();

  if (rendered.prompt.length > budgets[mode]) {
    fitSectionsToBudget(
      sections,
      modeConfig,
      Math.max(0, contextBudget - (rendered.prompt.length - budgets[mode]))
    );
    rendered = renderPrompt();
  }

  const { orderedSections, context, prompt } = rendered;
  const finalChars = prompt.length;

  const meta = {
    mode,
    budgetChars: budgets[mode],
    hardMaxChars: budgets.hardMax,
    contextBudgetChars: contextBudget,
    finalChars,
    includedSections: orderedSections.map((section) => section.id),
    omittedSections: modeConfig.order.filter(
      (id) => !orderedSections.some((section) => section.id === id)
    ),
    truncatedSections: sections
      .filter((section) => section.truncated)
      .map((section) => section.id),
    sections: modeConfig.order
      .map((id) => sections.find((section) => section.id === id) || buildSection(id, id, ""))
      .map((section) => ({
        id: section.id,
        title: section.title,
        included: section.included && Boolean(section.body),
        dropped: section.dropped,
        truncated: section.truncated,
        originalChars: section.originalChars,
        finalChars: section.body.length
      }))
  };

  return { prompt, context, meta };
}

export function writePromptArtifacts(outputDir, { prompt, meta }) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "prompt.md"), prompt);
  fs.writeFileSync(
    path.join(outputDir, "prompt-meta.json"),
    JSON.stringify(meta, null, 2)
  );
}

export async function loadStagePromptInputs(env = process.env) {
  const mode = env.FACTORY_MODE;
  const issueNumber = Number(env.FACTORY_ISSUE_NUMBER);
  const prNumber = Number(env.FACTORY_PR_NUMBER || 0);
  const branch = env.FACTORY_BRANCH;
  const artifactsPath = env.FACTORY_ARTIFACTS_PATH;
  const reviewId = env.FACTORY_REVIEW_ID;
  const ciRunId = env.FACTORY_CI_RUN_ID;

  if (!mode || !branch || !artifactsPath || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("FACTORY_MODE, FACTORY_BRANCH, FACTORY_ARTIFACTS_PATH, and FACTORY_ISSUE_NUMBER are required");
  }

  const issue = await getIssue(issueNumber);
  const pullRequest = prNumber > 0 ? await getPullRequest(prNumber) : null;
  const review =
    prNumber > 0 && reviewId && mode === "repair"
      ? await getReview(prNumber, reviewId)
      : null;
  const reviewComments =
    prNumber > 0 && reviewId && mode === "repair"
      ? await listReviewComments(prNumber, reviewId)
      : [];
  const jobsPayload =
    ciRunId && mode === "repair" ? await listWorkflowRunJobs(ciRunId) : null;

  return {
    mode,
    issueNumber,
    prNumber,
    branch: pullRequest?.head?.ref || branch,
    artifactsPath,
    issueBody: issue.body || "",
    pullRequestBody: pullRequest?.body || "",
    review,
    reviewComments,
    jobsPayload,
    ciRunId,
    budgets: resolvePromptBudgets(env)
  };
}

export async function main(env = process.env) {
  const input = await loadStagePromptInputs(env);
  const templatePath = path.join(".factory", "prompts", `${input.mode}.md`);
  const templateText = fs.readFileSync(templatePath, "utf8");
  const result = buildStagePrompt({
    ...input,
    templateText
  });

  writePromptArtifacts(path.join(".factory", "tmp"), result);

  console.log(
    `Prompt budget: mode=${input.mode} chars=${result.meta.finalChars}/${result.meta.budgetChars} ` +
      `truncated=${result.meta.truncatedSections.length} omitted=${result.meta.omittedSections.length}`
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
