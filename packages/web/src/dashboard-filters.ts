/**
 * Dashboard filter state <-> URL query string, plus the pure list helpers the
 * Dashboard uses (filtering and client-side pagination).
 *
 * The URL only carries values that differ from the defaults, so a plain
 * `/` (or `/nbins/`) still means "today's queue, all hulls, all disciplines".
 */

export type DashboardFilterMode = "date" | "pending" | "open-comments";

export interface DashboardFilters {
  mode: DashboardFilterMode;
  /** YYYY-MM-DD, or "" for all dates. */
  date: string;
  hull: string;
  discipline: string;
  keyword: string;
  page: number;
  pageSize: number;
}

export const ALL = "ALL";
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;
/** URL value used for "no date filter", because an absent `date` means today. */
export const ALL_DATES_PARAM = "all";

const MODES: readonly DashboardFilterMode[] = ["date", "pending", "open-comments"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Keys this module owns in the query string. Other keys are left untouched. */
export const DASHBOARD_FILTER_KEYS = ["mode", "date", "hull", "disc", "q", "page", "size"] as const;

export function defaultDashboardFilters(today: string): DashboardFilters {
  return {
    mode: "date",
    date: today,
    hull: ALL,
    discipline: ALL,
    keyword: "",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };
}

interface ParamsLike {
  get(name: string): string | null;
}

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function parseDashboardFilters(params: ParamsLike, today: string): DashboardFilters {
  const defaults = defaultDashboardFilters(today);

  const rawMode = params.get("mode");
  const mode = MODES.includes(rawMode as DashboardFilterMode) ? (rawMode as DashboardFilterMode) : defaults.mode;

  const rawDate = params.get("date");
  let date = defaults.date;
  if (rawDate === ALL_DATES_PARAM) {
    date = "";
  } else if (rawDate && DATE_PATTERN.test(rawDate)) {
    date = rawDate;
  }

  const hull = params.get("hull")?.trim() || ALL;
  const discipline = params.get("disc")?.trim() || ALL;
  const keyword = params.get("q") ?? "";
  const page = parsePositiveInt(params.get("page")) ?? 1;
  const rawSize = parsePositiveInt(params.get("size"));
  const pageSize = rawSize !== null && (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE;

  return { mode, date, hull, discipline, keyword, page, pageSize };
}

/**
 * Writes the filters into `base` (a copy is returned), dropping defaults.
 * Query keys that are not dashboard filters are preserved.
 */
export function serializeDashboardFilters(
  filters: DashboardFilters,
  today: string,
  base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of DASHBOARD_FILTER_KEYS) {
    next.delete(key);
  }

  if (filters.mode !== "date") {
    next.set("mode", filters.mode);
  }
  if (filters.date === "") {
    next.set("date", ALL_DATES_PARAM);
  } else if (filters.date !== today) {
    next.set("date", filters.date);
  }
  if (filters.hull && filters.hull !== ALL) {
    next.set("hull", filters.hull);
  }
  if (filters.discipline && filters.discipline !== ALL) {
    next.set("disc", filters.discipline);
  }
  if (filters.keyword) {
    next.set("q", filters.keyword);
  }
  if (filters.page > 1) {
    next.set("page", String(filters.page));
  }
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    next.set("size", String(filters.pageSize));
  }
  return next;
}

/**
 * Applies a partial change. Any change other than `page` itself sends the
 * user back to page 1, so a narrower filter never lands on an empty page.
 */
export function updateDashboardFilters(
  current: DashboardFilters,
  patch: Partial<DashboardFilters>
): DashboardFilters {
  const next = { ...current, ...patch };
  const onlyPage = Object.keys(patch).every((key) => key === "page");
  if (!onlyPage) {
    next.page = patch.page ?? 1;
  }
  return next;
}

/** True when anything narrows the list beyond "today's queue, everything". */
export function hasActiveFilters(filters: DashboardFilters, today: string): boolean {
  return filters.mode !== "date"
    || filters.date !== today
    || filters.hull !== ALL
    || filters.discipline !== ALL
    || filters.keyword.trim() !== "";
}

/** Filters back to defaults; the page size is a display preference and is kept. */
export function clearDashboardFilters(current: DashboardFilters, today: string): DashboardFilters {
  return { ...defaultDashboardFilters(today), pageSize: current.pageSize };
}

export interface FilterableInspection {
  workflowStatus: string;
  openComments: number;
  plannedDate: string;
  hullNumber: string;
  discipline: string;
  itemName: string;
  currentResult?: string | null;
  yardQc?: string | null;
}

export function filterDashboardItems<T extends FilterableInspection>(items: readonly T[], filters: DashboardFilters): T[] {
  const keyword = filters.keyword.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.mode === "pending") {
      if (item.workflowStatus !== "pending") return false;
    } else if (filters.mode === "open-comments") {
      if (item.openComments === 0) return false;
    } else if (!keyword && filters.date && item.plannedDate !== filters.date) {
      // Date mode: a keyword search looks across all dates.
      return false;
    }

    if (filters.hull !== ALL && item.hullNumber !== filters.hull) return false;
    if (filters.discipline !== ALL && item.discipline !== filters.discipline) return false;
    if (keyword) {
      const matched = item.itemName.toLowerCase().includes(keyword)
        || item.hullNumber.toLowerCase().includes(keyword)
        || item.discipline.toLowerCase().includes(keyword)
        || (item.currentResult || "").toLowerCase().includes(keyword)
        || (item.yardQc || "").toLowerCase().includes(keyword);
      if (!matched) return false;
    }
    return true;
  });
}

export interface PageSlice<T> {
  items: T[];
  /** 1-based page, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first item on the page, 0 when empty. */
  from: number;
  /** 1-based index of the last item on the page, 0 when empty. */
  to: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (safePage - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: safePage,
    pageCount,
    total,
    from: slice.length > 0 ? start + 1 : 0,
    to: start + slice.length
  };
}
