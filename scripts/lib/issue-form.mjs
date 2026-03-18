const SECTION_HEADERS = {
  "problem statement": "problemStatement",
  goals: "goals",
  "non-goals": "nonGoals",
  constraints: "constraints",
  "acceptance criteria": "acceptanceCriteria",
  risk: "risk",
  "affected area": "affectedArea"
};

export function parseIssueForm(body) {
  const normalizedBody = `${body || ""}`.replace(/\r/g, "").trim();
  const sections = {};
  let currentKey = null;

  for (const line of normalizedBody.split("\n")) {
    const headingMatch = line.match(/^##+\s+(.*?)\s*$/);

    if (headingMatch) {
      currentKey = SECTION_HEADERS[headingMatch[1].trim().toLowerCase()] || null;

      if (currentKey && !sections[currentKey]) {
        sections[currentKey] = [];
      }

      continue;
    }

    if (!currentKey) {
      continue;
    }

    sections[currentKey].push(line);
  }

  const result = {};

  for (const key of Object.values(SECTION_HEADERS)) {
    const value = (sections[key] || []).join("\n").trim();

    if (value) {
      result[key] = value;
    }
  }

  return result;
}

export function missingIssueFormFields(parsed) {
  return Object.values(SECTION_HEADERS).filter((key) => !parsed[key]);
}

export function isValidIssueForm(parsed) {
  return missingIssueFormFields(parsed).length === 0;
}

export function slugifyIssueTitle(title) {
  return `${title || ""}`
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "request";
}
