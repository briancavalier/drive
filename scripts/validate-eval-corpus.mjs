import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CORPUS_ROOT = path.join("eval", "corpus");
const TASKS_DIR_NAME = "tasks";
const INDEX_FILE_NAME = "index.json";
const HOLDOUT_FILE_NAME = "holdout-manifest.json";
const TASK_SCHEMA_VERSION = 1;
const ALLOWED_DEV_STATUSES = new Set(["active", "retired"]);
const ALLOWED_HOLDOUT_STATUSES = new Set(["holdout_external", "retired"]);
const ALLOWED_SOURCE_KINDS = new Set(["replayed_factory_run", "hand_authored_private"]);
const ALLOWED_ARTIFACT_KEYS = new Set([
  "approved_issue",
  "spec",
  "plan",
  "acceptance_tests",
  "repair_log",
  "review_json",
  "cost_summary"
]);
const REQUIRED_ARTIFACT_KEYS = new Set(["spec", "plan", "acceptance_tests"]);
const ALLOWED_ARTIFACT_FILES = new Set([
  "approved-issue.md",
  "spec.md",
  "plan.md",
  "acceptance-tests.md",
  "repair-log.md",
  "review.json",
  "cost-summary.json"
]);

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureObject(value, fieldName) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
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

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value;
}

function ensureStringArray(value, fieldName) {
  const array = ensureArray(value, fieldName);

  if (array.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return array.map((item, index) => ensureString(item, `${fieldName}[${index}]`));
}

function ensureInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function ensureBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

function isIsoTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);
}

function ensureIsoTimestamp(value, fieldName) {
  const normalized = ensureString(value, fieldName);

  if (!isIsoTimestamp(normalized)) {
    throw new Error(`${fieldName} must be an ISO-8601 UTC timestamp`);
  }

  return normalized;
}

function ensureTaskIdArray(value, fieldName) {
  const ids = ensureStringArray(value, fieldName);
  const unique = new Set(ids);

  if (unique.size !== ids.length) {
    throw new Error(`${fieldName} must not contain duplicate task IDs`);
  }

  return ids;
}

function validateArtifactPath(artifactPath, fieldName, repoRoot) {
  const normalized = ensureString(artifactPath, fieldName);

  if (!normalized.startsWith(".factory/runs/")) {
    throw new Error(`${fieldName} must point to .factory/runs/<issue>/ durable artifacts`);
  }

  const fileName = path.posix.basename(normalized);
  if (!ALLOWED_ARTIFACT_FILES.has(fileName)) {
    throw new Error(`${fieldName} references unsupported artifact file "${fileName}"`);
  }

  const absolutePath = path.join(repoRoot, normalized);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${fieldName} references missing artifact "${normalized}"`);
  }

  return normalized;
}

function validateArtifactPaths(value, repoRoot) {
  const artifactPaths = ensureObject(value, "artifact_paths");
  const keys = Object.keys(artifactPaths);

  if (keys.length === 0) {
    throw new Error("artifact_paths must not be empty");
  }

  for (const key of keys) {
    if (!ALLOWED_ARTIFACT_KEYS.has(key)) {
      throw new Error(`artifact_paths contains unsupported key "${key}"`);
    }
  }

  for (const key of REQUIRED_ARTIFACT_KEYS) {
    if (!(key in artifactPaths)) {
      throw new Error(`artifact_paths.${key} is required`);
    }
  }

  return Object.fromEntries(
    Object.entries(artifactPaths).map(([key, artifactPath]) => [
      key,
      validateArtifactPath(artifactPath, `artifact_paths.${key}`, repoRoot)
    ])
  );
}

export function validateTaskManifest(task, repoRoot) {
  const normalized = ensureObject(task, "task manifest");

  if ((normalized.schema_version ?? TASK_SCHEMA_VERSION) !== TASK_SCHEMA_VERSION) {
    throw new Error("task manifest schema_version must be 1 when present");
  }

  const split = ensureString(normalized.split, "split");
  if (split !== "dev") {
    throw new Error(`split must be "dev", received "${split}"`);
  }

  const status = ensureString(normalized.status, "status");
  if (!ALLOWED_DEV_STATUSES.has(status)) {
    throw new Error(`status must be one of: ${Array.from(ALLOWED_DEV_STATUSES).join(", ")}`);
  }

  const sourceKind = ensureString(normalized.source_kind, "source_kind");
  if (!ALLOWED_SOURCE_KINDS.has(sourceKind)) {
    throw new Error(
      `source_kind must be one of: ${Array.from(ALLOWED_SOURCE_KINDS).join(", ")}`
    );
  }

  return {
    task_id: ensureString(normalized.task_id, "task_id"),
    split,
    status,
    source_kind: sourceKind,
    issue_number: ensureInteger(normalized.issue_number, "issue_number"),
    title: ensureString(normalized.title, "title"),
    summary: ensureString(normalized.summary, "summary"),
    artifact_paths: validateArtifactPaths(normalized.artifact_paths, repoRoot),
    tags: ensureStringArray(normalized.tags, "tags"),
    risk_profile: ensureString(normalized.risk_profile, "risk_profile"),
    control_plane: ensureBoolean(normalized.control_plane, "control_plane"),
    expected_evidence: ensureStringArray(normalized.expected_evidence, "expected_evidence"),
    comparison_dimensions: ensureStringArray(
      normalized.comparison_dimensions,
      "comparison_dimensions"
    ),
    curator_notes: ensureString(normalized.curator_notes, "curator_notes")
  };
}

export function validateIndex(index) {
  const normalized = ensureObject(index, INDEX_FILE_NAME);

  if (normalized.schema_version !== 1) {
    throw new Error("index.json schema_version must be 1");
  }

  const splits = ensureObject(normalized.splits, "splits");
  const devSplit = ensureObject(splits.dev, "splits.dev");
  const holdoutSplit = ensureObject(splits.holdout, "splits.holdout");

  return {
    schema_version: 1,
    corpus_revision: ensureInteger(normalized.corpus_revision, "corpus_revision"),
    updated_at: ensureIsoTimestamp(normalized.updated_at, "updated_at"),
    splits: {
      dev: {
        task_ids: ensureTaskIdArray(devSplit.task_ids, "splits.dev.task_ids")
      },
      holdout: {
        task_ids: ensureTaskIdArray(holdoutSplit.task_ids, "splits.holdout.task_ids"),
        note: ensureString(holdoutSplit.note, "splits.holdout.note")
      }
    },
    task_ids: ensureTaskIdArray(normalized.task_ids, "task_ids"),
    holdout_ids: ensureTaskIdArray(normalized.holdout_ids, "holdout_ids"),
    notes: ensureStringArray(normalized.notes, "notes")
  };
}

function validateNoReplayableHoldoutContent(entry) {
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value !== "string") {
      continue;
    }

    if (value.includes(".factory/runs/")) {
      throw new Error(
        `holdout entry "${entry.task_id}" must not include repo artifact paths in field "${key}"`
      );
    }

    if (/approved-issue|acceptance-tests|review\.json|spec\.md|plan\.md|prompt/i.test(value)) {
      throw new Error(
        `holdout entry "${entry.task_id}" must not include replayable task content in field "${key}"`
      );
    }
  }
}

export function validateHoldoutManifest(holdoutManifest) {
  const normalized = ensureObject(holdoutManifest, HOLDOUT_FILE_NAME);

  if (normalized.schema_version !== 1) {
    throw new Error("holdout-manifest.json schema_version must be 1");
  }

  const entries = ensureArray(normalized.entries, "entries");
  const seenIds = new Set();

  const validatedEntries = entries.map((entry, index) => {
    const item = ensureObject(entry, `entries[${index}]`);
    const taskId = ensureString(item.task_id, `entries[${index}].task_id`);

    if (seenIds.has(taskId)) {
      throw new Error(`entries contains duplicate holdout task_id "${taskId}"`);
    }
    seenIds.add(taskId);

    const status = ensureString(item.status, `entries[${index}].status`);
    if (!ALLOWED_HOLDOUT_STATUSES.has(status)) {
      throw new Error(
        `entries[${index}].status must be one of: ${Array.from(ALLOWED_HOLDOUT_STATUSES).join(", ")}`
      );
    }

    const normalizedEntry = {
      task_id: taskId,
      status,
      provenance: ensureString(item.provenance, `entries[${index}].provenance`),
      owner: ensureString(item.owner, `entries[${index}].owner`),
      last_reviewed_at: ensureIsoTimestamp(
        item.last_reviewed_at,
        `entries[${index}].last_reviewed_at`
      ),
      notes: ensureString(item.notes, `entries[${index}].notes`),
      external_storage_reference: ensureString(
        item.external_storage_reference,
        `entries[${index}].external_storage_reference`
      )
    };

    validateNoReplayableHoldoutContent(normalizedEntry);
    return normalizedEntry;
  });

  return {
    schema_version: 1,
    holdout_revision: ensureInteger(normalized.holdout_revision, "holdout_revision"),
    entries: validatedEntries
  };
}

function loadTaskManifests(tasksDir, repoRoot) {
  const entries = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map((entry) => {
    const filePath = path.join(tasksDir, entry.name);
    const manifest = validateTaskManifest(parseJsonFile(filePath), repoRoot);

    return {
      filePath,
      manifest
    };
  });
}

export function validateEvalCorpus(corpusRoot = DEFAULT_CORPUS_ROOT, repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot, corpusRoot);
  const index = validateIndex(parseJsonFile(path.join(root, INDEX_FILE_NAME)));
  const holdout = validateHoldoutManifest(parseJsonFile(path.join(root, HOLDOUT_FILE_NAME)));
  const taskEntries = loadTaskManifests(path.join(root, TASKS_DIR_NAME), repoRoot);
  const taskIds = taskEntries.map((entry) => entry.manifest.task_id);
  const uniqueTaskIds = new Set(taskIds);

  if (uniqueTaskIds.size !== taskIds.length) {
    throw new Error("task manifests contain duplicate task_id values");
  }

  const sortedTaskIds = [...taskIds].sort();
  const sortedIndexTaskIds = [...index.task_ids].sort();
  if (JSON.stringify(sortedTaskIds) !== JSON.stringify(sortedIndexTaskIds)) {
    throw new Error("index.json task_ids must match the task manifests on disk");
  }

  const sortedDevTaskIds = [...index.splits.dev.task_ids].sort();
  if (JSON.stringify(sortedDevTaskIds) !== JSON.stringify(sortedTaskIds)) {
    throw new Error("splits.dev.task_ids must match index.json task_ids");
  }

  const holdoutIds = holdout.entries.map((entry) => entry.task_id).sort();
  const sortedIndexHoldoutIds = [...index.holdout_ids].sort();
  const sortedSplitHoldoutIds = [...index.splits.holdout.task_ids].sort();

  if (JSON.stringify(holdoutIds) !== JSON.stringify(sortedIndexHoldoutIds)) {
    throw new Error("index.json holdout_ids must match holdout-manifest.json");
  }

  if (JSON.stringify(holdoutIds) !== JSON.stringify(sortedSplitHoldoutIds)) {
    throw new Error("splits.holdout.task_ids must match holdout-manifest.json");
  }

  return {
    corpusRoot: root,
    corpusRevision: index.corpus_revision,
    taskCount: taskEntries.length,
    holdoutCount: holdout.entries.length,
    taskIds: taskEntries.map((entry) => entry.manifest.task_id)
  };
}

export function main(argv = process.argv.slice(2)) {
  const corpusRootArg = argv[0] || DEFAULT_CORPUS_ROOT;
  const result = validateEvalCorpus(corpusRootArg, process.cwd());
  process.stdout.write(
    `Validated eval corpus at ${corpusRootArg} (${result.taskCount} dev tasks, ${result.holdoutCount} holdout entries).\n`
  );
  return result;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
