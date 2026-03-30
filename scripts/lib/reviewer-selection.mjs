function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern) {
  const withSentinels = pattern
    .replaceAll("**/", "\u0000")
    .replaceAll("**", "\u0001")
    .replaceAll("*", "\u0002");

  return new RegExp(
    `^${escapeRegex(withSentinels)
      .replaceAll("\u0000", "(?:.+/)?")
      .replaceAll("\u0001", ".*")
      .replaceAll("\u0002", "[^/]*")}$`,
    "u"
  );
}

function matchesAnyPattern(filePath, patterns = []) {
  return patterns.some((pattern) => globToRegex(pattern).test(filePath));
}

function normalizeLabel(label) {
  return `${label || ""}`.trim().toLowerCase();
}

function normalizeReviewer(name, definition) {
  return {
    name,
    ...definition
  };
}

function selectionReason(reviewer, { required, pathMatched, labelMatched }) {
  if (required) {
    return "required by policy";
  }

  if (reviewer.selection.always) {
    return "configured to always run";
  }

  if (pathMatched && labelMatched) {
    return "matched changed paths and labels";
  }

  if (pathMatched) {
    return "matched changed paths";
  }

  if (labelMatched) {
    return "matched labels";
  }

  return "selected";
}

function skipReason(reviewer, { selected, required, pathMatched, labelMatched, capped }) {
  if (!reviewer.enabled) {
    return "disabled";
  }

  if (selected) {
    return "selected";
  }

  if (capped) {
    return "dropped by max_reviewers policy";
  }

  if (required) {
    return "required reviewer missing selection reason";
  }

  if (!reviewer.selection.always && !pathMatched && !labelMatched) {
    return "not triggered";
  }

  return "skipped";
}

export function selectReviewers({
  config,
  changedFiles = [],
  labels = []
}) {
  const normalizedLabels = labels.map(normalizeLabel).filter(Boolean);
  const reviewers = Object.entries(config?.reviewers || {})
    .map(([name, definition]) => normalizeReviewer(name, definition))
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));

  const requiredSet = new Set(config?.policy?.required_reviewers || []);
  const candidates = reviewers.map((reviewer) => {
    const matchedPaths = changedFiles.filter((filePath) =>
      matchesAnyPattern(filePath, reviewer.selection.paths_any || [])
    );
    const matchedLabels = normalizedLabels.filter((label) =>
      (reviewer.selection.labels_any || []).map(normalizeLabel).includes(label)
    );

    return {
      reviewer,
      required: requiredSet.has(reviewer.name),
      pathMatched: matchedPaths.length > 0,
      labelMatched: matchedLabels.length > 0,
      matchedPaths,
      matchedLabels
    };
  });

  const selected = [];
  const selectedNames = new Set();
  const maxReviewers =
    config?.policy?.max_reviewers && config.policy.max_reviewers > 0
      ? config.policy.max_reviewers
      : Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const shouldSelect =
      candidate.reviewer.enabled &&
      (candidate.required ||
        candidate.reviewer.selection.always ||
        candidate.pathMatched ||
        candidate.labelMatched);

    if (!shouldSelect || selectedNames.has(candidate.reviewer.name)) {
      continue;
    }

    if (selected.length >= maxReviewers && !candidate.required) {
      continue;
    }

    selected.push({
      name: candidate.reviewer.name,
      reason: selectionReason(candidate.reviewer, candidate),
      priority: candidate.reviewer.priority,
      purpose: candidate.reviewer.purpose,
      instructions_path: candidate.reviewer.instructions_path,
      authority: candidate.reviewer.authority,
      matched_paths: candidate.matchedPaths,
      matched_labels: candidate.matchedLabels
    });
    selectedNames.add(candidate.reviewer.name);
  }

  const skipped = candidates
    .filter((candidate) => !selectedNames.has(candidate.reviewer.name))
    .map((candidate) => ({
      name: candidate.reviewer.name,
      reason: skipReason(candidate.reviewer, {
        ...candidate,
        selected: false,
        capped:
          candidate.reviewer.enabled &&
          !candidate.required &&
          (candidate.reviewer.selection.always ||
            candidate.pathMatched ||
            candidate.labelMatched) &&
          selected.length >= maxReviewers
      })
    }));

  return {
    mode: config?.policy?.mode || "single_review",
    selected_reviewers: selected,
    skipped_reviewers: skipped
  };
}
