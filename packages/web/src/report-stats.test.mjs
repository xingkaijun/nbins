import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommentStats,
  buildDisciplineCommentData,
  buildDisciplineQualityData,
  buildInspectionStats
} from "./report-stats.ts";

function row(discipline, values = {}) {
  return {
    discipline,
    total: 0,
    acceptedAA: 0,
    qualifiedQCC: 0,
    rejectedRJ: 0,
    owc: 0,
    pending: 0,
    passedFirstRound: 0,
    comments: 0,
    ...values
  };
}

// Summary as GET /api/inspections/report-summary returns it.
const SUMMARY = [
  row("HULL", { total: 10, acceptedAA: 4, qualifiedQCC: 2, rejectedRJ: 1, owc: 1, pending: 2, passedFirstRound: 5, comments: 7 }),
  row("PAINT", { total: 4, acceptedAA: 1, qualifiedQCC: 0, rejectedRJ: 0, owc: 0, pending: 3, passedFirstRound: 1, comments: 0 }),
  row("ELEC", { total: 0, comments: 3 }),
  row("CCS")
];

test("inspection totals, pass rate and first-time yield come from the summary", () => {
  const stats = buildInspectionStats(SUMMARY);
  assert.equal(stats.total, 14);
  assert.equal(stats.acceptedAA, 5);
  assert.equal(stats.qualifiedQCC, 2);
  assert.equal(stats.rejectedRJ, 1);
  assert.equal(stats.owc, 1);
  assert.equal(stats.pending, 5, "total minus every decided result");
  assert.equal(stats.passed, 7);
  assert.equal(stats.passRate, 50);
  assert.ok(Math.abs(stats.yield1stTime - (6 / 14) * 100) < 1e-9);
});

test("an empty period gives zeros, not NaN", () => {
  const stats = buildInspectionStats([]);
  assert.equal(stats.total, 0);
  assert.equal(stats.passRate, 0);
  assert.equal(stats.yield1stTime, 0);
  assert.deepEqual(buildCommentStats([]), { total: 0, disciplinesWithComments: 0 });
  assert.deepEqual(buildDisciplineQualityData([]), []);
});

test("comment totals count only disciplines with comments", () => {
  assert.deepEqual(buildCommentStats(SUMMARY), { total: 10, disciplinesWithComments: 2 });
  assert.deepEqual(buildDisciplineCommentData(SUMMARY), [
    { discipline: "HULL", TotalComments: 7 },
    { discipline: "ELEC", TotalComments: 3 }
  ]);
});

test("comment chart ties sort by discipline name", () => {
  const data = buildDisciplineCommentData([row("PAINT", { comments: 2 }), row("CCS", { comments: 2 })]);
  assert.deepEqual(data.map((d) => d.discipline), ["CCS", "PAINT"]);
});

test("quality table drops empty disciplines, rounds pass rate, sorts by volume", () => {
  const data = buildDisciplineQualityData(SUMMARY);
  assert.deepEqual(data.map((d) => d.discipline), ["HULL", "PAINT", "ELEC"]);
  assert.deepEqual(data[0], {
    discipline: "HULL",
    total: 10,
    acceptedAA: 4,
    qualifiedQCC: 2,
    pending: 2,
    rejectedRJ: 1,
    owc: 1,
    TotalComments: 7,
    passRate: 60
  });
  assert.equal(data[1].passRate, 25);
  assert.equal(data[2].passRate, 0, "comments only, no inspections");
});

test("quality table pass rate rounds half up like the old client code", () => {
  const [only] = buildDisciplineQualityData([row("HULL", { total: 8, acceptedAA: 5, pending: 3 })]);
  assert.equal(only.passRate, Math.round(62.5));
  assert.equal(only.passRate, 63);
});
