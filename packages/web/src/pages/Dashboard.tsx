import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, ExternalLink, Search, X } from "lucide-react";
import {
  INSPECTION_RESULT_LABELS,
  type InspectionListItem,
  type InspectionListPageResponse
} from "@nbins/shared";
import { fetchInspectionDetail, fetchInspectionListExport, fetchInspectionListPage, fetchProjects, type ProjectRecord } from "../api";
import { buildInspectionListParams, isAbortError, type InspectionListQueryInput } from "../inspection-list-query";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useRowFlash } from "../hooks/use-row-flash";
import { rowsToFlash } from "../row-flash";
import { createLatestRequestGate } from "../latest-request";
import { KEYWORD_DEBOUNCE_MS } from "../debounce";
import { resolveAvailableProjectId, useProjectContext } from "../project-context";
import type { DetailTransportMode } from "../useInspectionDetail";
import { generateInspectionChecklistPdf, generateInspectionReport, generateInspectionChecklistAsciiPdf } from "../utils/pdf-generator";
import {
  buildInspectionDetailHref,
  isBroadcastChannelSupported,
  openInspectionInNewTab,
  subscribeInspectionUpdates
} from "../inspection-sync";
import {
  resultTone,
  syncDashboardItem
} from "./dashboard/dashboard-helpers";
import { batchExportSkippedMessage, collectBatchExportItems, dropSelectedIds } from "./dashboard/batch-export";
import { formatDisplayDate } from "../date-format";
import {
  ALL,
  PAGE_SIZE_OPTIONS,
  clearDashboardFilters,
  hasActiveFilters,
  parseDashboardFilters,
  serializeDashboardFilters,
  updateDashboardFilters,
  type DashboardFilters
} from "../dashboard-filters";
import { useToast } from "../components/Toast";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";

/** Elements inside a row that have their own click behaviour. */
const ROW_INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";
const TABLE_COLUMNS = 9;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function Dashboard() {
  const toast = useToast();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  // One page of the server-paged list plus the stats of every filtered item.
  const [pageData, setPageData] = useState<InspectionListPageResponse | null>(null);
  const listItems: InspectionListItem[] = pageData?.items ?? [];
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listMode, setListMode] = useState<DetailTransportMode>("api");
  const [dataGeneratedAt, setDataGeneratedAt] = useState<string>(new Date().toISOString());
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  // Hull / discipline dropdown options, requested once per project (facets=1).
  const [facets, setFacets] = useState<{ projectId: string; hulls: string[]; disciplines: string[] } | null>(null);
  const facetsProjectRef = useRef<string | null>(null);
  // A refetch that keeps the rows on screen (cross-tab sync) instead of skeletons.
  const silentReloadRef = useRef(false);
  const listRequestGateRef = useRef(createLatestRequestGate());

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  // Bumped to refetch the current page (cross-tab saves, Retry, visibility fallback).
  const [listReloadToken, setListReloadToken] = useState(0);
  // Last row opened in a new tab, highlighted so the user keeps their place in the list.
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  // Rows another tab just saved flash briefly.
  const { flashing, flash } = useRowFlash();

  // Load projects (deduplicated: one /api/projects request per user per 30 s).
  useEffect(() => {
    let active = true;

    fetchProjects()
      .then((data) => {
        if (!active) {
          return;
        }

        setProjects(data);
        const nextProjectId = resolveAvailableProjectId(data, selectedProjectId);
        if (nextProjectId !== selectedProjectId) {
          setSelectedProjectId(nextProjectId);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [selectedProjectId, setSelectedProjectId]);

  const localToday = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  // Filters live in the URL (?mode=&date=&hull=&disc=&q=&page=&size=) so a
  // refresh, a shared link or Back restores the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseDashboardFilters(searchParams, localToday), [searchParams, localToday]);
  const { mode: filterMode, date: filterDate, hull: filterHull, discipline: filterDiscipline, keyword: searchKeyword } = filters;
  // The URL follows every keystroke; the request waits until typing pauses
  // (clearing the box applies at once).
  const debouncedKeyword = useDebouncedValue(searchKeyword, KEYWORD_DEBOUNCE_MS, (value) => value.trim() === "");

  const listQuery = useMemo<InspectionListQueryInput>(() => ({
    projectId: selectedProjectId,
    mode: filterMode,
    date: filterDate,
    hull: filterHull,
    discipline: filterDiscipline,
    keyword: debouncedKeyword,
    page: filters.page,
    pageSize: filters.pageSize
  }), [selectedProjectId, filterMode, filterDate, filterHull, filterDiscipline, debouncedKeyword, filters.page, filters.pageSize]);
  const listQueryKey = buildInspectionListParams(listQuery);

  useEffect(() => {
    if (!selectedProjectId) {
      setPageData(null);
      setSelectedIds(new Set());
      setDataGeneratedAt(new Date().toISOString());
      setListLoading(false);
      return;
    }

    // A newer query (filter, page, project) aborts the request still in flight,
    // and a late answer for an older query is dropped (latest-request.ts).
    const request = listRequestGateRef.current.begin();
    const silent = silentReloadRef.current;
    silentReloadRef.current = false;
    if (!silent) setListLoading(true);
    setListError(null);
    const wantFacets = facetsProjectRef.current !== selectedProjectId;

    fetchInspectionListPage({ ...listQuery, facets: wantFacets }, { signal: request.signal })
      .then((response) => {
        if (request.isStale()) return;
        setPageData(response);
        setDataGeneratedAt(response.generatedAt);
        setListMode("api");
        if (response.hulls) {
          facetsProjectRef.current = selectedProjectId;
          setFacets({ projectId: selectedProjectId, hulls: response.hulls, disciplines: response.disciplines ?? [] });
        }
      })
      .catch((err) => {
        if (request.isStale() || isAbortError(err)) return;
        setListError(err instanceof Error && err.message ? err.message : "Failed to load inspections.");
        setListMode("api");
        setPageData(null);
        setDataGeneratedAt(new Date().toISOString());
      })
      .finally(() => {
        if (!request.isStale()) setListLoading(false);
      });

    return () => request.abort();
    // listQueryKey covers every field of listQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQueryKey, listReloadToken]);

  // Keep the list in sync with saves made on /inspections/:itemId in other tabs.
  // Primary: BroadcastChannel (see inspection-sync.ts for why). The saved row
  // is patched in place and flashes, then only the current page is refetched
  // in the background so stats and filter membership stay right. Fallback for
  // browsers without BroadcastChannel: refetch the page when this tab becomes
  // visible again.
  const pageIdsRef = useRef<string[]>([]);
  pageIdsRef.current = listItems.map((item) => item.id);
  useEffect(() => {
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeInspectionUpdates(({ detail }) => {
      setPageData((current) => current ? { ...current, items: syncDashboardItem(current.items, detail) } : current);
      for (const id of rowsToFlash(pageIdsRef.current, [detail.id])) flash(id);
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        silentReloadRef.current = true;
        setListReloadToken((token) => token + 1);
      }, 250);
    });

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        silentReloadRef.current = true;
        setListReloadToken((token) => token + 1);
      }
    }
    const useVisibilityFallback = !isBroadcastChannelSupported();
    if (useVisibilityFallback) document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      if (refetchTimer) clearTimeout(refetchTimer);
      if (useVisibilityFallback) document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flash]);

  const applyFilters = useCallback((next: DashboardFilters) => {
    setSearchParams((current) => serializeDashboardFilters(next, localToday, current), { replace: true });
  }, [localToday, setSearchParams]);

  const changeFilters = useCallback((patch: Partial<DashboardFilters>) => {
    applyFilters(updateDashboardFilters(filters, patch));
  }, [applyFilters, filters]);

  const resetFilters = useCallback(() => {
    applyFilters(clearDashboardFilters(filters, localToday));
  }, [applyFilters, filters, localToday]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  // Derived filter options (from the server, once per project)
  const projectFacets = facets && facets.projectId === selectedProjectId ? facets : null;
  const hullOptions = useMemo(() => projectFacets?.hulls ?? [], [projectFacets]);

  // Get effective disciplines from the current project configuration first
  const disciplineOptions = useMemo(() => {
    if (currentProject?.disciplines && currentProject.disciplines.length > 0) {
      return [...currentProject.disciplines].sort();
    }

    return projectFacets?.disciplines ?? [];
  }, [currentProject, projectFacets]);

  const total = pageData?.total ?? 0;
  const pageSlice = {
    items: listItems,
    page: pageData?.page ?? filters.page,
    pageCount: pageData?.pageCount ?? 1,
    total,
    from: total === 0 ? 0 : ((pageData?.page ?? 1) - 1) * (pageData?.pageSize ?? filters.pageSize) + 1,
    to: total === 0 ? 0 : ((pageData?.page ?? 1) - 1) * (pageData?.pageSize ?? filters.pageSize) + listItems.length
  };
  const filtersActive = hasActiveFilters(filters, localToday);

  // Stats cover every item matching the filters, counted by the server.
  const stats = pageData?.stats;
  const acceptedCount = stats?.accepted ?? 0;
  const qcRecheckCount = stats?.qcRecheck ?? 0;
  const reinspectionCount = stats?.reinspection ?? 0;
  const rejectedCount = stats?.rejected ?? 0;
  const todayQueueCount = stats?.pending ?? 0;

  const disciplineCounts: Record<string, number> = stats?.byDiscipline ?? {};

  /**
   * Row click opens the item in a new tab (window.open). Clicks on the checkbox,
   * the report button or the item link keep their own behaviour, and a text
   * selection drag does not open anything.
   */
  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, id: string): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest(ROW_INTERACTIVE_SELECTOR)) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    setLastOpenedId(id);
    openInspectionInNewTab(id);
  }

  /** Middle click on the row behaves like middle click on a link. */
  function handleRowAuxClick(event: React.MouseEvent<HTMLTableRowElement>, id: string): void {
    if (event.button !== 1) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(ROW_INTERACTIVE_SELECTOR)) {
      return;
    }
    event.preventDefault();
    setLastOpenedId(id);
    openInspectionInNewTab(id);
  }

  /** The item link is a real <a target="_blank">; Space opens it too (Enter is native). */
  function handleOpenLinkKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, id: string): void {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setLastOpenedId(id);
      openInspectionInNewTab(id);
    }
  }

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      // Selects the rows on this page (selections on other pages are kept).
      setSelectedIds((current) => new Set([...current, ...listItems.map((item) => item.id)]));
    } else {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const item of listItems) next.delete(item.id);
        return next;
      });
    }
  }

  function handleSelectRow(e: React.ChangeEvent<HTMLInputElement>, id: string) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.target.checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  /**
   * Clears every selection, including ids picked on other pages — those rows
   * are not on screen, so the header checkbox alone can never reach them.
   */
  function handleClearSelection() {
    setSelectedIds((current) => (current.size === 0 ? current : new Set<string>()));
  }

  async function handleBatchExport() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setIsExporting(true);
    setExportProgress({ current: 0, total: ids.length });
    let progress = 0;

    try {
      const { items, missingIds } = await collectBatchExportItems(ids, async (id) => {
        setExportProgress({ current: ++progress, total: ids.length });
        return fetchInspectionDetail(id);
      });

      if (missingIds.length > 0) {
        // Only 404s land here (see collectBatchExportItems); drop them so the
        // counter and the next export don't keep chasing deleted items.
        setSelectedIds((current) => dropSelectedIds(current, missingIds));
        toast.info(batchExportSkippedMessage(missingIds.length));
      }

      if (items.length > 0) {
        const { generateBatchZip } = await import("../utils/pdf-generator");
        await generateBatchZip(items, `NbIns_Batch_Reports_${filterDate || 'All'}.zip`);
      }
    } catch (err) {
      toast.error(err, "Batch export failed.");
      console.error(err);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  }

  /** Every item matching the filters (all pages), from the backend export endpoint. */
  async function loadAllFilteredItems(): Promise<InspectionListItem[] | null> {
    setChecklistLoading(true);
    try {
      const response = await fetchInspectionListExport({ ...listQuery, keyword: searchKeyword });
      return response.items;
    } catch (err) {
      toast.error(err, "Could not load the inspections to export.");
      return null;
    } finally {
      setChecklistLoading(false);
    }
  }

  async function handleExportChecklist() {
    const items = await loadAllFilteredItems();
    if (!items) return;
    generateInspectionChecklistPdf(items, {
      date: filterDate || 'ALL',
      hull: filterHull === 'ALL' ? 'ALL' : filterHull,
      discipline: filterDiscipline === 'ALL' ? 'ALL' : filterDiscipline
    });
  }

  async function handleExportAsciiChecklist() {
    const items = await loadAllFilteredItems();
    if (!items) return;
    generateInspectionChecklistAsciiPdf(items, {
      date: filterDate || 'ALL',
      hull: filterHull === 'ALL' ? 'ALL' : filterHull,
      discipline: filterDiscipline === 'ALL' ? 'ALL' : filterDiscipline
    });
  }

  async function handleDownloadPdf(e: React.MouseEvent, itemId: string) {
    e.stopPropagation();
    toast.info("Generating report...");
    try {
      const response = await fetchInspectionDetail(itemId);
      if (response) {
        await generateInspectionReport(response);
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message
        ? `Failed to generate the PDF report: ${err.message}`
        : "Failed to fetch full detail for PDF report.");
    }
  }
  const listTransportLabel = listMode === "api" ? "LIVE API" : "DEMO FALLBACK";
  const isTodayView = filterMode === "date" && filterDate === localToday;
  const heading = filterMode === "pending" ? "ALL PENDING"
    : filterMode === "open-comments" ? "ALL WITH OPEN COMMENTS"
    : filterDate === localToday ? "TODAY QUEUE"
    : filterDate ? `HISTORY: ${filterDate}`
    : "ALL DATES";
  const allDisplayedSelected = listItems.length > 0 && listItems.every((item) => selectedIds.has(item.id));

  return (
    <>
      <main className="workspace">
        <section className="hero">
          <div className="heroMain">
            <p className="eyebrow">INSPECTION WORKSPACE</p>
            {currentProject && (
              <p className="heroProject">
                Project: {currentProject.name} ({currentProject.code})
              </p>
            )}
            <div className="heroFilters">
              <h2>{heading}</h2>
              <input
                type="date"
                className="nbDateInput"
                aria-label="Planned date"
                value={filterDate}
                onChange={(e) => changeFilters({ date: e.target.value, mode: "date" })}
              />
              <div className="modeButtons" role="group" aria-label="List mode">
                <button
                  type="button"
                  className={`modeButton${isTodayView ? " isActive" : ""}`}
                  aria-pressed={isTodayView}
                  onClick={() => changeFilters({ date: localToday, mode: "date" })}
                >
                  TODAY
                </button>
                <button
                  type="button"
                  className={`modeButton${filterMode === "pending" ? " isActive" : ""}`}
                  aria-pressed={filterMode === "pending"}
                  onClick={() => changeFilters({ mode: "pending" })}
                >
                  ALL PENDING
                </button>
                <button
                  type="button"
                  className={`modeButton${filterMode === "open-comments" ? " isActive" : ""}`}
                  aria-pressed={filterMode === "open-comments"}
                  onClick={() => changeFilters({ mode: "open-comments" })}
                >
                  ALL WITH OPEN COMMENTS
                </button>
              </div>
            </div>
          </div>
          <div className="heroMeta">
            <span>UPDATED {formatDisplayDate(dataGeneratedAt)}</span>
            <span className={`badge ${listMode === "api" ? "" : "muted"}`}>{listTransportLabel}</span>
          </div>
        </section>

        <section className="summaryGrid">
          <article className="summaryCard">
            <p>TODAY QUEUE</p>
            <strong>{pad2(todayQueueCount)}</strong>
          </article>
          
          <article className="summaryCard">
            <p>DISCIPLINES IN FOCUS</p>
            <div className="disciplineChips">
               {Object.entries(disciplineCounts).map(([key, val]) => (
                 <span key={key} className="disciplineChip">
                   {key}: <b>{val}</b>
                 </span>
               ))}
            </div>
          </article>

          <article className="summaryCard summaryCard--success">
            <p>ACCEPTED</p>
            <strong>{pad2(acceptedCount)}</strong>
          </article>

          <article className="summaryCard summaryCard--warn">
            <p>QC RECHECK</p>
            <strong>{pad2(qcRecheckCount)}</strong>
          </article>

          <article className="summaryCard summaryCard--orange">
            <p>REINSPECTION</p>
            <strong>{pad2(reinspectionCount)}</strong>
          </article>

          <article className="summaryCard summaryCard--danger">
            <p>REJECTED</p>
            <strong>{pad2(rejectedCount)}</strong>
          </article>
        </section>

        <section className="fullWidthTable">
          <div className="tableTools dashboardTools">
             <div className="dashboardToolsFilters">
                <p className="eyebrow dashboardCount">
                  ACTIVE INSPECTIONS ({total})
                  {searchKeyword && <span className="dashboardSearchHint"> — search across all dates</span>}
                </p>
                <select 
                  className="filterSelect" 
                  aria-label="Hull"
                  value={filterHull} 
                  onChange={(e) => changeFilters({ hull: e.target.value })}
                >
                  <option value={ALL}>ALL HULLS</option>
                  {hullOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  {filterHull !== ALL && !hullOptions.includes(filterHull) ? <option value={filterHull}>{filterHull}</option> : null}
                </select>
                <select 
                  className="filterSelect" 
                  aria-label="Discipline"
                  value={filterDiscipline} 
                  onChange={(e) => changeFilters({ discipline: e.target.value })}
                >
                  <option value={ALL}>ALL DISCIPLINES</option>
                  {disciplineOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  {filterDiscipline !== ALL && !disciplineOptions.includes(filterDiscipline) ? <option value={filterDiscipline}>{filterDiscipline}</option> : null}
                </select>
                <div className="searchField">
                  <Search size={12} strokeWidth={2.5} className="searchFieldIcon" aria-hidden="true" />
                  <input
                    type="search"
                    className="searchFieldInput"
                    aria-label="Search inspections"
                    placeholder="Search name, hull, or result..."
                    value={searchKeyword}
                    onChange={(e) => changeFilters({ keyword: e.target.value })}
                  />
                  {searchKeyword && (
                    <button
                      type="button"
                      className="searchFieldClear"
                      aria-label="Clear search"
                      onClick={() => changeFilters({ keyword: "" })}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {filtersActive ? (
                  <button type="button" className="nbLinkButton" onClick={resetFilters}>
                    Clear filters
                  </button>
                ) : null}
             </div>
             <div className="dashboardToolsActions">
                <button
                  type="button"
                  className={`exportButton exportButton--accent${selectedIds.size > 0 ? " isReady" : ""}`}
                  onClick={() => void handleBatchExport()}
                  disabled={isExporting || selectedIds.size === 0}
                >
                  {isExporting ? `EXPORTING ${exportProgress.current}/${exportProgress.total}...` : `BATCH EXPORT (${selectedIds.size})`}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    className="nbLinkButton"
                    onClick={handleClearSelection}
                    disabled={isExporting}
                  >
                    Clear selection ({selectedIds.size})
                  </button>
                )}
                <button
                  type="button"
                  className={`exportButton exportButton--ink${total > 0 ? " isReady" : ""}`}
                  onClick={() => void handleExportChecklist()}
                  disabled={total === 0 || checklistLoading}
                  aria-busy={checklistLoading}
                >
                  {checklistLoading ? "PREPARING…" : `EXPORT CHECKLIST (${total})`}
                </button>
                <button
                  type="button"
                  className={`exportButton exportButton--slate${total > 0 ? " isReady" : ""}`}
                  onClick={() => void handleExportAsciiChecklist()}
                  disabled={total === 0 || checklistLoading}
                >
                  ASCII CHECKLIST
                </button>
             </div>
          </div>
          {listLoading ? <p className="srOnly" role="status">Loading inspections…</p> : null}
          {listError && !listLoading ? (
            <div className="inlineError" role="alert">
              <span>Could not load inspections: {listError}</span>
              <button type="button" className="nbButton" onClick={() => setListReloadToken((token) => token + 1)}>
                Retry
              </button>
            </div>
          ) : null}
          <div className="tableWrap">
            <table className={`dashboardTable responsiveTable${listLoading && listItems.length > 0 ? " isRefreshing" : ""}`} aria-busy={listLoading}>
              <colgroup>
                <col className="colCheckbox" />
                <col className="colHull" />
                <col className="colDiscipline" />
                <col className="colDate" />
                <col className="colRound" />
                <col />
                <col className="colResult" />
                <col className="colComments" />
                <col className="colReport" />
              </colgroup>
              <thead>
                <tr>
                  <th className="dashboardColCheckbox alignCenter">
                    <input 
                      type="checkbox" 
                      className="nbCheckbox"
                      aria-label={`Select all ${listItems.length} inspections on this page`}
                      checked={allDisplayedSelected} 
                      onChange={handleSelectAll} 
                    />
                  </th>
                  <th className="dashboardCompactCol">Hull</th>
                  <th className="dashboardCompactCol">Discipline</th>
                  <th className="dashboardCompactCol">Planned Date</th>
                  <th className="dashboardCompactCol">Round</th>
                  <th className="dashboardItemCol">Inspection Item</th>
                  <th className="dashboardCompactCol">Result</th>
                  <th className="dashboardCompactCol">Comments</th>
                  <th className="dashboardColReport alignCenter">Report</th>
                </tr>
              </thead>

              <tbody>
                {listLoading && listItems.length === 0 ? (
                  <SkeletonRows rows={8} columns={TABLE_COLUMNS} />
                ) : pageSlice.items.length > 0 ? pageSlice.items.map((item) => (
                    <tr
                      key={item.id}
                      className={`record-row${item.id === lastOpenedId ? " isSelected" : ""}${flashing.has(item.id) ? " isFlashing" : ""}`}
                      data-flashing={flashing.has(item.id) ? "true" : undefined}
                      title="Click to open details in a new tab"
                      onClick={(e) => handleRowClick(e, item.id)}
                      onAuxClick={(e) => handleRowAuxClick(e, item.id)}
                    >
                      <td className="alignCenter cellCheckbox" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="nbCheckbox"
                          aria-label={`Select ${item.hullNumber} ${item.itemName}`}
                          checked={selectedIds.has(item.id)} 
                          onChange={(e) => handleSelectRow(e, item.id)} 
                        />
                      </td>
                      <td data-label="Hull">
                        <strong>{item.hullNumber}</strong>
                      </td>
                      <td data-label="Discipline">{item.discipline}</td>
                      <td data-label="Planned">{formatDisplayDate(item.plannedDate)}</td>
                      <td data-label="Round">R{item.currentRound}</td>
                      <td data-label="Item" className="cellPrimary">
                        <a
                          className="rowOpenLink"
                          href={buildInspectionDetailHref(item.id)}
                          target="_blank"
                          rel="noopener"
                          aria-label={`Open ${item.hullNumber} ${item.itemName} details in a new tab`}
                          onClick={() => setLastOpenedId(item.id)}
                          onKeyDown={(e) => handleOpenLinkKeyDown(e, item.id)}
                        >
                          <strong>{item.itemName}</strong>
                          <ExternalLink className="rowOpenIcon" aria-hidden="true" focusable="false" size={12} strokeWidth={2.5} />
                        </a>
                      </td>
                      <td data-label="Result">
                        <span className={`resultBadge ${resultTone(item.currentResult)}`}>
                          {item.currentResult ? INSPECTION_RESULT_LABELS[item.currentResult] || item.currentResult : "PENDING"}
                        </span>
                      </td>
                      <td data-label="Comments">{item.openComments}</td>
                      <td className="alignCenter cellReport">
                        <button 
                          type="button"
                          className="nbIconButton nbIconButton--ghost"
                          title="Generate Report"
                          aria-label={`Generate PDF report for ${item.hullNumber} ${item.itemName}`}
                          onClick={(e) => handleDownloadPdf(e, item.id)}
                        >
                          <Download size={15} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                )) : (
                  <tr className="emptyRow">
                    <td colSpan={TABLE_COLUMNS}>
                      {listError ? (
                        <EmptyState title="Inspections could not be loaded." description="Use Retry above to try again." />
                      ) : filtersActive ? (
                        <EmptyState
                          title="No inspections match current filters."
                          description="Clear the filters to see every inspection in this project."
                          actionLabel="Clear filters"
                          onAction={resetFilters}
                        />
                      ) : (
                        <EmptyState
                          title="Nothing planned for today."
                          description="Pick another date, or switch to ALL PENDING."
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > PAGE_SIZE_OPTIONS[0] || pageSlice.pageCount > 1 ? (
            <Pagination
              label="Inspection list pages"
              page={pageSlice.page}
              pageCount={pageSlice.pageCount}
              from={pageSlice.from}
              to={pageSlice.to}
              total={pageSlice.total}
              pageSize={filters.pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(page) => changeFilters({ page })}
              onPageSizeChange={(pageSize) => changeFilters({ pageSize })}
            />
          ) : null}
        </section>
      </main>
    </>
  );
}
