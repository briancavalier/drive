import fs from "node:fs";

export const REVIEWER_CONFIG_PATH = ".factory/reviewers.json";
export const MULTI_REVIEW_METHOD_NAME = "multi-review";

export const DEFAULT_REVIEWER_CONFIG = Object.freeze({
  version: 1,
  reviewers: {},
  policy: {
    mode: "single_review",
    max_reviewers: 0,
    fallback_methodology: "default",
    required_reviewers: [],
    coordinator: {
      strategy: "conservative",
      require_evidence_for_blocking: true,
      preserve_blocking_from: [],
      record_disagreements: true
    }
  }
});

function ensureObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return value;
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function ensureBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

function ensureInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function ensureStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }

  return value.map((entry, index) => ensureString(entry, `${fieldName}[${index}]`));
}

function validateSelection(selection, fieldName) {
  const normalized = ensureObject(selection, fieldName);

  return {
    ...(Object.hasOwn(normalized, "always")
      ? { always: ensureBoolean(normalized.always, `${fieldName}.always`) }
      : {}),
    ...(Object.hasOwn(normalized, "paths_any")
      ? { paths_any: ensureStringArray(normalized.paths_any, `${fieldName}.paths_any`) }
      : {}),
    ...(Object.hasOwn(normalized, "labels_any")
      ? { labels_any: ensureStringArray(normalized.labels_any, `${fieldName}.labels_any`) }
      : {})
  };
}

function validateAuthority(authority, fieldName) {
  const normalized = ensureObject(authority, fieldName);

  return {
    can_block: ensureBoolean(normalized.can_block, `${fieldName}.can_block`),
    ...(Object.hasOwn(normalized, "requires_checklist")
      ? {
          requires_checklist: ensureString(
            normalized.requires_checklist,
            `${fieldName}.requires_checklist`
          )
        }
      : {})
  };
}

function validateReviewerDefinition(name, definition) {
  const reviewer = ensureObject(definition, `reviewers.${name}`);

  return {
    enabled: ensureBoolean(reviewer.enabled, `reviewers.${name}.enabled`),
    kind: ensureString(reviewer.kind, `reviewers.${name}.kind`),
    instructions_path: ensureString(
      reviewer.instructions_path,
      `reviewers.${name}.instructions_path`
    ),
    purpose: ensureString(reviewer.purpose, `reviewers.${name}.purpose`),
    priority: ensureInteger(reviewer.priority, `reviewers.${name}.priority`),
    selection: validateSelection(reviewer.selection, `reviewers.${name}.selection`),
    authority: validateAuthority(reviewer.authority, `reviewers.${name}.authority`)
  };
}

function validateCoordinatorPolicy(coordinator) {
  const normalized = ensureObject(coordinator, "policy.coordinator");

  return {
    strategy: ensureString(normalized.strategy, "policy.coordinator.strategy"),
    require_evidence_for_blocking: ensureBoolean(
      normalized.require_evidence_for_blocking,
      "policy.coordinator.require_evidence_for_blocking"
    ),
    preserve_blocking_from: ensureStringArray(
      normalized.preserve_blocking_from,
      "policy.coordinator.preserve_blocking_from"
    ),
    record_disagreements: ensureBoolean(
      normalized.record_disagreements,
      "policy.coordinator.record_disagreements"
    )
  };
}

export function validateReviewerConfig(config) {
  const normalized = ensureObject(config, "reviewer config");
  const policy = ensureObject(normalized.policy, "policy");
  const reviewers = ensureObject(normalized.reviewers, "reviewers");
  const mode = ensureString(policy.mode, "policy.mode");

  if (!["single_review", "multi_review"].includes(mode)) {
    throw new Error(`policy.mode must be "single_review" or "multi_review", received "${mode}"`);
  }

  const validatedReviewers = Object.fromEntries(
    Object.entries(reviewers).map(([name, definition]) => [
      ensureString(name, "reviewer name"),
      validateReviewerDefinition(name, definition)
    ])
  );

  return {
    version: ensureInteger(normalized.version, "version"),
    reviewers: validatedReviewers,
    policy: {
      mode,
      max_reviewers: ensureInteger(policy.max_reviewers, "policy.max_reviewers"),
      fallback_methodology: ensureString(
        policy.fallback_methodology,
        "policy.fallback_methodology"
      ),
      required_reviewers: ensureStringArray(
        policy.required_reviewers,
        "policy.required_reviewers"
      ),
      coordinator: validateCoordinatorPolicy(policy.coordinator)
    }
  };
}

export function loadReviewerConfig({
  configPath = REVIEWER_CONFIG_PATH
} = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return validateReviewerConfig(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return structuredClone(DEFAULT_REVIEWER_CONFIG);
    }

    throw error;
  }
}

export function isMultiReviewEnabled(config) {
  return config?.policy?.mode === "multi_review";
}

export function resolveReviewMethodologyName({
  requestedMethodology = "",
  reviewerConfig = DEFAULT_REVIEWER_CONFIG
} = {}) {
  const requested = `${requestedMethodology || ""}`.trim();

  if (requested) {
    return requested;
  }

  if (isMultiReviewEnabled(reviewerConfig)) {
    return MULTI_REVIEW_METHOD_NAME;
  }

  return reviewerConfig?.policy?.fallback_methodology || "default";
}
