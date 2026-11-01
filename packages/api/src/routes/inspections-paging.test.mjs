import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import { issueAccessToken } from "../auth/jwt.ts";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";
import { createTestEnv } from "../test-support/test-database.mjs";
// The Dashboard's former client-side filter: the paged API must return exactly what it kept.
import { filterDashboardItems } from "../../../web/src/dashboard-filters.ts";

// Server-side paging, stats, export, Reports aggregates, permission scoping and
// the transactional version check, on the real schema over in-memory SQLite.
// The baseline fixture has one item per project; seedMany() adds a few dozen
// more with varied dates, hulls, disciplines, results and comments.

const TODAY = "2026-11-01";
const DISCIPLINES = ["PAINT", "MACH", "HULL", "CCS"];
const RESULTS = [null, "AA", "QCC", "OWC", "RJ", "CX"];

function header(claims) {
  return issueAccessToken(claims, {}).then((token) => ({ authorization: `Bearer ${token}` }));
}
const LI = { id: "user-inspector-li", role: "inspector", disciplines: ["PAINT", "MACH"] };
const WANG = { id: "user-inspector-wang", role: "inspector", disciplines: ["CCS", "HULL"] };
const ADMIN = { id: "user-admin-chen", role: "admin", disciplines: [] };
const NOBODY = { id: "user-no-membership", role: "inspector", disciplines: ["PAINT"] };

async function run(env, sql, ...params) {
  await env.DB.prepare(sql).bind(...params).run();
}

async function seedMany(env) {
  const now = "2026-04-03T09:00:00.000Z";
  await run(env, `INSERT INTO ships (id, projectId, hullNumber, shipName, status, createdAt, updatedAt) VALUES ('ship-h2749', 'project-hd-lng', 'H-2749', 'NB2749', 'building', ?, ?)`, now, now);
  const ships = ["ship-h2748", "ship-h2749", "ship-h2751"];
  const dates = ["2026-10-30", "2026-10-31", TODAY, TODAY, "2026-11-02", ""];
  for (let n = 0; n < 48; n += 1) {
    const id = `seed-${String(n).padStart(2, "0")}`;
    const ship = ships[n % 3];
    const discipline = DISCIPLINES[n % 4];
    const result = RESULTS[n % 6];
    const round = (n % 5) + 1 > 2 ? 2 : 1;
    const status = result === "AA" || result === "CX" ? "closed" : result ? "open" : "pending";
    const name = n % 7 === 0 ? `Ballast Tank Fairing ${n}` : `Block Weld Survey ${n}`;
    await run(
      env,
      `INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, lastRoundResult, resolvedResult, currentRound, openCommentsCount, version, source, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 'manual', ?, ?)`,
      id, ship, name, name.toLowerCase(), discipline, status, result, round, n % 3, now, now
    );
    for (let r = 1; r <= round; r += 1) {
      await run(
        env,
        `INSERT INTO inspection_rounds (id, inspectionItemId, roundNumber, rawItemName, plannedDate, actualDate, yardQc, result, source, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NULL, 'QC', ?, 'manual', ?, ?)`,
        `${id}-r${r}`, id, r, name, r === round ? dates[n % 6] : "2026-09-01", r === round ? result : "RJ", now, now
      );
    }
    for (let c = 0; c < n % 3; c += 1) {
      const createdAt = c === 0 ? `2026-10-${String(20 + (n % 10)).padStart(2, "0")}T08:00:00.000Z` : "2026-10-31 23:30:00";
      await run(
        env,
        `INSERT INTO comments (id, inspectionItemId, createdInRoundId, authorId, localId, content, status, isHighlighted, createdAt, updatedAt)
         VALUES (?, ?, ?, 'user-inspector-li', ?, 'Check this', 'open', 0, ?, ?)`,
        `${id}-c${c}`, id, `${id}-r${round}`, 100 + n * 3 + c, createdAt, createdAt
      );
    }
  }
}

async function setup() {
  const app = createApp();
  const env = createTestEnv(createBaselineInspectionStorage());
  // Run one request first so the schema/seed gate has initialised the database.
  await app.request("http://localhost/api/inspections", { headers: await header(ADMIN) }, env);
  await seedMany(env);
  await run(env, `INSERT INTO users (id, username, displayName, passwordHash, role, disciplines, accessibleProjectIds, isActive, createdAt, updatedAt)
    VALUES ('user-no-membership', 'no.membership', 'No Membership', 'disabled', 'inspector', '["PAINT"]', '[]', 1, '2026-04-04T00:00:00.000Z', '2026-04-04T00:00:00.000Z')`);
  return {
    env,
    async get(path, claims = ADMIN) {
      const response = await app.request(`http://localhost${path}`, { headers: await header(claims) }, env);
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    async put(path, body, claims = ADMIN) {
      const response = await app.request(
        `http://localhost${path}`,
        { method: "PUT", headers: { ...(await header(claims)), "content-type": "application/json" }, body: JSON.stringify(body) },
        env
      );
      return { status: response.status, body: await response.json().catch(() => null) };
    }
  };
}

function legacyFilter(items, { mode = "date", date = TODAY, hull = "ALL", discipline = "ALL", keyword = "" }) {
  return filterDashboardItems(items, { mode: mode === "all" ? "date" : mode, date: mode === "all" ? "" : date, hull, discipline, keyword, page: 1, pageSize: 25 });
}

const ids = (items) => items.map((item) => item.id).sort();

test("paged list returns the same items as the legacy list for every filter, one page at a time", async () => {
  const api = await setup();
  const legacy = await api.get("/api/inspections");
  assert.equal(legacy.status, 200);
  const all = legacy.body.data.items;
  assert.ok(all.length >= 50, `seeded list has ${all.length} items`);

  const cases = [
    { mode: "all" },
    { mode: "date", date: TODAY },
    { mode: "pending" },
    { mode: "open-comments" },
    { mode: "open-comments", hull: "H-2751" },
    { mode: "date", date: "2026-10-30", keyword: "survey" },
    { mode: "all", hull: "H-2749" },
    { mode: "all", discipline: "CCS" },
    { mode: "date", date: TODAY, discipline: "PAINT", hull: "H-2748" },
    { mode: "date", date: TODAY, keyword: "ballast" }
  ];
  for (const filter of cases) {
    const expected = legacyFilter(all, filter);
    const params = new URLSearchParams({ mode: filter.mode, date: filter.date ?? "", hull: filter.hull ?? "ALL", discipline: filter.discipline ?? "ALL", q: filter.keyword ?? "", pageSize: "7" });
    const collected = [];
    let page = 1;
    let pageCount = 1;
    do {
      params.set("page", String(page));
      const res = await api.get(`/api/inspections?${params}`);
      assert.equal(res.status, 200, JSON.stringify(filter));
      assert.equal(res.body.data.total, expected.length, `total for ${JSON.stringify(filter)}`);
      assert.ok(res.body.data.items.length <= 7);
      pageCount = res.body.data.pageCount;
      collected.push(...res.body.data.items);
      page += 1;
    } while (page <= pageCount);
    assert.deepEqual(ids(collected), ids(expected), `items for ${JSON.stringify(filter)}`);
    assert.equal(new Set(collected.map((item) => item.id)).size, collected.length, "no item appears on two pages");
  }
});

test("paged list stats count every filtered item, not only the page", async () => {
  const api = await setup();
  const all = (await api.get("/api/inspections")).body.data.items;
  const res = await api.get("/api/inspections?mode=all&page=1&pageSize=5");
  const { stats } = res.body.data;
  assert.equal(res.body.data.items.length, 5);
  assert.equal(stats.total, all.length);
  assert.equal(stats.pending, all.filter((item) => item.workflowStatus === "pending").length);
  assert.equal(stats.accepted, all.filter((item) => item.currentResult === "AA").length);
  assert.equal(stats.qcRecheck, all.filter((item) => item.currentResult === "QCC").length);
  assert.equal(stats.rejected, all.filter((item) => item.currentResult === "RJ").length);
  assert.equal(stats.openComments, all.reduce((sum, item) => sum + item.openComments, 0));
  const byDiscipline = {};
  for (const item of all) byDiscipline[item.discipline] = (byDiscipline[item.discipline] ?? 0) + 1;
  assert.deepEqual(stats.byDiscipline, byDiscipline);
});

test("paged list returns hull/discipline options only when facets=1 and clamps paging input", async () => {
  const api = await setup();
  const withFacets = await api.get("/api/inspections?mode=all&page=1&pageSize=10&facets=1");
  assert.deepEqual(withFacets.body.data.hulls, ["H-2748", "H-2749", "H-2751"]);
  assert.deepEqual(withFacets.body.data.disciplines, ["CCS", "MACH", "PAINT"].concat("HULL").sort());
  const without = await api.get("/api/inspections?mode=all&page=1&pageSize=10");
  assert.equal(without.body.data.hulls, undefined);
  const beyond = await api.get("/api/inspections?mode=all&page=999&pageSize=10");
  assert.equal(beyond.status, 200);
  assert.ok(beyond.body.data.page <= beyond.body.data.pageCount);
});

test("paged list, export and reports are scoped to the caller's projects", async () => {
  const api = await setup();
  const li = await api.get("/api/inspections?mode=all&page=1&pageSize=100&facets=1", LI);
  assert.equal(li.status, 200);
  assert.ok(li.body.data.items.length > 0);
  assert.ok(li.body.data.items.every((item) => item.projectCode === "P-001"), "li.si only sees project-hd-lng");
  assert.deepEqual(li.body.data.hulls, ["H-2748", "H-2749"]);

  const wang = await api.get("/api/inspections?mode=all&page=1&pageSize=100", WANG);
  assert.ok(wang.body.data.items.every((item) => item.hullNumber === "H-2751"));
  assert.equal(li.body.data.total + wang.body.data.total, (await api.get("/api/inspections?mode=all&page=1&pageSize=1")).body.data.total);

  const nobody = await api.get("/api/inspections?mode=all&page=1&pageSize=10", NOBODY);
  assert.equal(nobody.status, 200);
  assert.equal(nobody.body.data.total, 0);
  assert.deepEqual(nobody.body.data.items, []);

  const foreign = await api.get("/api/inspections?mode=all&page=1&pageSize=10&projectId=project-cssc-series", LI);
  assert.ok(foreign.status === 403 || foreign.body.data.total === 0, "another project's id never leaks its items");

  const exportLi = await api.get("/api/inspections/export?mode=all", LI);
  assert.equal(exportLi.status, 200);
  assert.equal(exportLi.body.data.items.length, li.body.data.total);

  const range = "startDate=2026-01-01&endDate=2026-12-31&startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.999Z";
  const reportForeign = await api.get(`/api/inspections/report-summary?${range}&projectId=project-cssc-series`, LI);
  assert.equal(reportForeign.status, 403);
  const reportNobody = await api.get(`/api/inspections/report-summary?${range}`, NOBODY);
  assert.equal(reportNobody.status, 200);
  assert.deepEqual(reportNobody.body.data, { hulls: [], disciplines: [], rows: [] });
  const reportLi = await api.get(`/api/inspections/report-summary?${range}`, LI);
  assert.deepEqual(reportLi.body.data.hulls, ["H-2748", "H-2749"]);
});

test("export returns every filtered item in the same order as the pages", async () => {
  const api = await setup();
  const pages = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await api.get(`/api/inspections?mode=all&page=${page}&pageSize=9`);
    pages.push(...res.body.data.items);
    if (page >= res.body.data.pageCount) break;
  }
  const exported = await api.get("/api/inspections/export?mode=all");
  assert.equal(exported.status, 200);
  assert.deepEqual(exported.body.data.items.map((item) => item.id), pages.map((item) => item.id));

  const filtered = await api.get("/api/inspections/export?mode=date&date=2026-11-01&discipline=PAINT");
  const paged = await api.get("/api/inspections?mode=date&date=2026-11-01&discipline=PAINT&page=1&pageSize=200");
  assert.deepEqual(filtered.body.data.items.map((item) => item.id), paged.body.data.items.map((item) => item.id));

  const anonymous = await createApp().request("http://localhost/api/inspections/export?mode=all", {}, api.env);
  assert.equal(anonymous.status, 401);
});

const SUBMIT = {
  result: "QCC",
  actualDate: "2026-11-01",
  submittedAt: "2026-11-01T12:00:00.000Z",
  submittedBy: "user-inspector-li",
  inspectorDisplayName: "Li Si",
  expectedVersion: 3,
  comments: [{ message: "Touch up stripe coat" }]
};

async function itemState(env, id) {
  const item = await env.DB.prepare(`SELECT version, lastRoundResult, openCommentsCount FROM inspection_items WHERE id = ?`).bind(id).first();
  const comments = await env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE inspectionItemId = ?`).bind(id).first();
  const rounds = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inspection_rounds WHERE inspectionItemId = ?`).bind(id).first();
  return { ...item, comments: Number(comments.n), rounds: Number(rounds.n) };
}

test("two saves with the same expectedVersion: the second gets 409 and writes nothing", async () => {
  const api = await setup();
  const before = await itemState(api.env, "insp-002");
  const [first, second] = await Promise.all([
    api.put("/api/inspections/insp-002/rounds/current/result", SUBMIT, LI),
    api.put("/api/inspections/insp-002/rounds/current/result", { ...SUBMIT, comments: [{ message: "Second writer" }] }, LI)
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const after = await itemState(api.env, "insp-002");
  assert.equal(after.version, before.version + 1, "exactly one write landed");
  assert.equal(after.comments, before.comments + 1, "only the winner's comment was stored");
  const loser = first.status === 409 ? first : second;
  assert.equal(loser.body.ok, false);
  assert.equal(loser.body.error, "Inspection item version conflict");
});

test("a version change between the read and the write rolls the whole batch back with 409", async () => {
  const api = await setup();
  const db = api.env.DB;
  const originalBatch = db.batch.bind(db);
  let interfered = false;
  // Simulate another writer committing after the route read version 3 but
  // before its batch runs: the guarded UPDATE matches no row.
  db.batch = async (statements) => {
    if (!interfered) {
      interfered = true;
      await db.prepare(`UPDATE inspection_items SET version = version + 1 WHERE id = 'insp-002'`).run();
    }
    return originalBatch(statements);
  };
  const before = await itemState(api.env, "insp-002");
  const res = await api.put("/api/inspections/insp-002/rounds/current/result", SUBMIT, LI);
  db.batch = originalBatch;
  assert.ok(interfered, "the write went through batch()");
  assert.equal(res.status, 409);
  const after = await itemState(api.env, "insp-002");
  assert.equal(after.version, before.version + 1, "only the simulated concurrent bump");
  assert.equal(after.comments, before.comments, "no comment from the rolled-back batch");
  assert.equal(after.rounds, before.rounds);
  assert.equal(after.lastRoundResult, before.lastRoundResult);
});

// The former client-side Reports computation (Reports.tsx before the aggregate
// endpoint), run on the legacy list + comments endpoints.
function legacyReport(items, comments, { start, end, startAt, endAt, hull = "ALL", discipline = "ALL" }) {
  const inDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(value ?? "") && value.slice(0, 10) >= start && value.slice(0, 10) <= end;
  const instant = (value) => (/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? Date.parse(value) : Date.parse(value.replace(" ", "T") + "Z"));
  const fi = items.filter((i) => inDate(i.plannedDate) && (hull === "ALL" || i.hullNumber === hull) && (discipline === "ALL" || i.discipline === discipline));
  const fc = comments.filter((c) => {
    const t = instant(c.createdAt);
    return t >= Date.parse(startAt) && t <= Date.parse(endAt) && (hull === "ALL" || c.hullNumber === hull) && (discipline === "ALL" || c.discipline === discipline);
  });
  const rows = {};
  const row = (d) => (rows[d] ??= { discipline: d, total: 0, acceptedAA: 0, qualifiedQCC: 0, rejectedRJ: 0, owc: 0, pending: 0, passedFirstRound: 0, comments: 0 });
  for (const i of fi) {
    const r = row(i.discipline || "UNKNOWN");
    r.total += 1;
    if (i.currentResult === "AA") r.acceptedAA += 1;
    else if (i.currentResult === "QCC") r.qualifiedQCC += 1;
    else if (i.currentResult === "RJ") r.rejectedRJ += 1;
    else if (i.currentResult === "OWC") r.owc += 1;
    else r.pending += 1;
    if ((i.currentResult === "AA" || i.currentResult === "QCC") && i.currentRound === 1) r.passedFirstRound += 1;
  }
  for (const c of fc) row(c.discipline || "UNKNOWN").comments += 1;
  return Object.values(rows).sort((a, b) => a.discipline.localeCompare(b.discipline));
}

test("report-summary matches the former client-side Reports numbers", async () => {
  const api = await setup();
  const items = (await api.get("/api/inspections")).body.data.items;
  const comments = (await api.get("/api/observations/inspection-comments")).body.data;
  assert.ok(comments.length > 20);
  const ranges = [
    { start: "2026-10-01", end: "2026-11-30", startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-11-30T23:59:59.999Z" },
    { start: "2026-11-01", end: "2026-11-01", startAt: "2026-10-25T00:00:00.000Z", endAt: "2026-10-31T23:59:59.999Z" },
    { start: "2026-10-31", end: "2026-11-02", startAt: "2026-10-31T00:00:00.000Z", endAt: "2026-10-31T23:00:00.000Z", hull: "H-2749" },
    { start: "2026-01-01", end: "2026-12-31", startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-12-31T23:59:59.999Z", discipline: "MACH" }
  ];
  for (const range of ranges) {
    const params = new URLSearchParams({ startDate: range.start, endDate: range.end, startAt: range.startAt, endAt: range.endAt, tzOffset: "0", hull: range.hull ?? "ALL", discipline: range.discipline ?? "ALL" });
    const res = await api.get(`/api/inspections/report-summary?${params}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.rows, legacyReport(items, comments, range), JSON.stringify(range));
  }
  const full = await api.get("/api/inspections/report-summary?startDate=2026-01-01&endDate=2026-12-31&startAt=2026-01-01T00:00:00Z&endAt=2026-12-31T23:59:59Z");
  assert.deepEqual(full.body.data.hulls, ["H-2748", "H-2749", "H-2751"]);
});

test("report-summary reads a createdAt without a zone as the browser's local time", async () => {
  const api = await setup();
  // "2026-10-31 23:30:00" local in UTC+8 (tzOffset -480) is 15:30Z.
  const base = "startDate=2026-01-01&endDate=2026-12-31&hull=ALL&discipline=ALL";
  const utc = await api.get(`/api/inspections/report-summary?${base}&startAt=2026-10-31T15:00:00Z&endAt=2026-10-31T16:00:00Z&tzOffset=0`);
  const east8 = await api.get(`/api/inspections/report-summary?${base}&startAt=2026-10-31T15:00:00Z&endAt=2026-10-31T16:00:00Z&tzOffset=-480`);
  const count = (res) => res.body.data.rows.reduce((sum, row) => sum + row.comments, 0);
  assert.equal(count(utc), 0);
  assert.ok(count(east8) > 0);
});

test("report-summary validates its input and requires a token", async () => {
  const api = await setup();
  const bad = await api.get("/api/inspections/report-summary?startDate=yesterday&endDate=2026-12-31&startAt=x&endAt=y");
  assert.equal(bad.status, 400);
  const anonymous = await createApp().request("http://localhost/api/inspections/report-summary?startDate=2026-01-01&endDate=2026-12-31&startAt=2026-01-01T00:00:00Z&endAt=2026-12-31T00:00:00Z", {}, api.env);
  assert.equal(anonymous.status, 401);
});
