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

function groupRequirementChecks(requirementChecks = []) {
  return REQUIREMENT_TYPE_ORDER.map((type) => ({
    type,
    label: REQUIREMENT_TYPE_LABELS[type],
    checks: requirementChecks.filter((check) => check.type === type)
  })).filter((group) => group.checks.length > 0);
}

function renderRequirementCheckItem(check) {
  return [
    `- Requirement: ${check.requirement}`,
    `  - Status: \`${check.status}\``,
    `  - Evidence: ${check.evidence}`
  ].join("\n");
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
  const groups = groupRequirementChecks(requirementChecks).map((group) =>
    [
      "<details>",
      `<summary>Traceability: ${group.label}</summary>`,
      "",
      group.checks.map(renderRequirementCheckItem).join("\n"),
      "",
      "</details>"
    ].join("\n")
  );

  return ["## Traceability", "", groups.join("\n\n")].join("\n");
}

export function renderBlockingFindingsSummary(findings = []) {
  const blockingFindings = findings.filter((finding) => finding.level === "blocking");

  if (!blockingFindings.length) {
    return "- None recorded in review.json.";
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
    return "- None recorded in review.json.";
  }

  return unmetChecks
    .map(
      (check) =>
        `- [${check.type}] \`${check.status}\` ${check.requirement} -- Evidence: ${check.evidence}`
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

export function renderTraceabilityDetails(requirementChecks = []) {
  return renderDetailsBlock(
    "Traceability",
    renderRequirementChecksWithHeading(requirementChecks)
  );
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

export function renderFullReviewDetails(reviewMarkdown = "") {
  return renderDetailsBlock("Full review.md", reviewMarkdown);
}
