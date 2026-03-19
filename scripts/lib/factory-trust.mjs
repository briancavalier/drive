import { isFactoryBranch, issueArtifactsPath } from "./factory-config.mjs";
import { extractPrMetadata } from "./pr-metadata.mjs";

function normalizeRepositoryFullName(value) {
  return `${value || ""}`.trim();
}

function normalizeBranchName(value) {
  return `${value || ""}`.trim();
}

function normalizeArtifactsPath(value) {
  return `${value || ""}`.trim();
}

function normalizeSha(value) {
  return `${value || ""}`.trim();
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveExpectedRepositoryFullName(payload, pullRequest) {
  return (
    normalizeRepositoryFullName(payload?.repositoryFullName) ||
    normalizeRepositoryFullName(payload?.repository?.full_name) ||
    normalizeRepositoryFullName(pullRequest?.base?.repo?.full_name)
  );
}

function resolveHeadRepositoryContext(pullRequest) {
  return {
    fullName: normalizeRepositoryFullName(pullRequest?.head?.repo?.full_name),
    fork: pullRequest?.head?.repo?.fork === true
  };
}

export function validateFactoryRepoTrust(payload, pullRequest) {
  const expectedRepositoryFullName = resolveExpectedRepositoryFullName(
    payload,
    pullRequest
  );
  const headRepository = resolveHeadRepositoryContext(pullRequest);

  if (!expectedRepositoryFullName) {
    return {
      trusted: false,
      reason: "missing expected repository metadata"
    };
  }

  if (!headRepository.fullName) {
    return {
      trusted: false,
      reason: "missing pull request head repository metadata"
    };
  }

  if (headRepository.fork) {
    return {
      trusted: false,
      reason: `fork-backed PR head ${headRepository.fullName}`
    };
  }

  if (headRepository.fullName !== expectedRepositoryFullName) {
    return {
      trusted: false,
      reason:
        `pull request head repo ${headRepository.fullName} does not match expected repository ${expectedRepositoryFullName}`
    };
  }

  return {
    trusted: true,
    repositoryFullName: expectedRepositoryFullName
  };
}

export function validateTrustedFactoryContext({
  payload = {},
  pullRequest,
  candidateBranch = "",
  candidateHeadSha = "",
  candidateIssueNumber = null,
  candidateArtifactsPath = ""
} = {}) {
  if (!pullRequest) {
    return {
      trusted: false,
      reason: "missing pull request context"
    };
  }

  const repoTrust = validateFactoryRepoTrust(payload, pullRequest);

  if (!repoTrust.trusted) {
    return repoTrust;
  }

  const metadata = extractPrMetadata(pullRequest.body);

  if (!metadata) {
    return {
      trusted: false,
      reason: "missing or invalid factory PR metadata"
    };
  }

  const issueNumber = normalizePositiveInteger(metadata.issueNumber);

  if (!issueNumber) {
    return {
      trusted: false,
      reason: "pull request metadata issueNumber must be a positive integer"
    };
  }

  const branch = normalizeBranchName(pullRequest?.head?.ref);

  if (!branch) {
    return {
      trusted: false,
      reason: "missing pull request head ref"
    };
  }

  if (!isFactoryBranch(branch)) {
    return {
      trusted: false,
      reason: `pull request head ref ${branch} is not a factory branch`
    };
  }

  const artifactsPath = issueArtifactsPath(issueNumber);
  const metadataArtifactsPath = normalizeArtifactsPath(metadata.artifactsPath);

  if (!metadataArtifactsPath) {
    return {
      trusted: false,
      reason: "missing factory artifactsPath in PR metadata"
    };
  }

  if (metadataArtifactsPath !== artifactsPath) {
    return {
      trusted: false,
      reason:
        `pull request metadata artifactsPath ${metadataArtifactsPath} does not match canonical path ${artifactsPath}`
    };
  }

  const normalizedCandidateBranch = normalizeBranchName(candidateBranch);

  if (normalizedCandidateBranch && normalizedCandidateBranch !== branch) {
    return {
      trusted: false,
      reason:
        `input branch ${normalizedCandidateBranch} does not match pull request head ref ${branch}`
    };
  }

  const normalizedCandidateHeadSha = normalizeSha(candidateHeadSha);
  const liveHeadSha = normalizeSha(pullRequest?.head?.sha);

  if (normalizedCandidateHeadSha) {
    if (!liveHeadSha) {
      return {
        trusted: false,
        reason: "missing pull request head SHA"
      };
    }

    if (normalizedCandidateHeadSha !== liveHeadSha) {
      return {
        trusted: false,
        reason:
          `workflow run head SHA ${normalizedCandidateHeadSha} does not match pull request head SHA ${liveHeadSha}`
      };
    }
  }

  if (candidateIssueNumber !== null && candidateIssueNumber !== undefined && `${candidateIssueNumber}` !== "") {
    const normalizedCandidateIssueNumber = normalizePositiveInteger(candidateIssueNumber);

    if (!normalizedCandidateIssueNumber) {
      return {
        trusted: false,
        reason: `input issue number ${candidateIssueNumber} is not a positive integer`
      };
    }

    if (normalizedCandidateIssueNumber !== issueNumber) {
      return {
        trusted: false,
        reason:
          `input issue number ${normalizedCandidateIssueNumber} does not match pull request metadata issue number ${issueNumber}`
      };
    }
  }

  const normalizedCandidateArtifactsPath = normalizeArtifactsPath(candidateArtifactsPath);

  if (normalizedCandidateArtifactsPath && normalizedCandidateArtifactsPath !== artifactsPath) {
    return {
      trusted: false,
      reason:
        `input artifacts path ${normalizedCandidateArtifactsPath} does not match canonical path ${artifactsPath}`
    };
  }

  return {
    trusted: true,
    repositoryFullName: repoTrust.repositoryFullName,
    issueNumber,
    branch,
    headSha: liveHeadSha,
    artifactsPath,
    metadata
  };
}
