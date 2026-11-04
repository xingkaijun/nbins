import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { formatDisplayDate } from "./date-format.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPER_URL = pathToFileURL(path.join(HERE, "date-format.ts")).href;

/** Runs formatDisplayDate in a fresh node process under the given TZ. */
function inZone(zone, value) {
  const code = `import(${JSON.stringify(HELPER_URL)}).then((m) => process.stdout.write(m.formatDisplayDate(${JSON.stringify(value)})));`;
  return execFileSync(process.execPath, ["-e", code], {
    env: { ...process.env, TZ: zone },
    encoding: "utf8"
  });
}

const ZONES = [
  "UTC",
  "Pacific/Kiritimati", // UTC+14 — earliest calendar day
  "Pacific/Pago_Pago", // UTC-11 — latest calendar day
  "America/New_York",
  "Asia/Shanghai"
];

test("a bare YYYY-MM-DD is echoed as-is and never slips a day in any timezone", () => {
  for (const zone of ZONES) {
    assert.equal(inZone(zone, "2026-03-05"), "2026-03-05", `TZ=${zone}`);
    assert.equal(inZone(zone, "2026-01-01"), "2026-01-01", `TZ=${zone}`);
    assert.equal(inZone(zone, "2026-12-31"), "2026-12-31", `TZ=${zone}`);
  }
  // Same rule without leaving this process.
  assert.equal(formatDisplayDate("2026-03-05"), "2026-03-05");
  assert.equal(formatDisplayDate("  2026-03-05  "), "2026-03-05");
});

test("instants with Z or an offset follow the browser local calendar day", () => {
  // 23:30 UTC is already the next day east of UTC+14, still the same day at UTC-11.
  assert.equal(inZone("UTC", "2026-03-05T23:30:00Z"), "2026-03-05");
  assert.equal(inZone("Pacific/Kiritimati", "2026-03-05T23:30:00Z"), "2026-03-06");
  assert.equal(inZone("Pacific/Pago_Pago", "2026-03-05T23:30:00Z"), "2026-03-05");

  // 02:00 UTC on the 5th is still the 4th at UTC-11 — the mirror-image case.
  assert.equal(inZone("UTC", "2026-03-05T02:00:00Z"), "2026-03-05");
  assert.equal(inZone("Pacific/Pago_Pago", "2026-03-05T02:00:00Z"), "2026-03-04");
  assert.equal(inZone("Pacific/Kiritimati", "2026-03-05T02:00:00Z"), "2026-03-05");

  // Explicit numeric offsets are absolute instants too.
  assert.equal(inZone("UTC", "2026-03-05T01:00:00+09:00"), "2026-03-04");
  assert.equal(inZone("Asia/Shanghai", "2026-03-05T01:00:00+09:00"), "2026-03-05");
  assert.equal(inZone("UTC", "2026-03-05T00:30:00+09:00"), "2026-03-04");
  assert.equal(inZone("UTC", "2026-03-05T00:30:00-0500"), "2026-03-05");
});

test("a datetime without a timezone is read as a local calendar day", () => {
  for (const zone of ZONES) {
    assert.equal(inZone(zone, "2026-03-05T23:30:00"), "2026-03-05", `TZ=${zone}`);
    assert.equal(inZone(zone, "2026-03-05T00:00:00.123"), "2026-03-05", `TZ=${zone}`);
    assert.equal(inZone(zone, "2026-03-05 23:30"), "2026-03-05", `TZ=${zone}`);
  }
  assert.equal(formatDisplayDate("2026-03-05T23:30:00"), "2026-03-05");
  assert.equal(formatDisplayDate("2026-03-05T23:30"), "2026-03-05");
});

test("seconds are range-checked in local datetimes", () => {
  // Valid seconds (and optional fractions) still resolve to the calendar day.
  assert.equal(formatDisplayDate("2026-01-01T12:30:00"), "2026-01-01");
  assert.equal(formatDisplayDate("2026-01-01T12:30:59"), "2026-01-01");
  assert.equal(formatDisplayDate("2026-01-01T12:30:59.999"), "2026-01-01");
  // Out-of-range seconds must not silently fall back to a valid-looking day.
  assert.equal(formatDisplayDate("2026-01-01T12:30:60"), "—");
  assert.equal(formatDisplayDate("2026-01-01T12:30:99"), "—");
  assert.equal(formatDisplayDate("2026-01-01 12:30:99"), "—");
  for (const zone of ["UTC", "Asia/Shanghai", "America/New_York"]) {
    assert.equal(inZone(zone, "2026-01-01T12:30:99"), "—", `TZ=${zone}`);
    assert.equal(inZone(zone, "2026-01-01T12:30:59"), "2026-01-01", `TZ=${zone}`);
  }
});

test("missing values become an em dash", () => {
  assert.equal(formatDisplayDate(null), "—");
  assert.equal(formatDisplayDate(undefined), "—");
  assert.equal(formatDisplayDate(""), "—");
  assert.equal(formatDisplayDate("   "), "—");
  assert.equal(formatDisplayDate(new Date(Number.NaN)), "—");
  assert.equal(formatDisplayDate(Number.NaN), "—");
});

test("unparsable strings collapse to an em dash instead of echoing a long value", () => {
  const invalid = ["not a date", "2026-13-01", "2026-02-30", "2026-03-05T25:00", "Fri Mar 05 2026 99:99", "0000-00-00", "2026-3-5"];
  for (const value of invalid) {
    assert.equal(formatDisplayDate(value), "—", JSON.stringify(value));
  }
  assert.equal(formatDisplayDate("x".repeat(400)), "—");
});

test("leap years are honoured, century rules included", () => {
  assert.equal(formatDisplayDate("2028-02-29"), "2028-02-29");
  assert.equal(formatDisplayDate("2024-02-29T12:00:00"), "2024-02-29");
  assert.equal(formatDisplayDate("2000-02-29"), "2000-02-29");
  assert.equal(formatDisplayDate("2100-02-29"), "—"); // 2100 is not a leap year
  assert.equal(formatDisplayDate("2026-02-29"), "—");
  assert.equal(formatDisplayDate("2027-02-29T08:00:00Z"), "—");
  // An instant on 29 Feb stays on that day wherever the browser sits.
  assert.equal(inZone("UTC", "2024-02-29T23:59:59Z"), "2024-02-29");
  assert.equal(inZone("Asia/Shanghai", "2024-02-29T23:59:59Z"), "2024-03-01");
  assert.equal(inZone("Pacific/Pago_Pago", "2024-02-29T02:00:00Z"), "2024-02-28");
});

test("Date objects and epoch numbers use the local calendar day", () => {
  const instant = new Date(Date.UTC(2026, 2, 5, 23, 30));
  // Same instant expressed three ways resolves to the same local calendar day.
  assert.equal(formatDisplayDate(instant), formatDisplayDate(instant.toISOString()));
  assert.equal(formatDisplayDate(instant.getTime()), formatDisplayDate(instant.toISOString()));
  assert.match(formatDisplayDate(instant), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(formatDisplayDate(0), /^\d{4}-\d{2}-\d{2}$/);
});

test("overview surfaces use the shared helper, detail surfaces keep their timestamps", () => {
  // Source text is checked across line breaks, so normalise CRLF checkouts.
  const read = (rel) => readFileSync(path.join(HERE, rel), "utf8").replace(/\r\n/g, "\n");

  const dashboard = read("pages/Dashboard.tsx");
  assert.match(dashboard, /data-label="Planned">\{formatDisplayDate\(item\.plannedDate\)\}</);
  assert.doesNotMatch(dashboard, /data-label="Planned">\{item\.plannedDate\}/);
  assert.match(dashboard, /UPDATED \{formatDisplayDate\(dataGeneratedAt\)\}/);

  const ncrs = read("pages/Ncrs.tsx");
  assert.match(ncrs, /Raised by \{item\.authorName \?\? item\.authorId\} on \{formatDisplayDate\(item\.createdAt\)\}/);
  assert.match(ncrs, /on \$\{formatDisplayDate\(item\.approvedAt\)\}/);
  assert.match(ncrs, /CLOSED • \{formatDisplayDate\(item\.closedAt\)\}/);
  // Expanded detail keeps its long timestamp.
  assert.match(ncrs, /<strong>Closed by<\/strong> .*new Date\(item\.closedAt!\)\.toLocaleString\(\)/);
  // The CSV export keeps its own existing formatting.
  assert.match(ncrs, /new Date\(item\.createdAt\)\.toLocaleString\(\),\n/);

  const observations = read("pages/Observations.tsx");
  assert.doesNotMatch(observations, /\{new Date\(cm\.createdAt\)\.toLocaleDateString\("en-CA"\)\}/);
  assert.doesNotMatch(observations, /\{new Date\(cm\.closedAt\)\.toLocaleDateString\("en-CA"\)\}/);
  assert.match(observations, /\{cm\.createdAt \? formatDisplayDate\(cm\.createdAt\) : "—"\}/);
  assert.match(observations, /formatDisplayDate\(item\.closedAt\)/);
  // Overview table cells show a plain day, not a raw timestamp.
  assert.doesNotMatch(observations, /className="obsTd">\{item\.date\}</);

  const fats = read("pages/Fats.tsx");
  assert.match(fats, /\{formatDisplayDate\(item\.createdAt\)\}/);
  assert.match(fats, /\{formatDisplayDate\(item\.updatedAt\)\}/);
  assert.match(fats, /\{formatDisplayDate\(item\.inspectionDate\)\}/);

  const admin = read("pages/Admin.tsx");
  assert.match(admin, /<td>\{formatDisplayDate\(o\.date\)\}<\/td>/);

  // Detail-only formatters must not be switched to the date-only helper.
  const commentModal = read("components/CommentDetailModal.tsx");
  assert.match(commentModal, /toLocaleString\("en-CA", \{ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"/);

  const helpers = read("pages/dashboard/dashboard-helpers.ts");
  assert.match(helpers, /export function formatStamp[\s\S]{0,200}hour: "2-digit",[\s\S]{0,80}minute: "2-digit"/);
});
