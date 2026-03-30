import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countBlockingFindings } from "./lib/review-methods.mjs";
import { renderCanonicalTraceabilityMarkdown } from "./lib/review-output.mjs";
import { loadReviewerConfig, REVIEWER_CONFIG_PATH, MULTI_REVIEW_METHOD_NAME } from "./lib/reviewer-config.mjs";
import {
  REVIEWERS_DIR_NAME,
  loadValidatedReviewerArtifacts
} from "./lib/reviewer-artifacts.mjs";

const STATUS_ORDER = Object.freeze({
  not_satisfied: 0,
  partially_satisfied: 1,
  satisfied: 2,
  not_applicable: 3
});

function sortFindings(findings = []) {
  return [...findings].sort(
    (left, right) =>
      (left.level === "blocking" ? 0 : 1) - (right.level === "blocking" ? 0 : 1) ||
      left.title.localeCompare(right.title)
  );
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function loadSelection(artifactsPath) {
  const selectionPath = path.join(artifactsPath, REVIEWERS_DIR_NAME, "selection.json");
  return JSON.parse(fs.readFileSync(selectionPath, "utf8"));
}

function mergeChecklist(reviewerArtifacts, reviewerDefinitions) {
  const checklistArtifacts = reviewerArtifacts.filter((artifact) => {
    const reviewerDefinition = reviewerDefinitions.find(
      (reviewer) => reviewer.name === artifact.reviewer
    );

    return reviewerDefinition?.authority?.requires_checklist === "workflow-safety";
  });

  if (checklistArtifacts.length === 0) {
    return null;
  }

  if (checklistArtifacts.length > 1) {
    throw new Error(
      "multi-review currently supports at most one checklist-producing reviewer in the final review"
    );
  }

  return checklistArtifacts[0].checklist || null;
}

function mergeFindings(reviewerArtifacts, reviewerConfig) {
  const merged = new Map();
  const disagreements = [];

  for (const artifact of reviewerArtifacts) {
    for (const finding of artifact.findings) {
      const key = [
        finding.scope.toLowerCase(),
        finding.title.toLowerCase(),
        finding.recommendation.toLowerCase()
      ].join("::");
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, {
          ...finding,
          reviewers: [artifact.reviewer]
        });
        continue;
      }

      if (existing.level !== finding.level && reviewerConfig.policy.coordinator.record_disagreements) {
        disagreements.push({
          topic: `${finding.scope}: ${finding.title}`,
          reviewers: uniq([...existing.reviewers, artifact.reviewer]),
          resolution: "Coordinator preserved the more severe evidence-backed finding level."
        });
      }

      const preferBlocking = existing.level === "blocking" || finding.level === "blocking";
      merged.set(key, {
        ...existing,
        ...finding,
        level: preferBlocking ? "blocking" : existing.level,
        evidence: uniq([...(existing.evidence || []), ...(finding.evidence || [])]),
        reviewers: uniq([...(existing.reviewers || []), artifact.reviewer])
      });
    }
  }

  return {
    findings: sortFindings([...merged.values()]),
    disagreements
  };
}

function mergeRequirementChecks(reviewerArtifacts, recordDisagreements) {
  const merged = new Map();
  const disagreements = [];

  for (const artifact of reviewerArtifacts) {
    for (const check of artifact.requirement_checks) {
      const key = `${check.type}::${check.requirement}`.toLowerCase();
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, {
          ...check,
          reviewers: [artifact.reviewer]
        });
        continue;
      }

      if (existing.status !== check.status && recordDisagreements) {
        disagreements.push({
          topic: `${check.type}: ${check.requirement}`,
          reviewers: uniq([...(existing.reviewers || []), artifact.reviewer]),
          resolution: "Coordinator preserved the least-satisfied requirement status."
        });
      }

      const leftOrder = STATUS_ORDER[existing.status] ?? 99;
      const rightOrder = STATUS_ORDER[check.status] ?? 99;
      const preferred = rightOrder < leftOrder ? check : existing;

      merged.set(key, {
        ...existing,
        ...preferred,
        evidence: uniq([...(existing.evidence || []), ...(check.evidence || [])]),
        reviewers: uniq([...(existing.reviewers || []), artifact.reviewer])
      });
    }
  }

  return {
    requirementChecks: [...merged.values()],
    disagreements
  };
}

function buildSummary({ reviewerArtifacts, findings, requirementChecks }) {
  const unmetChecks = requirementChecks.filter((check) =>
    ["partially_satisfied", "not_satisfied"].includes(check.status)
  ).length;
  const blockingFindings = countBlockingFindings(findings);
  return `${reviewerArtifacts.length} reviewer(s) completed. Blocking findings: ${blockingFindings}. Requirement gaps: ${unmetChecks}.`;
}

function buildReviewMarkdown(review) {
  const lines = [
    `# ${review.decision === "pass" ? "✅ PASS" : "❌ REQUEST_CHANGES"}`,
    "",
    "## 📝 Summary",
    review.summary,
    "",
    "## 🚨 Blocking Findings",
    ""
  ];

  const blockingFindings = review.findings.filter((finding) => finding.level === "blocking");
  const nonBlockingFindings = review.findings.filter((finding) => finding.level === "non_blocking");

  if (blockingFindings.length === 0) {
    lines.push("No blocking findings.", "");
  } else {
    for (const finding of blockingFindings) {
      lines.push(`### ${finding.title}`, "");
      lines.push(`- Scope: ${finding.scope}`);
      lines.push(`- Details: ${finding.details}`);
      lines.push(`- Recommendation: ${finding.recommendation}`);
      lines.push(`- Reviewers: ${(finding.reviewers || []).join(", ")}`, "");
    }
  }

  lines.push("## ⚠️ Non-Blocking Notes", "");

  if (nonBlockingFindings.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const finding of nonBlockingFindings) {
      lines.push(`### ${finding.title}`, "");
      lines.push(`- Scope: ${finding.scope}`);
      lines.push(`- Details: ${finding.details}`);
      lines.push(`- Recommendation: ${finding.recommendation}`);
      lines.push(`- Reviewers: ${(finding.reviewers || []).join(", ")}`, "");
    }
  }

  lines.push("## 👥 Reviewers", "");
  for (const reviewer of review.reviewers_run) {
    lines.push(`- ${reviewer.name}: ${reviewer.summary}`);
  }

  if (review.disagreements.length > 0) {
    lines.push("", "## ⚖️ Disagreements", "");
    for (const disagreement of review.disagreements) {
      lines.push(`- ${disagreement.topic} (${disagreement.reviewers.join(", ")}): ${disagreement.resolution}`);
    }
  }

  lines.push("", renderCanonicalTraceabilityMarkdown(review.requirement_checks));
  return lines.join("\n");
}

export function synthesizeMultiReview({
  artifactsPath,
  reviewerConfig = loadReviewerConfig(),
  selection = loadSelection(artifactsPath)
}) {
  const reviewerDefinitions = Object.entries(reviewerConfig.reviewers).map(([name, definition]) => ({
    name,
    ...definition
  }));
  const reviewerArtifacts = loadValidatedReviewerArtifacts({
    artifactsPath,
    reviewerDefinitions,
    selection
  });
  const mergedFindings = mergeFindings(reviewerArtifacts, reviewerConfig);
  const mergedRequirementChecks = mergeRequirementChecks(
    reviewerArtifacts,
    reviewerConfig.policy.coordinator.record_disagreements
  );
  const checklist = mergeChecklist(reviewerArtifacts, reviewerDefinitions);
  const findings = mergedFindings.findings;
  const requirementChecks = mergedRequirementChecks.requirementChecks;
  const disagreements = uniq([
    ...mergedFindings.disagreements.map((entry) => JSON.stringify(entry)),
    ...mergedRequirementChecks.disagreements.map((entry) => JSON.stringify(entry))
  ]).map((entry) => JSON.parse(entry));
  const decision =
    countBlockingFindings(findings) > 0 ||
    requirementChecks.some((check) => ["partially_satisfied", "not_satisfied"].includes(check.status))
      ? "request_changes"
      : "pass";

  const review = {
    methodology: MULTI_REVIEW_METHOD_NAME,
    decision,
    summary: buildSummary({ reviewerArtifacts, findings, requirementChecks }),
    blocking_findings_count: countBlockingFindings(findings),
    requirement_checks: requirementChecks,
    findings,
    ...(checklist ? { checklist } : {}),
    reviewers_run: reviewerArtifacts.map((artifact) => ({
      name: artifact.reviewer,
      status: artifact.status,
      summary: artifact.summary
    })),
    disagreements
  };

  return {
    review,
    reviewMarkdown: buildReviewMarkdown(review)
  };
}

export function main(env = process.env) {
  const artifactsPath = `${env.FACTORY_ARTIFACTS_PATH || ""}`.trim();
  const configPath = `${env.FACTORY_REVIEWERS_CONFIG_PATH || REVIEWER_CONFIG_PATH}`.trim();

  if (!artifactsPath) {
    throw new Error("FACTORY_ARTIFACTS_PATH is required");
  }

  const reviewerConfig = loadReviewerConfig({ configPath });
  const { review, reviewMarkdown } = synthesizeMultiReview({
    artifactsPath,
    reviewerConfig
  });

  fs.writeFileSync(path.join(artifactsPath, "review.json"), `${JSON.stringify(review, null, 2)}\n`);
  fs.writeFileSync(path.join(artifactsPath, "review.md"), `${reviewMarkdown}\n`);
  console.log(`Synthesized multi-review output for ${review.reviewers_run.length} reviewer(s).`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
