import React, { useEffect, useMemo, useState } from "react";
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

/** Elements inside a row that have their own click behaviour. */
const ROW_INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";

export function Dashboard() {
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [listItems, setListItems] = useState<InspectionListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
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
      try {
        const response = await fetchInspectionList(selectedProjectId);
        if (!active) return;
        setListItems(response.items);
        setDataGeneratedAt(response.generatedAt);
        setListMode("api");
      } catch (err) {
        if (!active) return;
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
  const [filterDate, setFilterDate] = useState<string>(localToday);
  const [filterMode, setFilterMode] = useState<"date" | "pending" | "open-comments">("date");
  const [filterHull, setFilterHull] = useState<string>("ALL");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");
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

  const displayedItems = listItems.filter(item => {
    // 根据筛选模式应用不同的逻辑
    if (filterMode === "pending") {
      // 显示所有pending的项目（workflowStatus === "pending"）
      if (item.workflowStatus !== "pending") return false;
    } else if (filterMode === "open-comments") {
      // 显示所有Comments列不是0的项目
      if (item.openComments === 0) return false;
    } else {
      // date模式：搜索时忽略日期筛选，否则按日期过滤
      if (!searchKeyword && filterDate && item.plannedDate !== filterDate) return false;
    }
    
    if (filterHull !== "ALL" && item.hullNumber !== filterHull) return false;
    if (filterDiscipline !== "ALL" && item.discipline !== filterDiscipline) return false;
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const matched = item.itemName.toLowerCase().includes(kw)
        || item.hullNumber.toLowerCase().includes(kw)
        || item.discipline.toLowerCase().includes(kw)
        || (item.currentResult || "").toLowerCase().includes(kw)
        || item.yardQc?.toLowerCase().includes(kw);
      if (!matched) return false;
    }
    return true;
  });

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
      alert("Batch export failed.");
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
    alert("Generating report...");
    try {
      const response = await fetchInspectionDetail(itemId);
      if (response) {
        await generateInspectionReport(response);
      }
    } catch (err) {
      alert("Failed to fetch full detail for PDF report.");
    }
  }
  const listTransportLabel = listMode === "api" ? "LIVE API" : "DEMO FALLBACK";

  return (
    <>
      <main className="workspace">
        <section className="hero">
          <div>
            <p className="eyebrow">INSPECTION WORKSPACE</p>
            {currentProject && (
              <p style={{ fontSize: '16px', color: 'var(--nb-text)', margin: '4px 0 8px', fontWeight: 600 }}>
                Project: {currentProject.name} ({currentProject.code})
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h2>
                {filterMode === "pending" ? "ALL PENDING" 
                  : filterMode === "open-comments" ? "ALL WITH OPEN COMMENTS"
                  : filterDate === localToday ? "TODAY QUEUE" 
                  : `HISTORY: ${filterDate}`}
              </h2>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setFilterMode("date");
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--nb-border)',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '11px',
                  background: '#fff',
                  cursor: 'pointer',
                  color: 'var(--nb-text)'
                }}
              />
              <button
                onClick={() => {
                  setFilterDate(localToday);
                  setFilterMode("date");
                }}
                style={{
                  padding: '6px 14px',
                  border: filterMode === "date" && filterDate === localToday ? '2px solid var(--nb-accent)' : '1px solid var(--nb-border)',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '11px',
                  background: filterMode === "date" && filterDate === localToday ? 'var(--nb-accent)' : '#fff',
                  color: filterMode === "date" && filterDate === localToday ? '#fff' : 'var(--nb-text)',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'all 0.15s'
                }}
              >
                TODAY
              </button>
              <button
                onClick={() => setFilterMode("pending")}
                style={{
                  padding: '6px 14px',
                  border: filterMode === "pending" ? '2px solid var(--nb-accent)' : '1px solid var(--nb-border)',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '11px',
                  background: filterMode === "pending" ? 'var(--nb-accent)' : '#fff',
                  color: filterMode === "pending" ? '#fff' : 'var(--nb-text)',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'all 0.15s'
                }}
              >
                ALL PENDING
              </button>
              <button
                onClick={() => setFilterMode("open-comments")}
                style={{
                  padding: '6px 14px',
                  border: filterMode === "open-comments" ? '2px solid var(--nb-accent)' : '1px solid var(--nb-border)',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '11px',
                  background: filterMode === "open-comments" ? 'var(--nb-accent)' : '#fff',
                  color: filterMode === "open-comments" ? '#fff' : 'var(--nb-text)',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap'
                }}
              >
                ALL WITH OPEN COMMENTS
              </button>
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
            <strong>{todayQueueCount.toString().padStart(2, "0")}</strong>
          </article>
          
          <article className="summaryCard">
            <p>DISCIPLINES IN FOCUS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '12px' }}>
               {Object.entries(disciplineCounts).map(([key, val]) => (
                 <span key={key} style={{ fontSize: '10px', background: 'var(--nb-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--nb-border)'}}>
                   {key}: <b style={{ color: 'var(--nb-text)'}}>{val}</b>
                 </span>
               ))}
            </div>
          </article>

          <article className="summaryCard" style={{ borderColor: '#dcfce3', backgroundColor: '#f0fdf4' }}>
            <p style={{ color: '#166534' }}>ACCEPTED</p>
            <strong style={{ color: '#15803d' }}>{acceptedCount.toString().padStart(2, "0")}</strong>
          </article>

          <article className="summaryCard" style={{ borderColor: '#fef3c7', backgroundColor: '#fffbeb' }}>
            <p style={{ color: '#92400e' }}>QC RECHECK</p>
            <strong style={{ color: '#b45309' }}>{qcRecheckCount.toString().padStart(2, "0")}</strong>
          </article>

          <article className="summaryCard" style={{ borderColor: '#ffedd5', backgroundColor: '#fff7ed' }}>
            <p style={{ color: '#9a3412' }}>REINSPECTION</p>
            <strong style={{ color: '#c2410c' }}>{reinspectionCount.toString().padStart(2, "0")}</strong>
          </article>

          <article className="summaryCard" style={{ borderColor: '#ffe4e6', backgroundColor: '#fff1f2' }}>
            <p style={{ color: '#9f1239' }}>REJECTED</p>
            <strong style={{ color: '#e11d48' }}>{rejectedCount.toString().padStart(2, "0")}</strong>
          </article>
        </section>

        <section className="fullWidthTable">
          <div className="tableTools" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <p className="eyebrow" style={{ margin: 0 }}>ACTIVE INSPECTIONS ({displayedItems.length}){searchKeyword && <span style={{ color: 'var(--nb-accent)', fontWeight: 600 }}> — search across all dates</span>}</p>
                <select 
                  className="filterSelect" 
                  value={filterHull} 
                  onChange={(e) => setFilterHull(e.target.value)}
                >
                  <option value="ALL">ALL HULLS</option>
                  {hullOptions.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select 
                  className="filterSelect" 
                  value={filterDiscipline} 
                  onChange={(e) => setFilterDiscipline(e.target.value)}
                >
                  <option value="ALL">ALL DISCIPLINES</option>
                  {disciplineOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <svg style={{ position: 'absolute', left: 8, pointerEvents: 'none', color: 'var(--nb-text-muted)' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder="Search name, hull, or result..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{
                      padding: '4px 8px 4px 26px',
                      border: '1px solid var(--nb-border)',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: '#fff',
                      color: 'var(--nb-text)',
                      width: '240px',
                      outline: 'none',
                    }}
                  />
                  {searchKeyword && (
                    <button
                      onClick={() => setSearchKeyword('')}
                      style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nb-text-muted)', fontSize: 12, padding: 2, lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
             </div>
             <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="button" 
                  className="admin-btn"
                  onClick={() => void handleBatchExport()} 
                  disabled={isExporting || selectedIds.size === 0}
                  style={{
                    background: selectedIds.size > 0 ? 'var(--nb-accent)' : '#ffffff',
                    color: selectedIds.size > 0 ? '#ffffff' : 'var(--nb-text-muted)',
                    border: `1px solid ${selectedIds.size > 0 ? 'var(--nb-accent)' : 'var(--nb-border)'}`,
                    boxShadow: selectedIds.size > 0 ? '0 4px 12px rgba(13, 148, 136, 0.18)' : 'none',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '6px 12px',
                    borderRadius: '999px'
                  }}
                >
                  {isExporting ? `EXPORTING ${exportProgress.current}/${exportProgress.total}...` : `BATCH EXPORT (${selectedIds.size})`}
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={handleExportChecklist}
                  disabled={displayedItems.length === 0}
                  style={{
                    background: displayedItems.length > 0 ? '#0f172a' : '#ffffff',
                    color: displayedItems.length > 0 ? '#ffffff' : 'var(--nb-text-muted)',
                    border: `1px solid ${displayedItems.length > 0 ? '#0f172a' : 'var(--nb-border)'}`,
                    boxShadow: displayedItems.length > 0 ? '0 4px 12px rgba(15, 23, 42, 0.12)' : 'none',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '6px 12px',
                    borderRadius: '999px'
                  }}
                >
                  EXPORT CHECKLIST ({displayedItems.length})
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={handleExportAsciiChecklist}
                  disabled={displayedItems.length === 0}
                  style={{
                    background: displayedItems.length > 0 ? '#475569' : '#ffffff',
                    color: displayedItems.length > 0 ? '#ffffff' : 'var(--nb-text-muted)',
                    border: `1px solid ${displayedItems.length > 0 ? '#475569' : 'var(--nb-border)'}`,
                    boxShadow: displayedItems.length > 0 ? '0 4px 12px rgba(71, 85, 105, 0.12)' : 'none',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '6px 12px',
                    borderRadius: '999px',
                    marginLeft: '8px'
                  }}
                >
                  ASCII CHECKLIST
                </button>
             </div>
          </div>
          <div className="tableWrap">
            <table className="dashboardTable">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '92px' }} />
                <col style={{ width: '108px' }} />
                <col style={{ width: '118px' }} />
                <col style={{ width: '64px' }} />
                <col />
                <col style={{ width: '96px' }} />
                <col style={{ width: '84px' }} />
                <col style={{ width: '64px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="dashboardColCheckbox" style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      style={{ cursor: 'pointer' }}
                      checked={selectedIds.size > 0 && selectedIds.size === displayedItems.length} 
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
                  <th className="dashboardColReport" style={{ textAlign: 'center' }}>Report</th>
                </tr>
              </thead>

              <tbody>
                {displayedItems.length > 0 ? displayedItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`record-row ${item.id === lastOpenedId ? "isSelected" : ""}`}
                      title="Click to open details in a new tab"
                      onClick={(e) => handleRowClick(e, item.id)}
                      onAuxClick={(e) => handleRowAuxClick(e, item.id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          style={{ cursor: 'pointer' }}
                          checked={selectedIds.has(item.id)} 
                          onChange={(e) => handleSelectRow(e, item.id)} 
                        />
                      </td>
                      <td>
                        <strong>{item.hullNumber}</strong>
                      </td>
                      <td>{item.discipline}</td>
                      <td>{item.plannedDate}</td>
                      <td>R{item.currentRound}</td>
                      <td>
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
                          <svg className="rowOpenIcon" aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                      </td>
                      <td>
                        <span className={`resultBadge ${resultTone(item.currentResult)}`}>
                          {item.currentResult ? INSPECTION_RESULT_LABELS[item.currentResult] || item.currentResult : "PENDING"}
                        </span>
                      </td>
                      <td>{item.openComments}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button"
                          title="Generate Report"
                          aria-label={`Generate PDF report for ${item.hullNumber} ${item.itemName}`}
                          onClick={(e) => handleDownloadPdf(e, item.id)}
                          style={{
                             background: 'transparent',
                             border: 'none',
                             cursor: 'pointer',
                             padding: '6px',
                             borderRadius: '6px',
                             color: 'var(--nb-text-muted)',
                             transition: 'all 0.2s',
                             display: 'inline-flex',
                             alignItems: 'center',
                             justifyContent: 'center'
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--nb-primary)'; e.currentTarget.style.background = '#f1f5f9'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--nb-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                )) : (
                  <tr>
                    <td colSpan={9} className="emptyState" role="status">
                      {listLoading ? "Loading inspections..." : "No inspections match current filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
