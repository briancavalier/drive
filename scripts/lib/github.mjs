const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_SERVER_URL = "https://github.com";
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_POLICY = {
  safe: "safe",
  never: "never"
};

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

function isTransientErrorMessage(message) {
  return /fetch failed|econnreset|etimedout|enotfound|eai_again|timed out/i.test(
    `${message || ""}`
  );
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function normalizeMethod(method) {
  return `${method || "GET"}`.trim().toUpperCase() || "GET";
}

export function shouldRetryRequest({ method, retryPolicy = RETRY_POLICY.safe }) {
  const normalizedMethod = normalizeMethod(method);

  if (retryPolicy === RETRY_POLICY.never) {
    return false;
  }

  return normalizedMethod === "GET" || normalizedMethod === "HEAD";
}

export function getRepoContext() {
  const [owner, repo] = `${process.env.GITHUB_REPOSITORY || ""}`.split("/");
  const token =
    process.env.FACTORY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY is required");
  }

  if (!token) {
    throw new Error("FACTORY_GITHUB_TOKEN, GITHUB_TOKEN, or GH_TOKEN is required");
  }

  return {
    owner,
    repo,
    token,
    apiUrl: process.env.GITHUB_API_URL || DEFAULT_API_URL,
    serverUrl: process.env.GITHUB_SERVER_URL || DEFAULT_SERVER_URL
  };
}

export async function githubRequest(path, options = {}) {
  const context = getRepoContext();
  const method = normalizeMethod(options.method);
  const retryable = shouldRetryRequest({
    method,
    retryPolicy: options.retryPolicy || RETRY_POLICY.safe
  });
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(`${context.apiUrl}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${context.token}`,
          "Content-Type": "application/json",
          "User-Agent": "github-native-autonomous-factory",
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        if (retryable && isTransientStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
          attempt += 1;
          await delay(500 * attempt);
          continue;
        }

        throw new Error(`GitHub API ${response.status}: ${JSON.stringify(payload)}`);
      }

      return payload;
    } catch (error) {
      if (
        retryable &&
        attempt < MAX_TRANSIENT_RETRIES &&
        isTransientErrorMessage(error.message)
      ) {
        attempt += 1;
        await delay(500 * attempt);
        continue;
      }

      throw error;
    }
  }
}

export async function githubGraphql(query, variables = {}) {
  return githubRequest("/graphql", {
    method: "POST",
    retryPolicy: RETRY_POLICY.never,
    body: {
      query,
      variables
    }
  });
}

export async function ensureLabels(labelDefinitions) {
  const { owner, repo } = getRepoContext();

  for (const definition of labelDefinitions) {
    try {
      await githubRequest(`/repos/${owner}/${repo}/labels/${encodeURIComponent(definition.name)}`);
      await githubRequest(`/repos/${owner}/${repo}/labels/${encodeURIComponent(definition.name)}`, {
        method: "PATCH",
        body: definition
      });
    } catch (error) {
      if (`${error.message}`.includes("404")) {
        await githubRequest(`/repos/${owner}/${repo}/labels`, {
          method: "POST",
          body: definition
        });
        continue;
      }

      throw error;
    }
  }
}

export async function getCollaboratorPermission(username) {
  const { owner, repo } = getRepoContext();

  return githubRequest(
    `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}/permission`
  );
}

export async function createPullRequest({ title, head, base, body, draft }) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: { title, head, base, body, draft }
  });
}

export async function updatePullRequest({ prNumber, body }) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: "PATCH",
    body: { body }
  });
}

export async function getPullRequest(prNumber) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`);
}

export async function getIssue(issueNumber) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

export async function addLabels(issueNumber, labels) {
  const { owner, repo } = getRepoContext();

  if (!labels.length) {
    return null;
  }

  return githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: { labels }
  });
}

export async function removeLabel(issueNumber, label) {
  const { owner, repo } = getRepoContext();

  try {
    return await githubRequest(
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    if (`${error.message}`.includes("404")) {
      return null;
    }

    throw error;
  }
}

export async function commentOnIssue(issueNumber, body) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: { body }
  });
}

export async function createIssue({ title, body, labels } = {}) {
  const { owner, repo } = getRepoContext();
  const payload = {
    title,
    body
  };

  if (Array.isArray(labels) && labels.length > 0) {
    payload.labels = labels;
  }

  return githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: payload
  });
}

export async function searchIssues({ query, sort, order, perPage } = {}) {
  const { owner, repo } = getRepoContext();
  const qualifiers = `repo:${owner}/${repo}`;
  const sanitizedQuery = `${query || ""}`.trim();
  const finalQuery = sanitizedQuery.includes("repo:") ? sanitizedQuery : `${qualifiers} ${sanitizedQuery}`.trim();
  const params = new URLSearchParams();

  if (finalQuery) {
    params.set("q", finalQuery);
  } else {
    params.set("q", qualifiers);
  }

  if (sort) {
    params.set("sort", sort);
  }

  if (order) {
    params.set("order", order);
  }

  if (perPage) {
    params.set("per_page", `${perPage}`);
  }

  return githubRequest(`/search/issues?${params.toString()}`);
}

export async function submitPullRequestReview({ prNumber, event, body }) {
  const { owner, repo } = getRepoContext();
  const normalizedEvent = `${event || ""}`.toUpperCase();

  if (!["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(normalizedEvent)) {
    throw new Error(`Unsupported pull request review event: ${event}`);
  }

  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    body: {
      event: normalizedEvent,
      body: body || ""
    }
  });
}

export async function findOpenPullRequestByHead(branch) {
  const { owner, repo } = getRepoContext();

  const results = await githubRequest(
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`
  );

  return results[0] || null;
}

export async function getReview(prNumber, reviewId) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}`);
}

export async function listReviewComments(prNumber, reviewId) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`);
}

export async function listWorkflowRunJobs(runId) {
  const { owner, repo } = getRepoContext();

  return githubRequest(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
}

export async function markReadyForReview(pullRequestId) {
  return githubGraphql(
    `
      mutation MarkReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            id
            isDraft
          }
        }
      }
    `,
    { pullRequestId }
  );
}

export async function convertPullRequestToDraft(pullRequestId) {
  return githubGraphql(
    `
      mutation ConvertToDraft($pullRequestId: ID!) {
        convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            id
            isDraft
          }
        }
      }
    `,
    { pullRequestId }
  );
}
