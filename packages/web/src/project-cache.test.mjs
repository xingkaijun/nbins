import test from "node:test";
import assert from "node:assert/strict";

import { fetchProjects, invalidateProjectsCache } from "./api/projects.ts";
import { deleteProject, importDatabase, importProject } from "./api/sql-console.ts";

// These run the real API functions (no injected cache) against a stubbed fetch,
// so they cover what the UI actually calls — not just request-cache.ts.
// The project cache is module state, so every test starts from a clear one.

const SECRET = "sql-secret";

/** Installs a fetch stub and starts from an empty project cache. */
async function withStubbedFetch(handler, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  invalidateProjectsCache();
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
    invalidateProjectsCache();
  }
}

function projectsResponse(projects) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: projects })
  };
}

function sqlResponse(data = { id: "p1" }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data })
  };
}

test("the project list is served from cache within its TTL", async () => {
  await withStubbedFetch(() => projectsResponse([{ id: "p1" }]), async (calls) => {
    const first = await fetchProjects();
    const second = await fetchProjects();
    assert.equal(calls.length, 1, "one /projects request for two reads");
    assert.deepEqual(second, first);
  });
});

test("invalidateProjectsCache forces the next read to refetch", async () => {
  await withStubbedFetch(() => projectsResponse([{ id: "p1" }]), async (calls) => {
    await fetchProjects();
    invalidateProjectsCache();
    await fetchProjects();
    assert.equal(calls.length, 2);
  });
});

const sqlMutations = [
  ["deleteProject", () => deleteProject("p1", SECRET)],
  ["importProject", () => importProject({ project: {} }, SECRET)],
  ["importDatabase", () => importDatabase({ projects: [] }, SECRET)]
];

for (const [name, runMutation] of sqlMutations) {
  test(`${name} invalidates the cached project list`, async () => {
    await withStubbedFetch(
      (url) => (url.includes("/sql/") ? sqlResponse() : projectsResponse([{ id: "p1" }])),
      async (calls) => {
        await fetchProjects();
        assert.equal(calls.length, 1);

        await runMutation();

        const refreshed = await fetchProjects();
        assert.equal(calls.length, 3, "project list refetched after the SQL mutation");
        assert.deepEqual(refreshed, [{ id: "p1" }]);
      }
    );
  });
}

test("a failed SQL mutation leaves the cached project list in place", async () => {
  await withStubbedFetch(
    (url) => url.includes("/sql/delete-project/")
      ? { ok: false, status: 500, json: async () => ({ ok: false, error: "boom" }) }
      : projectsResponse([{ id: "p1" }]),
    async (calls) => {
      await fetchProjects();
      await assert.rejects(() => deleteProject("p1", SECRET), /boom/);

      await fetchProjects();
      assert.equal(calls.length, 2, "only the SQL call and the initial read");
    }
  );
});

test("SQL mutations still fail loudly on a bad secret", async () => {
  await withStubbedFetch(
    () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: "Bad secret" }) }),
    async () => {
      await assert.rejects(() => deleteProject("p1", "wrong"), /Bad secret/);
    }
  );
});
