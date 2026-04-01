import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_ISSUE_FILE_NAME } from "./lib/factory-config.mjs";
import { parseIssueForm } from "./lib/issue-form.mjs";
import { extractPrMetadata } from "./lib/pr-metadata.mjs";
import { FAILURE_TYPES } from "./lib/failure-classification.mjs";
import {
  getPullRequest,
  getReview,
  listReviewComments,
  listWorkflowRunJobs
} from "./lib/github.mjs";
import {
  FACTORY_STAGE_MODES,
  FACTORY_STAGE_MODE_VALUES
} from "./lib/factory-config.mjs";
import {
  getFailureCounter,
  getFailureType,
  getReviewArtifactFailure
} from "./lib/intervention-state.mjs";
import { resolveReviewMethodology } from "./lib/review-methods.mjs";
import {
  loadReviewerConfig,
  MULTI_REVIEW_METHOD_NAME,
  resolveReviewMethodologyName
} from "./lib/reviewer-config.mjs";
import { selectReviewers } from "./lib/reviewer-selection.mjs";
import { REVIEWERS_DIR_NAME } from "./lib/reviewer-artifacts.mjs";
import { setOutputs } from "./lib/actions-output.mjs";

export const DEFAULT_PROMPT_BUDGETS = Object.freeze({
  [FACTORY_STAGE_MODES.plan]: 20000,
  [FACTORY_STAGE_MODES.implement]: 12000,
  [FACTORY_STAGE_MODES.repair]: 14000,
  [FACTORY_STAGE_MODES.review]: 8000,
  hardMax: 24000
});

const ARTIFACT_FILES = [
  "spec.md",
  "plan.md",
  "acceptance-tests.md",
  "repair-log.md"
];
const FACTORY_POLICY_PATH = path.join(".factory", "FACTORY.md");

const STAGE_NOOP_ATTEMPT_LIMIT = 2;

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
  [FACTORY_STAGE_MODES.plan]: {
    order: ["run-metadata", "factory-policy", "problem", "goals", "acceptance", "constraints", "risk", "affected-area", "non-goals", "artifacts"],
    preferredChars: {
      "run-metadata": 500,
      "factory-policy": 600,
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
      "factory-policy": 0,
      problem: 500,
      goals: 300,
      acceptance: 300,
      constraints: 200,
      risk: 120,
      "affected-area": 0,
      "non-goals": 0,
      artifacts: 0
    },
    dropPriority: ["factory-policy", "non-goals", "affected-area", "risk", "constraints", "artifacts", "acceptance", "goals", "problem"]
  },
  [FACTORY_STAGE_MODES.implement]: {
    order: ["run-metadata", "factory-policy", "human-decision", "issue-synopsis", "artifact-index"],
    preferredChars: {
      "run-metadata": 500,
      "factory-policy": 500,
      "human-decision": 800,
      "issue-synopsis": 1200,
      "artifact-index": 5000
    },
    minChars: {
      "run-metadata": 200,
      "factory-policy": 0,
      "human-decision": 0,
      "issue-synopsis": 200,
      "artifact-index": 800
    },
    dropPriority: ["factory-policy", "human-decision", "issue-synopsis", "artifact-index"]
  },
  [FACTORY_STAGE_MODES.repair]: {
    order: ["run-metadata", "factory-policy", "failure-context", "artifact-index", "repair-log-tail", "issue-synopsis"],
    preferredChars: {
      "run-metadata": 500,
      "factory-policy": 500,
      "failure-context": 5000,
      "artifact-index": 3500,
      "repair-log-tail": 1200,
      "issue-synopsis": 800
    },
    minChars: {
      "run-metadata": 200,
      "factory-policy": 0,
      "failure-context": 800,
      "artifact-index": 600,
      "repair-log-tail": 0,
      "issue-synopsis": 120
    },
    dropPriority: ["factory-policy", "issue-synopsis", "repair-log-tail", "artifact-index", "failure-context"]
  },
  [FACTORY_STAGE_MODES.review]: {
    order: ["run-metadata", "factory-policy", "ci-evidence", "issue-synopsis", "artifact-index", "repair-log-tail"],
    preferredChars: {
      "run-metadata": 500,
      "factory-policy": 500,
      "ci-evidence": 800,
      "issue-synopsis": 1200,
      "artifact-index": 5000,
      "repair-log-tail": 1000
    },
    minChars: {
      "run-metadata": 200,
      "factory-policy": 0,
      "ci-evidence": 200,
      "issue-synopsis": 200,
      "artifact-index": 800,
      "repair-log-tail": 0
    },
    dropPriority: ["factory-policy", "repair-log-tail", "artifact-index", "ci-evidence", "issue-synopsis"]
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
    ),
    review: Math.min(
      positiveInt(env.FACTORY_REVIEW_PROMPT_MAX_CHARS, DEFAULT_PROMPT_BUDGETS.review),
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

function listChangedFiles(baseRef = "origin/main...HEAD") {
  try {
    return execFileSync("git", ["diff", "--name-only", baseRef], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeReviewerSelectionArtifact(artifactsPath, selection) {
  const reviewersDir = path.join(artifactsPath, REVIEWERS_DIR_NAME);
  fs.mkdirSync(reviewersDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewersDir, "selection.json"),
    `${JSON.stringify(selection, null, 2)}\n`
  );
}

function renderMultiReviewTemplateVariables(selection) {
  const reviewers = selection?.selected_reviewers || [];

  if (reviewers.length === 0) {
    return {
      MRH: " (single-review output only)",
      MRD: "",
      MRR: "",
      MRG: ""
    };
  }

  const reviewerList = reviewers
    .map(
      (reviewer) =>
        `- \`${reviewer.name}\` -> write \`reviewers/${reviewer.name}.json\` using \`${reviewer.instructions_path}\``
    )
    .join("\n");

  return {
    MRH: " (plus reviewer artifacts)",
    MRD: [
      "",
      "3. Reviewer artifacts",
      "   - Write one JSON artifact per selected reviewer under `reviewers/`:",
      reviewerList.replaceAll("\n", "\n   "),
      "   - Each reviewer artifact must follow the reviewer artifact schema exactly.",
      "   - Do not write the final merged `review.json` or `review.md` by hand when running `multi-review`; the coordinator synthesizes them after the reviewer artifacts are present."
    ].join("\n"),
    MRR: [
      "",
      "- For `multi-review`, first write every selected reviewer artifact under `reviewers/` and let the coordinator script synthesize the final review files.",
      "- If a selected reviewer cannot confirm a requirement because evidence is missing, record that as a finding in that reviewer artifact instead of omitting the reviewer."
    ].join("\n"),
    MRG: [
      "",
      "Multi-review execution plan:",
      reviewerList,
      "- Treat reviewer rubrics as independent first-pass reviews before coordinator synthesis."
    ].join("\n")
  };
}

export function readTrustedFactoryPolicy(
  gitShow = (spec) =>
    execFileSync("git", ["show", spec], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
) {
  try {
    return `${gitShow(`origin/main:${FACTORY_POLICY_PATH}`) || ""}`.trim();
  } catch {
    return "";
  }
}

function readApprovedIssueSnapshot(artifactsPath) {
  const snapshotPath = path.join(artifactsPath, APPROVED_ISSUE_FILE_NAME);

  try {
    return fs.readFileSync(snapshotPath, "utf8");
  } catch (error) {
    throw new Error(
      `Missing approved issue snapshot at ${snapshotPath}. Restart the factory run from a newly approved issue.`
    );
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
  const lines = [
    `- Mode: ${mode}`,
    `- Issue: #${issueNumber}`,
    `- Pull Request: ${prNumber > 0 ? `#${prNumber}` : "not created yet"}`,
    `- Branch: ${branch}`,
    `- Current status: ${metadata.status || "unknown"}`
  ];
  const lastFailureType = getFailureType(metadata);
  const stageNoopAttempts = getFailureCounter(metadata, "stageNoopAttempts");
  const stageSetupAttempts = getFailureCounter(metadata, "stageSetupAttempts");

  if (lastFailureType) {
    lines.push(`- Last failure type: ${lastFailureType}`);
  }

  if (stageNoopAttempts > 0) {
    lines.push(`- Stage no-op attempts: ${stageNoopAttempts}/${STAGE_NOOP_ATTEMPT_LIMIT}`);
  }

  if (stageSetupAttempts > 0) {
    lines.push(`- Stage setup attempts: ${stageSetupAttempts}`);
  }

  if (
    (mode === FACTORY_STAGE_MODES.implement || mode === FACTORY_STAGE_MODES.repair) &&
    lastFailureType === FAILURE_TYPES.stageNoop
  ) {
    lines.push("- Note: Previous stage produced no repository changes; ensure this run delivers substantive updates.");
  }

  return lines.join("\n");
}

function renderPendingStageDecision(metadata) {
  const decision = metadata?.pendingStageDecision;

  if (!decision) {
    return "";
  }

  return [
    `- Source intervention: ${decision.sourceInterventionId}`,
    `- Decision kind: ${decision.kind}`,
    `- Selected option: ${decision.selectedOptionLabel} (${decision.selectedOptionId})`,
    `- Required direction: ${decision.instruction}`,
    decision.answeredBy ? `- Answered by: ${decision.answeredBy}` : "",
    decision.answeredAt ? `- Answered at: ${decision.answeredAt}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function renderFailureContext({
  mode,
  ciRunId,
  jobsPayload,
  review,
  reviewComments,
  metadata
}) {
  if (mode !== "repair") {
    return "";
  }

  const lines = [];
  const artifactFailure =
    getFailureType(metadata) === FAILURE_TYPES.reviewArtifactContract
      ? getReviewArtifactFailure(metadata)
      : null;

  if (artifactFailure) {
    const capturedAt = artifactFailure.capturedAt ? ` (${artifactFailure.capturedAt})` : "";
    const summary = truncateText(
      artifactFailure.message || "(no failure message captured)",
      800
    );
    lines.push(`- Invalid review artifacts${capturedAt}: ${summary}`);

    if (`${artifactFailure.phase || ""}`.trim()) {
      lines.push(`  - Phase: ${artifactFailure.phase}`);
    }

    lines.push("  - Files: review.json, review.md");
  }

  if (jobsPayload?.jobs?.length) {
    if (lines.length > 0) {
      lines.push("");
    }

    const failedJobs = jobsPayload.jobs.filter(
      (job) => job.conclusion && job.conclusion !== "success"
    );
    const jobLines = [`- Workflow run id: ${ciRunId}`];

    for (const job of failedJobs) {
      jobLines.push(`- ${job.name}: ${job.conclusion}`);

      for (const step of (job.steps || []).filter(
        (item) => item.conclusion && item.conclusion !== "success"
      )) {
        jobLines.push(`  - ${step.name}: ${step.conclusion}`);
      }
    }

    lines.push(...jobLines);
    return lines.join("\n");
  }

  if (review) {
    const reviewLines = [
      `- Review state: ${review.state}`,
      `- Review body: ${truncateText(review.body || "(empty)", 1800)}`
    ];

    if (reviewComments.length) {
      reviewLines.push("");
      reviewLines.push("Review comments:");

      for (const comment of reviewComments.slice(0, 8)) {
        reviewLines.push(
          `- ${comment.path || "general"}: ${truncateText(comment.body || "", 220)}`
        );
      }
    }

    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(...reviewLines);
    return lines.join("\n");
  }

  return lines.join("\n");
}

function renderCiEvidence({ ciRunId, jobsPayload }) {
  if (!ciRunId) {
    return "";
  }

  const lines = [`- Workflow run id: ${ciRunId}`];

  if (!jobsPayload?.jobs?.length) {
    lines.push("- Job details could not be retrieved for this run.");
    return lines.join("\n");
  }

  const jobs = jobsPayload.jobs.slice(0, 6);

  for (const job of jobs) {
    const name = job.name || job.display_title || `job-${job.id || "unknown"}`;
    const conclusion = job.conclusion || job.status || "unknown";
    lines.push(`- ${name}: ${conclusion}`);

    const steps = (job.steps || [])
      .filter((step) => step?.name)
      .filter((step) => step.conclusion && step.conclusion !== "skipped");
    const highlightedSteps = steps
      .filter(
        (step) =>
          step.conclusion !== "success" ||
          /test|lint|coverage|build|deploy/i.test(step.name)
      )
      .slice(0, 4);

    for (const step of highlightedSteps) {
      lines.push(`  - ${step.name}: ${step.conclusion}`);
    }
  }

  return lines.join("\n").trim();
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
  ciRunId,
  factoryPolicyText = ""
}) {
  const sections = [];

  sections.push(
    buildSection(
      "run-metadata",
      "Run Metadata",
      renderRunMetadata({ mode, issueNumber, prNumber, branch, metadata })
    )
  );

  sections.push(
    buildSection("factory-policy", "Factory Policy", factoryPolicyText)
  );

  if (mode === FACTORY_STAGE_MODES.plan) {
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

  if (mode === FACTORY_STAGE_MODES.implement) {
    sections.push(
      buildSection(
        "human-decision",
        "Human Decision",
        renderPendingStageDecision(metadata)
      ),
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

  if (
    mode === FACTORY_STAGE_MODES.repair ||
    mode === FACTORY_STAGE_MODES.review
  ) {
    const repairLog = maybeRead(path.join(artifactsPath, "repair-log.md"));

    if (mode === FACTORY_STAGE_MODES.repair) {
      sections.push(
        buildSection(
          "failure-context",
          "Failure Context",
          renderFailureContext({
            mode,
            ciRunId,
            jobsPayload,
            review,
            reviewComments,
            metadata
          })
        )
      );
    }

    if (mode === FACTORY_STAGE_MODES.review) {
      sections.push(
        buildSection(
          "ci-evidence",
          "CI Evidence",
          renderCiEvidence({ ciRunId, jobsPayload })
        )
      );
    }

    sections.push(
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
  factoryPolicyText = "",
  templateText,
  templateVariables = {}
}) {
  const parsedIssue = parseIssueForm(issueBody);
  const metadata = pullRequestBody ? extractPrMetadata(pullRequestBody) || {} : {};
  const modeConfig = STAGE_SECTION_CONFIG[mode];

  if (!FACTORY_STAGE_MODE_VALUES.includes(mode)) {
    throw new Error(`Unsupported FACTORY_MODE: ${mode}`);
  }

  if (!modeConfig) {
    throw new Error(`Missing stage prompt configuration for FACTORY_MODE: ${mode}`);
  }

  const replacements = {
    ISSUE_NUMBER: String(issueNumber),
    ARTIFACTS_PATH: artifactsPath,
    ...templateVariables
  };

  let templateWithReplacements = templateText;

  for (const [key, value] of Object.entries(replacements)) {
    if (key === "CONTEXT") {
      continue;
    }

    templateWithReplacements = templateWithReplacements.replaceAll(`{{${key}}}`, value);
  }

  const promptWithoutContext = templateWithReplacements.replace("{{CONTEXT}}", "");
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
    ciRunId,
    factoryPolicyText
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
    const prompt = templateWithReplacements.replace("{{CONTEXT}}", context);

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

  if (mode === FACTORY_STAGE_MODES.implement && metadata?.budgetOverride) {
    meta.budgetOverride = metadata.budgetOverride;
  }

  if (
    mode === FACTORY_STAGE_MODES.review &&
    templateVariables.METHODOLOGY_NAME
  ) {
    meta.methodology = {
      name: templateVariables.METHODOLOGY_NAME,
      requested: templateVariables.METHODOLOGY_REQUESTED || templateVariables.METHODOLOGY_NAME,
      fallback: templateVariables.METHODOLOGY_FALLBACK === "true"
    };
  }

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
  const reviewMethod = env.FACTORY_REVIEW_METHOD || "";
  const reviewerConfig = mode === FACTORY_STAGE_MODES.review ? loadReviewerConfig() : null;

  if (!mode || !branch || !artifactsPath || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("FACTORY_MODE, FACTORY_BRANCH, FACTORY_ARTIFACTS_PATH, and FACTORY_ISSUE_NUMBER are required");
  }

  const pullRequest = prNumber > 0 ? await getPullRequest(prNumber) : null;
  const review =
    prNumber > 0 && reviewId && mode === FACTORY_STAGE_MODES.repair
      ? await getReview(prNumber, reviewId)
      : null;
  const reviewComments =
    prNumber > 0 && reviewId && mode === FACTORY_STAGE_MODES.repair
      ? await listReviewComments(prNumber, reviewId)
      : [];
  const jobsPayload =
    ciRunId &&
    (mode === FACTORY_STAGE_MODES.repair ||
      mode === FACTORY_STAGE_MODES.review)
      ? await listWorkflowRunJobs(ciRunId)
      : null;

  return {
    mode,
    issueNumber,
    prNumber,
    branch: pullRequest?.head?.ref || branch,
    artifactsPath,
    issueBody: readApprovedIssueSnapshot(artifactsPath),
    pullRequestBody: pullRequest?.body || "",
    review,
    reviewComments,
    jobsPayload,
    ciRunId,
    factoryPolicyText: readTrustedFactoryPolicy(),
    reviewMethod,
    reviewerConfig,
    changedFiles: mode === FACTORY_STAGE_MODES.review ? listChangedFiles() : [],
    prLabels:
      Array.isArray(pullRequest?.labels) ? pullRequest.labels.map((label) => label?.name || "") : [],
    budgets: resolvePromptBudgets(env)
  };
}

export async function main(env = process.env) {
  const input = await loadStagePromptInputs(env);
  const templatePath = path.join(".factory", "prompts", `${input.mode}.md`);
  const templateText = fs.readFileSync(templatePath, "utf8");
  let templateVariables = {};
  let methodology = null;
  let reviewerSelection = null;

  if (input.mode === FACTORY_STAGE_MODES.review) {
    const resolvedMethodName = resolveReviewMethodologyName({
      requestedMethodology: input.reviewMethod,
      reviewerConfig: input.reviewerConfig
    });
    methodology = resolveReviewMethodology({ requested: resolvedMethodName });
    const fallbackNote = methodology.fallback
      ? `Requested methodology "${methodology.requested}" was not found. Falling back to "${methodology.name}".`
      : "";

    templateVariables = {
      MRH: "",
      MRD: "",
      MRR: "",
      MRG: ""
    };

    if (methodology.name === MULTI_REVIEW_METHOD_NAME) {
      reviewerSelection = selectReviewers({
        config: input.reviewerConfig,
        changedFiles: input.changedFiles,
        labels: input.prLabels
      });
      writeReviewerSelectionArtifact(input.artifactsPath, reviewerSelection);
      Object.assign(templateVariables, renderMultiReviewTemplateVariables(reviewerSelection));
    }

    templateVariables = {
      ...templateVariables,
      METHODOLOGY_NAME: methodology.name,
      METHODOLOGY_INSTRUCTIONS: methodology.instructions.trim(),
      METHODOLOGY_NOTE: fallbackNote,
      METHODOLOGY_REQUESTED: methodology.requested,
      METHODOLOGY_FALLBACK: methodology.fallback ? "true" : "false"
    };

    if (methodology.fallback) {
      console.log(
        `Review methodology fallback: requested="${methodology.requested}" using="${methodology.name}"`
      );
    } else {
      console.log(`Review methodology resolved: "${methodology.name}"`);
    }
  }

  const result = buildStagePrompt({
    ...input,
    templateText,
    templateVariables
  });

  if (reviewerSelection) {
    result.meta.reviewerSelection = reviewerSelection;
  }
  writePromptArtifacts(path.join(".factory", "tmp"), result);
  setOutputs({
    prompt_mode: input.mode,
    review_methodology: methodology?.name || "",
    review_methodology_requested:
      methodology?.name === MULTI_REVIEW_METHOD_NAME
        ? MULTI_REVIEW_METHOD_NAME
        : methodology?.requested || "",
    review_methodology_fallback: methodology?.fallback ? "true" : "false"
  });

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
