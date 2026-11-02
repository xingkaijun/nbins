/**
 * Display-only date helpers.
 *
 * Overview screens (lists, cards, table cells) show a plain `YYYY-MM-DD`
 * calendar day. Detail screens keep their existing long timestamps, which is
 * why `formatStamp` (dashboard-helpers.ts) and `formatDateTime`
 * (CommentDetailModal.tsx) are untouched.
 *
 * Business-timezone rules kept intact:
 *  - a bare `YYYY-MM-DD` (or a datetime without a zone) is a *local* calendar
 *    day: it is echoed as-is and never routed through UTC, so it can not slip a
 *    day.
 *  - an instant carrying `Z` or an offset is converted to the browser's local
 *    calendar day, matching what `toLocaleDateString()` already returned.
 *
 * Nothing here touches storage, API payloads, filters, sorting, date inputs or
 * export/PDF formatting; this is presentation only.
 */

const EMPTY = "—";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Local datetime without a timezone designator, e.g. `2026-03-05T23:30:00.123`. */
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
/** Trailing `Z` or `±HH:MM` / `±HHMM` makes the value an absolute instant. */
const ZONED_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function pad(value: number, width = 2): string {
  return String(Math.trunc(Math.abs(value))).padStart(width, "0");
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/** True for a real calendar day (`2026-02-30` and `2026-13-01` are not). */
function isRealCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

function fromParts(raw: string, year: number, month: number, day: number): string {
  return isRealCalendarDay(year, month, day) ? raw : EMPTY;
}

function toLocalCalendarDay(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Formats a date-ish value for overview surfaces as `YYYY-MM-DD`.
 * Missing or unparsable values become `—` instead of echoing a long raw string.
 */
export function formatDisplayDate(value: string | number | Date | null | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : toLocalCalendarDay(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return EMPTY;
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? EMPTY : toLocalCalendarDay(fromNumber);
  }
  if (typeof value !== "string") return EMPTY;

  const raw = value.trim();
  if (raw === "") return EMPTY;

  const dateOnly = DATE_ONLY_PATTERN.exec(raw);
  if (dateOnly) {
    return fromParts(raw, Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  const localDateTime = LOCAL_DATETIME_PATTERN.exec(raw);
  if (localDateTime) {
    const year = Number(localDateTime[1]);
    const month = Number(localDateTime[2]);
    const day = Number(localDateTime[3]);
    if (!isRealCalendarDay(year, month, day)) return EMPTY;
    const hour = Number(localDateTime[4]);
    const minute = Number(localDateTime[5]);
    if (hour > 23 || minute > 59) return EMPTY;
    // Seconds are optional in the pattern, so they must be range-checked too
    // (`2026-01-01T12:30:99` is not a valid local datetime).
    if (localDateTime[6] !== undefined && Number(localDateTime[6]) > 59) return EMPTY;
    return `${localDateTime[1]}-${localDateTime[2]}-${localDateTime[3]}`;
  }

  if (ZONED_PATTERN.test(raw)) {
    // An out-of-range day in the date part (e.g. `2027-02-29T...Z`) must not be
    // silently rolled over by the Date parser into the next month.
    const leadingDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (leadingDay && !isRealCalendarDay(Number(leadingDay[1]), Number(leadingDay[2]), Number(leadingDay[3]))) {
      return EMPTY;
    }
    const instant = new Date(raw);
    return Number.isNaN(instant.getTime()) ? EMPTY : toLocalCalendarDay(instant);
  }

  return EMPTY;
}
