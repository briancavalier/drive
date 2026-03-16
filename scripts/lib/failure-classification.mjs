const TRANSIENT_PATTERNS = [
  /could not resolve host/i,
  /temporary failure in name resolution/i,
  /\b(econnreset|etimedout|enotfound|eai_again|econnrefused)\b/i,
  /network(?:\s+is)?\s+unreachable/i,
  /fetch failed/i,
  /socket hang up/i,
  /timed out/i,
  /github api (429|5\d\d)/i,
  /http 5\d\d/i,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i
];

const STALE_BRANCH_CONFLICT_PATTERNS = [
  /merge conflict/i,
  /automatic merge failed/i,
  /could not apply/i,
  /\bconflict\b/i
];

const STALE_STAGE_PUSH_PATTERNS = [
  /\[rejected\].*\(fetch first\)/i,
  /non-fast-forward/i,
  /failed to push some refs/i,
  /updates were rejected because the remote contains work that you do not have locally/i
];

const CONFIGURATION_PATTERNS = [
  /factory_github_token/i,
  /openai_api_key/i,
  /model_not_found/i,
  /quota exceeded/i,
  /usage limit/i,
  /unable to resolve review methodology/i,
  /review\.json/i,
  /environment variable .* is required/i,
  /github token is required/i
];

export const FAILURE_TYPES = {
  transientInfra: "transient_infra",
  staleBranchConflict: "stale_branch_conflict",
  staleStagePush: "stale_stage_push",
  configuration: "configuration",
  contentOrLogic: "content_or_logic"
};

export const DEFAULT_TRANSIENT_RETRY_LIMIT = 2;

export function classifyFailure(message) {
  const normalized = `${message || ""}`.trim();

  if (!normalized) {
    return FAILURE_TYPES.contentOrLogic;
  }

  if (STALE_BRANCH_CONFLICT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return FAILURE_TYPES.staleBranchConflict;
  }

  if (STALE_STAGE_PUSH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return FAILURE_TYPES.staleStagePush;
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return FAILURE_TYPES.transientInfra;
  }

  if (CONFIGURATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return FAILURE_TYPES.configuration;
  }

  return FAILURE_TYPES.contentOrLogic;
}

export function isTransientFailureType(type) {
  return type === FAILURE_TYPES.transientInfra;
}

export function parseRetryLimit(value, fallback = DEFAULT_TRANSIENT_RETRY_LIMIT) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 0) {
    return fallback;
  }

  return limit;
}
