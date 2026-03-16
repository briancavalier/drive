import fs from "node:fs";
import path from "node:path";

const REVIEW_METHODS_ROOT = path.join(".factory", "review-methods");

function directoryExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function resolveReviewMethodology({ requested, rootDir = REVIEW_METHODS_ROOT } = {}) {
  const requestedName = `${requested || ""}`.trim() || "default";
  const candidateNames = [requestedName];

  if (!candidateNames.includes("default")) {
    candidateNames.push("default");
  }

  for (const name of candidateNames) {
    const methodDir = path.join(rootDir, name);
    const instructionsPath = path.join(methodDir, "instructions.md");

    if (!directoryExists(methodDir)) {
      continue;
    }

    try {
      const instructions = readFile(instructionsPath);

      return {
        requested: requestedName,
        name,
        rootDir,
        directory: methodDir,
        instructionsPath,
        instructions,
        fallback: name !== requestedName
      };
    } catch {
      continue;
    }
  }

  throw new Error(
    `Unable to resolve review methodology "${requestedName}". Expected instructions at ${path.join(
      rootDir,
      requestedName,
      "instructions.md"
    )}`
  );
}

export function sanitizeReviewDecision(decision) {
  return `${decision || ""}`.trim().toLowerCase();
}

export function countBlockingFindings(findings = []) {
  return findings.filter((finding) => sanitizeReviewDecision(finding.level) === "blocking").length;
}

