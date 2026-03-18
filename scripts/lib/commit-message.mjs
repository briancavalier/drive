import { parseChangedFiles } from "./stage-push.mjs";

const DEFAULT_MAX_SUMMARY_LENGTH = 60;
const BUCKET_WEIGHTS = {
  code: 3,
  tests: 2,
  docs: 1,
  artifacts: 1
};
const GENERIC_NAMES = new Set(["index", "main", "default"]);
const GENERATED_FILE_BASENAMES = new Set(["package-lock.json"]);

export function buildCommitMessage({
  mode = "stage",
  issueNumber,
  branch = "",
  issueTitle = "",
  stagedDiff = [],
  maxSummaryLength = DEFAULT_MAX_SUMMARY_LENGTH
} = {}) {
  const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
  const normalizedMode = `${mode || "stage"}`.trim() || "stage";
  const entries = normalizeEntries(stagedDiff);
  const statuses = new Set();
  const descriptorsMap = new Map();

  for (const entry of entries) {
    const status = normalizeStatus(entry.status);
    const path = normalizePath(entry.status, entry.path);

    if (!path) {
      continue;
    }

    statuses.add(status);

    if (shouldIgnorePath(path)) {
      continue;
    }

    const artifactDescriptor = resolveArtifactDescriptor(path, normalizedIssueNumber);

    if (artifactDescriptor) {
      recordDescriptor(descriptorsMap, {
        bucket: "artifacts",
        descriptor: artifactDescriptor,
        base: artifactDescriptor,
        status
      });
      continue;
    }

    const bucket = resolveBucket(path);
    const descriptorInfo = deriveDescriptor(path, bucket);

    if (!descriptorInfo) {
      continue;
    }

    recordDescriptor(descriptorsMap, {
      bucket,
      descriptor: descriptorInfo.descriptor,
      base: descriptorInfo.base,
      status
    });
  }

  let descriptors = mergeTestDescriptors(descriptorsMap);

  const hasOnlyArtifacts = descriptors.length > 0 && descriptors.every((descriptor) => descriptor.bucket === "artifacts");

  if (!descriptors.length || hasOnlyArtifacts) {
    const fallbackBase =
      toWords(issueTitle) || toWords(extractBranchSlug(branch, normalizedIssueNumber)) || `issue-${normalizedIssueNumber}`;

    const fallbackDescriptor = fallbackBase || `issue-${normalizedIssueNumber}`;

    descriptors = [
      {
        bucket: "code",
        descriptor: fallbackDescriptor,
        base: fallbackDescriptor,
        hasTests: false,
        statuses: new Set(statuses),
        count: entries.length || 1
      }
    ];

    if (!statuses.size) {
      statuses.add("M");
    }
  }

  const sortedDescriptors = descriptors
    .map((descriptor) => ({
      ...descriptor,
      weight: BUCKET_WEIGHTS[descriptor.bucket] || 0
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }

      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.descriptor.localeCompare(b.descriptor);
    });

  const selectedDescriptors = sortedDescriptors.slice(0, 2);
  const allStatuses = new Set();

  for (const descriptor of selectedDescriptors) {
    for (const status of descriptor.statuses) {
      allStatuses.add(status);
    }
  }

  if (!allStatuses.size && statuses.size) {
    for (const status of statuses) {
      allStatuses.add(status);
    }
  }

  const verb = selectVerb(allStatuses);
  const summary = composeSummary({
    verb,
    descriptors: selectedDescriptors,
    maxSummaryLength,
    mode: normalizedMode,
    issueNumber: normalizedIssueNumber
  });

  return summary;
}

function normalizeIssueNumber(value) {
  const stringValue = `${value ?? ""}`.trim();

  if (!stringValue) {
    return "0";
  }

  return stringValue.replace(/[^0-9]/g, "") || stringValue;
}

function normalizeEntries(stagedDiff) {
  return parseChangedFiles(stagedDiff).map(({ status = "", path = "" }) => ({
    status: `${status}`.trim(),
    path: `${path}`.trim()
  }));
}

function normalizePath(status, path) {
  const trimmedPath = `${path || ""}`.trim();

  if (!trimmedPath) {
    return "";
  }

  if (/^[RC]/.test(`${status || ""}`)) {
    const parts = trimmedPath.split("\t").filter(Boolean);

    if (parts.length > 1) {
      return parts[parts.length - 1];
    }
  }

  return trimmedPath;
}

function normalizeStatus(status) {
  const firstChar = `${status || ""}`.trim().charAt(0).toUpperCase();

  if (!firstChar) {
    return "M";
  }

  if (firstChar === "?") {
    return "A";
  }

  if (firstChar === "C") {
    return "R";
  }

  return firstChar;
}

function shouldIgnorePath(path) {
  if (path.startsWith(".factory/tmp/")) {
    return true;
  }

  const basename = path.split("/").pop() || "";

  if (GENERATED_FILE_BASENAMES.has(basename)) {
    return true;
  }

  return false;
}

function resolveArtifactDescriptor(path, issueNumber) {
  const expectedPrefix = `.factory/runs/${issueNumber}/`;

  if (!path.startsWith(expectedPrefix)) {
    return "";
  }

  if (path.endsWith("spec.md")) {
    return "spec";
  }

  if (path.endsWith("plan.md")) {
    return "plan";
  }

  if (path.endsWith("acceptance-tests.md")) {
    return "acceptance tests";
  }

  if (path.endsWith("repair-log.md")) {
    return "repair log";
  }

  if (path.endsWith("cost-summary.json")) {
    return "cost summary";
  }

  return "";
}

function resolveBucket(path) {
  const lowerPath = path.toLowerCase();

  if (isTestPath(lowerPath)) {
    return "tests";
  }

  if (isDocPath(lowerPath)) {
    return "docs";
  }

  return "code";
}

function isTestPath(lowerPath) {
  if (lowerPath.includes("/tests/") || lowerPath.includes("/__tests__/")) {
    return true;
  }

  const basename = lowerPath.split("/").pop() || "";

  if (basename.includes(".test.")) {
    return true;
  }

  if (basename.includes(".spec.")) {
    return true;
  }

  if (basename.endsWith(".test")) {
    return true;
  }

  if (basename.endsWith(".spec")) {
    return true;
  }

  return false;
}

function isDocPath(lowerPath) {
  if (lowerPath.startsWith(".factory/runs/")) {
    return false;
  }

  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".mdx") || lowerPath.endsWith(".rst")) {
    return true;
  }

  const basename = lowerPath.split("/").pop() || "";

  if (basename.startsWith("readme.")) {
    return true;
  }

  if (basename === "readme") {
    return true;
  }

  return false;
}

function deriveDescriptor(path, bucket) {
  const segments = path.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] || "";
  const withoutExtension = stripExtension(basename);

  if (!withoutExtension) {
    return null;
  }

  let baseDescriptor = withoutExtension;

  if (bucket === "tests") {
    baseDescriptor = stripTestSuffix(baseDescriptor);
  }

  let words = toWords(baseDescriptor);

  if (!words || GENERIC_NAMES.has(words.replace(/\s+/g, ""))) {
    const parentSegment = segments.length > 1 ? segments[segments.length - 2] : "";
    const parentWords = toWords(parentSegment);

    if (parentWords) {
      words = parentWords;
    }
  }

  if (!words) {
    words = toWords(withoutExtension);
  }

  if (!words) {
    return null;
  }

  if (bucket === "tests") {
    return {
      descriptor: `${words} tests`,
      base: words
    };
  }

  return {
    descriptor: words,
    base: words
  };
}

function stripExtension(value) {
  const withoutExtension = `${value || ""}`.replace(/\.[^.]+$/, "");

  if (withoutExtension === value) {
    return value;
  }

  return withoutExtension;
}

function stripTestSuffix(value) {
  return `${value || ""}`.replace(/\.(test|spec)$/i, "");
}

function toWords(value) {
  const normalized = `${value || ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();

  return normalized.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function recordDescriptor(map, { bucket, descriptor, base, status }) {
  const key = `${bucket}::${descriptor}`;
  const existing = map.get(key);

  if (existing) {
    existing.count += 1;
    existing.statuses.add(status);
    return;
  }

  map.set(key, {
    bucket,
    descriptor,
    base,
    statuses: new Set([status]),
    count: 1,
    hasTests: false
  });
}

function mergeTestDescriptors(descriptorsMap) {
  const descriptors = Array.from(descriptorsMap.values());
  const codeByBase = new Map();

  for (const descriptor of descriptors) {
    if (descriptor.bucket === "code") {
      codeByBase.set(descriptor.base, descriptor);
    }
  }

  const filtered = [];

  for (const descriptor of descriptors) {
    if (descriptor.bucket === "tests") {
      const baseDescriptor = codeByBase.get(descriptor.base);

      if (baseDescriptor) {
        baseDescriptor.hasTests = true;
        baseDescriptor.count += descriptor.count;
        for (const status of descriptor.statuses) {
          baseDescriptor.statuses.add(status);
        }
        continue;
      }
    }

    filtered.push(descriptor);
  }

  return filtered;
}

function selectVerb(statuses) {
  if (!statuses.size) {
    return "update";
  }

  const hasAdd = statuses.has("A");
  const hasDelete = statuses.has("D");
  const hasRename = statuses.has("R");
  const hasModify = statuses.has("M");
  const total = statuses.size;

  if (!hasDelete && !hasRename && !hasModify && hasAdd && total === 1) {
    return "add";
  }

  if (!hasAdd && !hasRename && !hasModify && hasDelete && total === 1) {
    return "remove";
  }

  return "update";
}

function composeSummary({ verb, descriptors, maxSummaryLength, mode, issueNumber }) {
  const descriptorPhrases = descriptors.map((descriptor) =>
    descriptor.hasTests ? `${descriptor.descriptor} with tests` : descriptor.descriptor
  );

  let summaryBody;

  if (!descriptorPhrases.length) {
    summaryBody = verb;
  } else if (descriptorPhrases.length === 1) {
    summaryBody = `${verb} ${descriptorPhrases[0]}`;
  } else {
    summaryBody = `${verb} ${descriptorPhrases[0]} and ${descriptorPhrases[1]}`;
  }

  let summary = summaryBody.trim();

  const prefix = `factory(${mode}): `;

  if (mode === "repair") {
    summary = ensureRepairSuffix(summary, issueNumber, maxSummaryLength);
  } else {
    summary = applyTruncation(summary, maxSummaryLength);
  }

  return `${prefix}${summary}`;
}

function ensureRepairSuffix(summary, issueNumber, maxSummaryLength) {
  const suffix = ` for issue #${issueNumber}`;
  const trimmedSummary = summary.endsWith(suffix) ? summary.slice(0, -suffix.length) : summary;
  let base = trimmedSummary.trimEnd();
  let combined = `${base}${suffix}`;

  if (combined.length <= maxSummaryLength) {
    return combined;
  }

  const available = Math.max(0, maxSummaryLength - suffix.length - 3);

  if (available === 0) {
    return `...${suffix}`;
  }

  base = base.slice(0, available).trimEnd();
  combined = `${base}...${suffix}`;
  return combined;
}

function applyTruncation(summary, maxSummaryLength) {
  if (summary.length <= maxSummaryLength) {
    return summary;
  }

  if (maxSummaryLength <= 3) {
    return "...";
  }

  const truncated = summary.slice(0, maxSummaryLength - 3).trimEnd();
  return `${truncated}...`;
}

function extractBranchSlug(branch, issueNumber) {
  const normalizedBranch = `${branch || ""}`.trim();
  const suffix = `factory/${issueNumber}-`;

  if (normalizedBranch.startsWith(suffix)) {
    return normalizedBranch.slice(suffix.length);
  }

  return normalizedBranch;
}
