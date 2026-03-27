const REQUIREMENT_TYPE_ORDER = Object.freeze([
  "acceptance_criterion",
  "spec_commitment",
  "plan_deliverable"
]);

const REQUIREMENT_TYPE_LABELS = Object.freeze({
  acceptance_criterion: "Acceptance Criteria",
  spec_commitment: "Spec Commitments",
  plan_deliverable: "Plan Deliverables"
});

const STATUS_DISPLAY = Object.freeze({
  satisfied: { icon: "✅", label: "Satisfied" },
  partially_satisfied: { icon: "⚠️", label: "Partially satisfied" },
  not_satisfied: { icon: "❌", label: "Not satisfied" },
  not_applicable: { icon: "⬜", label: "Not applicable" }
});

const STATUS_SEVERITY_ORDER = Object.freeze([
  "not_satisfied",
  "partially_satisfied",
  "satisfied",
  "not_applicable"
]);

export function normalizeNewlines(value) {
  return `${value || ""}`.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function groupRequirementChecks(requirementChecks = []) {
  return REQUIREMENT_TYPE_ORDER.map((type) => ({
    type,
    label: REQUIREMENT_TYPE_LABELS[type],
    checks: requirementChecks.filter((check) => check.type === type)
  })).filter((group) => group.checks.length > 0);
}

function renderCompactEvidence(evidence = []) {
  return evidence.join("; ");
}

function resolveStatusDisplay(status) {
  const fallbackLabel = status || "Unknown";

  if (!STATUS_DISPLAY[status]) {
    return { icon: "", label: fallbackLabel };
  }

  return STATUS_DISPLAY[status];
}

function renderRequirementCheckItem(check) {
  const { icon, label } = resolveStatusDisplay(check.status);
  const iconPrefix = icon ? `${icon} ` : "";
  const lines = [`- ${iconPrefix}**${label}**: ${check.requirement}`];

  if (Array.isArray(check.evidence) && check.evidence.length > 0) {
    for (const evidence of check.evidence) {
      lines.push(`  - **Evidence:** ${evidence}`);
    }
  }

  return lines.join("\n");
}

function formatStatusCounts(checks = []) {
  const counts = new Map();

  for (const check of checks) {
    const current = counts.get(check.status) || 0;
    counts.set(check.status, current + 1);
  }

  const parts = STATUS_SEVERITY_ORDER.filter((status) => counts.get(status)).map((status) => {
    const { icon } = resolveStatusDisplay(status);
    return `${icon || status} ${counts.get(status)}`;
  });

  if (!parts.length) {
    return "";
  }

  return ` (${parts.join(", ")})`;
}

function renderRequirementChecksWithHeading(requirementChecks = [], headingLevel = "###") {
  return groupRequirementChecks(requirementChecks)
    .map((group) =>
      [
        `${headingLevel} ${group.label}`,
        "",
        group.checks.map(renderRequirementCheckItem).join("\n")
      ].join("\n")
    )
    .join("\n\n");
}

export function renderCanonicalTraceabilityMarkdown(requirementChecks = []) {
  const groups = groupRequirementChecks(requirementChecks);
  const sections = groups
    .map((group) => {
      const summaryCounts = formatStatusCounts(group.checks);
      const heading = `#### ${group.label}${summaryCounts}`;
      const items = group.checks.map(renderRequirementCheckItem).join("\n");

      return [heading, "", items].join("\n");
    })
    .join("\n\n");
  const content = sections || "_No requirement checks recorded._";

  return [
    "<details>",
    "<summary>🧭 Traceability</summary>",
    "",
    content,
    "",
    "</details>"
  ].join("\n");
}

export function renderBlockingFindingsSummary(findings = []) {
  const blockingFindings = findings.filter((finding) => finding.level === "blocking");

  if (!blockingFindings.length) {
    return "- None.";
  }

  return blockingFindings
    .map(
      (finding) =>
        `- **${finding.title}** (${finding.scope}) -- ${finding.details} Recommendation: ${finding.recommendation}`
    )
    .join("\n");
}

export function renderUnmetRequirementChecksSummary(requirementChecks = []) {
  const unmetChecks = requirementChecks.filter((check) =>
    ["partially_satisfied", "not_satisfied"].includes(check.status)
  );

  if (!unmetChecks.length) {
    return "- None.";
  }

  return unmetChecks
    .map(
      (check) =>
        `- [${check.type}] \`${check.status}\` ${check.requirement} -- Evidence: ${renderCompactEvidence(check.evidence)}`
    )
    .join("\n");
}

export function renderDetailsBlock(summary, body) {
  const normalizedBody = `${body || ""}`.trim();

  if (!normalizedBody) {
    return "";
  }

  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    normalizedBody,
    "",
    "</details>"
  ].join("\n");
}

export function renderFullBlockingFindingsDetails(findings = []) {
  const blockingFindings = findings.filter((finding) => finding.level === "blocking");

  if (!blockingFindings.length) {
    return "";
  }

  return renderDetailsBlock(
    "Full Blocking Findings",
    blockingFindings
      .map((finding) =>
        [
          `### ${finding.title}`,
          "",
          `- Scope: ${finding.scope}`,
          `- Details: ${finding.details}`,
          `- Recommendation: ${finding.recommendation}`
        ].join("\n")
      )
      .join("\n\n")
  );
}
