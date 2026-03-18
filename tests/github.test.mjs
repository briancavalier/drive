import test from "node:test";
import assert from "node:assert/strict";
import {
  createIssue,
  githubGraphql,
  githubRequest,
  normalizeMethod,
  searchIssues,
  shouldRetryRequest
} from "../scripts/lib/github.mjs";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function withRepoEnv(fn) {
  const previousRepository = process.env.GITHUB_REPOSITORY;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousFactoryToken = process.env.FACTORY_GITHUB_TOKEN;
  const previousGhToken = process.env.GH_TOKEN;

  process.env.GITHUB_REPOSITORY = "example/repo";
  process.env.GITHUB_TOKEN = "test-token";
  delete process.env.FACTORY_GITHUB_TOKEN;
  delete process.env.GH_TOKEN;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.env.GITHUB_REPOSITORY = previousRepository;
      process.env.GITHUB_TOKEN = previousToken;
      process.env.FACTORY_GITHUB_TOKEN = previousFactoryToken;
      process.env.GH_TOKEN = previousGhToken;
    });
}

test("normalizeMethod uppercases and defaults to GET", () => {
  assert.equal(normalizeMethod(undefined), "GET");
  assert.equal(normalizeMethod("patch"), "PATCH");
});

test("shouldRetryRequest only retries safe reads by default", () => {
  assert.equal(shouldRetryRequest({ method: "GET" }), true);
  assert.equal(shouldRetryRequest({ method: "HEAD" }), true);
  assert.equal(shouldRetryRequest({ method: "POST" }), false);
  assert.equal(shouldRetryRequest({ method: "PATCH" }), false);
});

test("githubRequest retries transient GET failures", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    calls += 1;

    if (calls === 1) {
      return jsonResponse(503, { message: "temporarily unavailable" });
    }

    return jsonResponse(200, { ok: true });
  };

  await withRepoEnv(async () => {
    const response = await githubRequest("/test");
    assert.deepEqual(response, { ok: true });
  });

  globalThis.fetch = previousFetch;
  assert.equal(calls, 2);
});

test("githubRequest prefers FACTORY_GITHUB_TOKEN when present", async () => {
  let authorization = "";
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options = {}) => {
    authorization = options.headers.Authorization;
    return jsonResponse(200, { ok: true });
  };

  await withRepoEnv(async () => {
    process.env.FACTORY_GITHUB_TOKEN = "factory-token";
    const response = await githubRequest("/test");
    assert.deepEqual(response, { ok: true });
  });

  globalThis.fetch = previousFetch;
  assert.equal(authorization, "Bearer factory-token");
});

test("githubRequest falls back to GH_TOKEN when other tokens are absent", async () => {
  let authorization = "";
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options = {}) => {
    authorization = options.headers.Authorization;
    return jsonResponse(200, { ok: true });
  };

  await withRepoEnv(async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh-token";
    const response = await githubRequest("/test");
    assert.deepEqual(response, { ok: true });
  });

  globalThis.fetch = previousFetch;
  assert.equal(authorization, "Bearer gh-token");
});

test("githubRequest does not retry transient POST failures", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(503, { message: "temporarily unavailable" });
  };

  await withRepoEnv(async () => {
    await assert.rejects(githubRequest("/test", { method: "POST" }), /GitHub API 503/);
  });

  globalThis.fetch = previousFetch;
  assert.equal(calls, 1);
});

test("githubRequest does not retry transient PATCH transport errors", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("fetch failed");
  };

  await withRepoEnv(async () => {
    await assert.rejects(githubRequest("/test", { method: "PATCH" }), /fetch failed/);
  });

  globalThis.fetch = previousFetch;
  assert.equal(calls, 1);
});

test("githubGraphql disables retries for mutations", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(503, { message: "temporarily unavailable" });
  };

  await withRepoEnv(async () => {
    await assert.rejects(
      githubGraphql("mutation { markPullRequestReadyForReview(input: { pullRequestId: \"1\" }) { clientMutationId } }"),
      /GitHub API 503/
    );
  });

  globalThis.fetch = previousFetch;
  assert.equal(calls, 1);
});

test("createIssue posts minimal payload without labels", async () => {
  let requestPath = "";
  let requestMethod = "";
  let requestBody = null;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    requestPath = url;
    requestMethod = options.method;
    requestBody = JSON.parse(options.body);
    return jsonResponse(201, { number: 42 });
  };

  await withRepoEnv(async () => {
    const response = await createIssue({ title: "Follow-up", body: "Details" });
    assert.equal(response.number, 42);
  });

  globalThis.fetch = previousFetch;
  assert.equal(requestPath, "https://api.github.com/repos/example/repo/issues");
  assert.equal(requestMethod, "POST");
  assert.deepEqual(requestBody, { title: "Follow-up", body: "Details" });
});

test("createIssue includes labels when provided", async () => {
  let requestBody = null;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse(201, { number: 7 });
  };

  await withRepoEnv(async () => {
    await createIssue({ title: "With labels", body: "Body", labels: ["Factory Request"] });
  });

  globalThis.fetch = previousFetch;
  assert.deepEqual(requestBody, {
    title: "With labels",
    body: "Body",
    labels: ["Factory Request"]
  });
});

test("searchIssues prefixes repo qualifier when missing", async () => {
  let requestPath = "";
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    requestPath = url;
    return jsonResponse(200, { items: [] });
  };

  await withRepoEnv(async () => {
    await searchIssues({ query: "state:open test" });
  });

  globalThis.fetch = previousFetch;
  assert.match(
    requestPath,
    /\/search\/issues\?q=repo%3Aexample%2Frepo\+state%3Aopen\+test/
  );
});

test("searchIssues preserves existing repo qualifier", async () => {
  let requestPath = "";
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    requestPath = url;
    return jsonResponse(200, { items: [] });
  };

  await withRepoEnv(async () => {
    await searchIssues({ query: "repo:other/repo state:open test", perPage: 5 });
  });

  globalThis.fetch = previousFetch;
  assert.match(requestPath, /per_page=5/);
  assert.match(
    requestPath,
    /\/search\/issues\?q=repo%3Aother%2Frepo\+state%3Aopen\+test/
  );
});
