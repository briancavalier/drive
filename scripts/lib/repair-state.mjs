import {
  getFailureCounter,
  getFailureSignature
} from "./intervention-state.mjs";

export function normalizeFailureSignature(signature) {
  return `${signature || ""}`.trim().toLowerCase().slice(0, 240) || null;
}

export function nextRepairState(metadata, signature) {
  const normalized = normalizeFailureSignature(signature);
  const repairAttempts = Number(metadata?.repairAttempts || 0) + 1;
  const maxRepairAttempts = Number(metadata?.maxRepairAttempts || 0);
  const repeatedFailureCount =
    normalized && normalized === getFailureSignature(metadata)
      ? getFailureCounter(metadata, "repeatedFailureCount") + 1
      : 0;
  const blocked =
    (maxRepairAttempts > 0 && repairAttempts > maxRepairAttempts) ||
    repeatedFailureCount >= 2;

  return {
    repairAttempts,
    maxRepairAttempts,
    lastFailureSignature: normalized,
    repeatedFailureCount,
    blocked
  };
}
