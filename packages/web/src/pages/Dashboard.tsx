import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, ExternalLink, Search, X } from "lucide-react";
import {
  INSPECTION_RESULT_LABELS,
  type InspectionListItem
} from "@nbins/shared";
import { fetchInspectionList, fetchInspectionDetail, fetchProjects, type ProjectRecord } from "../api";
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
import {
  ALL,
  PAGE_SIZE_OPTIONS,
  clearDashboardFilters,
  filterDashboardItems,
  hasActiveFilters,
  paginate,
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
  const [listItems, setListItems] = useState<InspectionListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listMode, setListMode] = useState<DetailTransportMode>("api");
  const [dataGeneratedAt, setDataGeneratedAt] = useState<string>(new Date().toISOString());
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  // Bumped to force a list refetch (fallback sync when BroadcastChannel is unavailable).
  const [listReloadToken, setListReloadToken] = useState(0);
  // Last row opened in a new tab, highlighted so the user keeps their place in the list.
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);

  // Load projects
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

  useEffect(() => {
    let active = true;
    async function loadList() {
      if (!selectedProjectId) {
        setListItems([]);
        setSelectedIds(new Set());
        setDataGeneratedAt(new Date().toISOString());
        setListLoading(false);
        return;
      }

      setListLoading(true);
      setListError(null);
      try {
        const response = await fetchInspectionList(selectedProjectId);
        if (!active) return;
        setListItems(response.items);
        setDataGeneratedAt(response.generatedAt);
        setListMode("api");
      } catch (err) {
        if (!active) return;
        setListError(err instanceof Error && err.message ? err.message : "Failed to load inspections.");
        setListMode("api");
        setListItems([]);
        setSelectedIds(new Set());
        setDataGeneratedAt(new Date().toISOString());
      } finally {
        if (active) setListLoading(false);
      }
    }
    void loadList();
    return () => { active = false; };
  }, [selectedProjectId, listReloadToken]);

  // Keep the list in sync with saves made on /inspections/:itemId in other tabs.
  // Primary: BroadcastChannel (see inspection-sync.ts for why). Fallback for
  // browsers without BroadcastChannel: refetch the list when this tab becomes
  // visible again.
  useEffect(() => {
    const unsubscribe = subscribeInspectionUpdates(({ detail }) => {
      setListItems((current) => syncDashboardItem(current, detail));
    });

    if (isBroadcastChannelSupported()) {
      return unsubscribe;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setListReloadToken((token) => token + 1);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  const localToday = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  // Filters live in the URL (?mode=&date=&hull=&disc=&q=&page=&size=) so a
  // refresh, a shared link or Back restores the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseDashboardFilters(searchParams, localToday), [searchParams, localToday]);
  const { mode: filterMode, date: filterDate, hull: filterHull, discipline: filterDiscipline, keyword: searchKeyword } = filters;

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

  // Derived filter options
  const hullOptions = useMemo(() => Array.from(new Set(listItems.map(i => i.hullNumber))).sort(), [listItems]);
  
  // Get effective disciplines from the current project configuration first
  const disciplineOptions = useMemo(() => {
    if (currentProject?.disciplines && currentProject.disciplines.length > 0) {
      return [...currentProject.disciplines].sort();
    }

    return Array.from(new Set(listItems.map(i => i.discipline))).sort();
  }, [currentProject, listItems]);

  const displayedItems = useMemo(() => filterDashboardItems(listItems, filters), [listItems, filters]);
  const pageSlice = useMemo(
    () => paginate(displayedItems, filters.page, filters.pageSize),
    [displayedItems, filters.page, filters.pageSize]
  );
  const filtersActive = hasActiveFilters(filters, localToday);

  const acceptedCount = displayedItems.filter(item => item.currentResult === "AA").length;
  const qcRecheckCount = displayedItems.filter(item => item.currentResult === "QCC").length;
  const reinspectionCount = displayedItems.filter(item => item.currentResult === "OWC").length;
  const rejectedCount = displayedItems.filter(item => item.currentResult === "RJ").length;
  const todayQueueCount = displayedItems.filter(item => item.workflowStatus === "pending").length;

  const disciplineCounts = displayedItems.reduce((acc, item) => {
    acc[item.discipline] = (acc[item.discipline] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
      setSelectedIds(new Set(displayedItems.map(i => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleSelectRow(e: React.ChangeEvent<HTMLInputElement>, id: string) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.target.checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  async function handleBatchExport() {
    if (selectedIds.size === 0) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: selectedIds.size });
    
    try {
      const itemsToExport = [];
      let idx = 0;
      for (const id of selectedIds) {
        setExportProgress({ current: ++idx, total: selectedIds.size });
        const detail = await fetchInspectionDetail(id);
        if (detail) itemsToExport.push(detail);
      }
      
      if (itemsToExport.length > 0) {
        const { generateBatchZip } = await import("../utils/pdf-generator");
        await generateBatchZip(itemsToExport, `NbIns_Batch_Reports_${filterDate || 'All'}.zip`);
      }
    } catch (err) {
      toast.error(err, "Batch export failed.");
      console.error(err);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  }

  function handleExportChecklist() {
    generateInspectionChecklistPdf(displayedItems, {
      date: filterDate || 'ALL',
      hull: filterHull === 'ALL' ? 'ALL' : filterHull,
      discipline: filterDiscipline === 'ALL' ? 'ALL' : filterDiscipline
    });
  }

  function handleExportAsciiChecklist() {
    generateInspectionChecklistAsciiPdf(displayedItems, {
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
  const allDisplayedSelected = selectedIds.size > 0 && displayedItems.every((item) => selectedIds.has(item.id));

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
            <span>UPDATED {new Date(dataGeneratedAt).toLocaleDateString("en-US")}</span>
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
                  ACTIVE INSPECTIONS ({displayedItems.length})
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
                <button
                  type="button"
                  className={`exportButton exportButton--ink${displayedItems.length > 0 ? " isReady" : ""}`}
                  onClick={handleExportChecklist}
                  disabled={displayedItems.length === 0}
                >
                  EXPORT CHECKLIST ({displayedItems.length})
                </button>
                <button
                  type="button"
                  className={`exportButton exportButton--slate${displayedItems.length > 0 ? " isReady" : ""}`}
                  onClick={handleExportAsciiChecklist}
                  disabled={displayedItems.length === 0}
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
            <table className="dashboardTable responsiveTable" aria-busy={listLoading}>
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
                      aria-label={`Select all ${displayedItems.length} filtered inspections`}
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
                      className={`record-row ${item.id === lastOpenedId ? "isSelected" : ""}`}
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
                      <td data-label="Planned">{item.plannedDate}</td>
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
                          description={listItems.length > 0 ? `${listItems.length} inspections in this project are hidden by the filters.` : undefined}
                          actionLabel="Clear filters"
                          onAction={resetFilters}
                        />
                      ) : (
                        <EmptyState
                          title="Nothing planned for today."
                          description={listItems.length > 0 ? "Pick another date, or switch to ALL PENDING." : "This project has no inspections yet."}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {displayedItems.length > PAGE_SIZE_OPTIONS[0] || pageSlice.pageCount > 1 ? (
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
