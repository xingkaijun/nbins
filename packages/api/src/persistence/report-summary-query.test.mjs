import test from "node:test";
import assert from "node:assert/strict";
import { queryReportSummary } from "./report-summary-query.ts";
import { createTestDatabase } from "../test-support/test-database.mjs";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";

// Reports used to filter in the browser: plannedDate went through date-fns
// parseISO and was compared with isWithinInterval against the local
// [startOfDay, endOfDay] of the selected period. A plannedDate that is a
// timestamp is therefore an instant; a plain YYYY-MM-DD is a calendar date.
// These run against the SQL aggregate that replaced it.

const PROJECT = "project-hd-lng";

function createDb() {
  return createTestDatabase(createBaselineInspectionStorage());
}

async function setPlannedDate(db, plannedDate) {
  // insp-002 is the only project-hd-lng item; round-insp-002-r1 is its current round.
  await db.prepare('UPDATE inspection_rounds SET plannedDate = ? WHERE id = ?').bind(plannedDate, "round-insp-002-r1").run();
}

/** Totals per discipline over the current round, as Reports counts them. */
async function totals(db, filter) {
  const summary = await queryReportSummary(db, {
    allowedProjectIds: [PROJECT],
    projectId: PROJECT,
    hull: null,
    discipline: null,
    ...filter
  });
  return {
    total: summary.rows.reduce((sum, row) => sum + row.total, 0),
    comments: summary.rows.reduce((sum, row) => sum + row.comments, 0),
    rows: summary.rows
  };
}

// 2026-11-01 in UTC+8 is [2026-10-31T16:00Z, 2026-11-01T15:59:59.999Z].
const SHANGHAI_11_01 = {
  startDate: "2026-11-01",
  endDate: "2026-11-01",
  startAt: "2026-10-31T16:00:00.000Z",
  endAt: "2026-11-01T15:59:59.999Z",
  tzOffsetMinutes: -480
};

test("a planned date stored as an ISO instant falls in the client's local day, not its UTC date", async () => {
  const db = createDb();
  // 2026-11-01 04:00 in UTC+8 (parseISO -> local instant inside 11-01).
  await setPlannedDate(db, "2026-10-31T20:00:00.000Z");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 1, "counted in 2026-11-01 for a UTC+8 client");
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-10-31", endDate: "2026-10-31", startAt: "2026-10-30T16:00:00.000Z", endAt: "2026-10-31T15:59:59.999Z" })).total, 0, "not counted in 2026-10-31");

  // The same instant read by a UTC client belongs to 2026-10-31.
  assert.equal(
    (await totals(db, { startDate: "2026-10-31", endDate: "2026-10-31", startAt: "2026-10-31T00:00:00.000Z", endAt: "2026-10-31T23:59:59.999Z", tzOffsetMinutes: 0 })).total,
    1
  );
  db.close();
});

test("an ISO instant with an explicit numeric offset is compared as written", async () => {
  const db = createDb();
  await setPlannedDate(db, "2026-11-01T08:00:00+08:00");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 1);
  await setPlannedDate(db, "2026-10-31T20:00:00-08:00"); // 2026-11-01T04:00Z
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-11-01", endDate: "2026-11-01", startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-11-01T23:59:59.999Z", tzOffsetMinutes: 0 })).total, 1);
  db.close();
});

test("a plain YYYY-MM-DD planned date stays an inclusive calendar date", async () => {
  const db = createDb();
  await setPlannedDate(db, "2026-11-01");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 1);
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-10-30", endDate: "2026-11-02", startAt: "2026-10-29T16:00:00.000Z", endAt: "2026-11-02T15:59:59.999Z" })).total, 1);
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-11-02", endDate: "2026-11-02", startAt: "2026-11-01T16:00:00.000Z", endAt: "2026-11-02T15:59:59.999Z" })).total, 0);
  // Bounds are inclusive on both ends.
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-11-01", endDate: "2026-11-01" })).total, 1);
  db.close();
});

test("a planned date without a zone is local time, like parseISO", async () => {
  const db = createDb();
  // "2026-11-01 00:30:00" in UTC+8 is 2026-10-31T16:30Z: inside 11-01, outside 10-31 local.
  await setPlannedDate(db, "2026-11-01 00:30:00");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 1);
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-10-31", endDate: "2026-10-31", startAt: "2026-10-30T16:00:00.000Z", endAt: "2026-10-31T15:59:59.999Z" })).total, 0);

  // "2026-11-01T23:30:00" local is 15:30Z: still inside 11-01 for UTC+8, but
  // 2026-11-02 for a UTC client.
  await setPlannedDate(db, "2026-11-01T23:30:00");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 1);
  assert.equal((await totals(db, { ...SHANGHAI_11_01, startDate: "2026-11-02", endDate: "2026-11-02", startAt: "2026-11-01T16:00:00.000Z", endAt: "2026-11-02T15:59:59.999Z", tzOffsetMinutes: 0 })).total, 1);
  db.close();
});

test("unparseable planned dates are ignored instead of failing the report", async () => {
  const db = createDb();
  await setPlannedDate(db, "TBD");
  assert.deepEqual(await totals(db, SHANGHAI_11_01), { total: 0, comments: 0, rows: [] });
  await setPlannedDate(db, "2026-13-45");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 0);
  await setPlannedDate(db, "");
  assert.equal((await totals(db, SHANGHAI_11_01)).total, 0);
  db.close();
});

test("a planned date stored as an instant still counts its comments in the same local day", async () => {
  const db = createDb();
  await setPlannedDate(db, "2026-10-31T20:00:00.000Z");
  const result = await totals(db, SHANGHAI_11_01);
  assert.equal(result.total, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].discipline, "PAINT");
  db.close();
});
