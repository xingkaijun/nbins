import React, { useEffect, useState, useCallback } from "react";
import type { ObservationItem, ObservationType, InspectionCommentView, Discipline } from "@nbins/shared";
import { DISCIPLINES, DEFAULT_OBSERVATION_TYPES } from "@nbins/shared";
import {
  fetchObservations,
  fetchObservationTypes,
  fetchInspectionComments,
  createObservation,
  createObservationType,
  updateObservation,
  closeObservation,
  batchImportObservations,
  fetchProjects,
  fetchShips,
} from "../api";
import type { ProjectRecord, ShipRecord } from "../api";
import { exportObservationsPdf, exportObservationsExcel, exportObservationsAsciiPdf } from "../utils/export-tools";
import { resolveAvailableProjectId, useProjectContext } from "../project-context";

type ActiveTab = "observations" | "inspection-comments";

export function Observations() {
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  // 项目与船号级联
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [selectedShipId, setSelectedShipId] = useState("");

  // Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>("observations");

  // Observations 数据
  const [items, setItems] = useState<ObservationItem[]>([]);
  const [types, setTypes] = useState<ObservationType[]>([]);
  const [comments, setComments] = useState<InspectionCommentView[]>([]);
  const [loading, setLoading] = useState(true);

  // 筛选
  const [filterType, setFilterType] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 手动加载控制
  const [hasStarted, setHasStarted] = useState(false);

  // 新增表单
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("");
  const [formDiscipline, setFormDiscipline] = useState<string>("HULL");
  const [formLocation, setFormLocation] = useState("");
  const [formDate, setFormDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [formContent, setFormContent] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 新增类型
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");

  // 粘贴导入
  const [showImport, setShowImport] = useState(false);
  const [importType, setImportType] = useState("patrol");
  const [pasteText, setPasteText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);

  // 编辑弹窗
  const [editingItem, setEditingItem] = useState<ObservationItem | null>(null);
  const [editType, setEditType] = useState("");
  const [editDiscipline, setEditDiscipline] = useState<string>("HULL");
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editRemark, setEditRemark] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  /** Get effective disciplines for the currently selected project (empty = all presets) */
  const projectDisciplines: readonly string[] = (() => {
    const proj = projects.find(p => p.id === selectedProjectId);
    return proj && proj.disciplines && proj.disciplines.length > 0 ? proj.disciplines : DISCIPLINES;
  })();


  // ---- 加载项目列表 ----
  useEffect(() => {
    let active = true;

    fetchProjects().then((p) => {
      if (!active) {
        return;
      }

      setProjects(p);
      const nextProjectId = resolveAvailableProjectId(p, selectedProjectId);
      if (nextProjectId !== selectedProjectId) {
        setSelectedProjectId(nextProjectId);
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [selectedProjectId, setSelectedProjectId]);

  // ---- 项目变更 → 加载船列表 ----
  useEffect(() => {
    let active = true;

    if (!selectedProjectId) {
      setShips([]);
      setSelectedShipId("");
      return () => {
        active = false;
      };
    }

    setSelectedShipId("");
    fetchShips(selectedProjectId).then((s) => {
      if (!active) {
        return;
      }

      setShips(s);
      setSelectedShipId(s[0]?.id ?? "");
    }).catch(() => {
      if (!active) {
        return;
      }

      setShips([]);
      setSelectedShipId("");
    });

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  // ---- 加载意见类型 ----
  useEffect(() => {
    fetchObservationTypes().then((data) => {
      setTypes(data.length > 0 ? data : DEFAULT_OBSERVATION_TYPES.map((t, i) => ({ id: `default-${t.code}`, code: t.code, label: t.label, sortOrder: i, createdAt: "", updatedAt: "" })));
    }).catch(() => {
      setTypes(DEFAULT_OBSERVATION_TYPES.map((t, i) => ({ id: `default-${t.code}`, code: t.code, label: t.label, sortOrder: i, createdAt: "", updatedAt: "" })));
    });
  }, []);

  // ---- 加载数据 ----
  const loadData = useCallback(async () => {
    if (!selectedProjectId || !hasStarted) return;
    setLoading(true);
    try {
      if (activeTab === "observations") {
        const filters: Record<string, string> = { projectId: selectedProjectId };
        if (selectedShipId) filters.shipId = selectedShipId;
        if (filterType) filters.type = filterType;
        if (filterDiscipline) filters.discipline = filterDiscipline;
        if (filterStatus) filters.status = filterStatus;
        const data = await fetchObservations(filters);
        setItems(data);
      } else {
        const filters: Record<string, string> = { projectId: selectedProjectId };
        if (selectedShipId) filters.shipId = selectedShipId;
        if (filterDiscipline) filters.discipline = filterDiscipline;
        if (filterStatus) filters.status = filterStatus;
        const data = await fetchInspectionComments(filters);
        setComments(data);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [selectedProjectId, selectedShipId, activeTab, filterType, filterDiscipline, filterStatus, hasStarted]);

  useEffect(() => { if (hasStarted) void loadData(); }, [loadData, hasStarted]);

  // ---- 新增单条 ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formType || !formContent.trim() || !selectedShipId) return;
    
    // 按回车分割内容，每行创建一条 observation
    const lines = formContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) return;
    
    setSubmitting(true);
    try {
      // 为每一行创建一条 observation
      for (const content of lines) {
        await createObservation(selectedShipId, {
          type: formType, 
          discipline: formDiscipline,
          location: formLocation || undefined,
          date: formDate, 
          content: content,
          remark: formRemark || undefined,
        });
      }
      setFormContent(""); 
      setFormLocation(""); 
      setFormRemark(""); 
      setShowForm(false);
      void loadData();
    } catch (err: any) { 
      alert("Submit failed: " + (err.message || "Unknown error")); 
    } finally { 
      setSubmitting(false); 
    }
  };

  // ---- 单条编辑触发 ----
  const handleEditClick = (item: ObservationItem) => {
    setEditingItem(item);
    setEditType(item.type);
    setEditDiscipline(item.discipline);
    setEditDate(item.date);
    setEditLocation(item.location || "");
    setEditContent(item.content);
    setEditRemark(item.remark || "");
  };

  // ---- 提交编辑 ----
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editType || !editContent.trim()) return;
    setEditSubmitting(true);
    try {
      await updateObservation(editingItem.id, {
        type: editType,
        discipline: editDiscipline,
        date: editDate || undefined,
        location: editLocation || null,
        content: editContent.trim(),
        remark: editRemark || null,
      });
      setEditingItem(null);
      void loadData();
    } catch (err: any) { alert("Update failed: " + (err.message || "Unknown error")); }
    finally { setEditSubmitting(false); }
  };

  // ---- 关闭意见 ----
  const handleClose = async (id: string) => {
    try { await closeObservation(id); void loadData(); }
    catch (err: any) { alert("Close failed: " + (err.message || "Unknown error")); }
  };

  // ---- 导出相关 ----
  const handleExportPdf = () => {
    const selectedShip = ships.find(s => s.id === selectedShipId);
    const shipInfo = selectedShip ? `${selectedShip.shipName} (${selectedShip.hullNumber})` : "All Ships";
    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectInfo = {
      owner: selectedProject?.owner || undefined,
      shipyard: selectedProject?.shipyard || undefined,
      classification: selectedProject?.class || undefined
    };
    exportObservationsPdf(items, comments, getProjectName() || "All Projects", activeTab, shipInfo, projectInfo);
  };

  const handleExportAsciiPdf = () => {
    const selectedShip = ships.find(s => s.id === selectedShipId);
    const shipInfo = selectedShip ? `${selectedShip.shipName} (${selectedShip.hullNumber})` : "All Ships";
    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectInfo = {
      owner: selectedProject?.owner || undefined,
      shipyard: selectedProject?.shipyard || undefined,
      classification: selectedProject?.class || undefined
    };
    exportObservationsAsciiPdf(items, comments, getProjectName() || "All Projects", activeTab, shipInfo, projectInfo);
  };

  const handleExportExcel = async () => {
    try {
      const selectedShip = ships.find(s => s.id === selectedShipId);
      const shipInfo = selectedShip ? `${selectedShip.shipName} (${selectedShip.hullNumber})` : "All Ships";
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      const projectInfo = {
        owner: selectedProject?.owner || undefined,
        shipyard: selectedProject?.shipyard || undefined,
        classification: selectedProject?.class || undefined
      };
      await exportObservationsExcel(items, comments, getProjectName() || "All Projects", activeTab, shipInfo, projectInfo);
    } catch (err: any) {
      alert("Export Excel failed: " + (err.message || String(err)));
      console.error(err);
    }
  };

  // ---- 新增类型 ----
  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeCode.trim() || !newTypeLabel.trim()) return;
    try {
      await createObservationType({ code: newTypeCode.trim().toLowerCase().replace(/\s+/g, "_"), label: newTypeLabel.trim(), sortOrder: types.length });
      setNewTypeCode(""); setNewTypeLabel(""); setShowTypeForm(false);
      const data = await fetchObservationTypes();
      if (data.length > 0) setTypes(data);
    } catch (err: any) { alert("Add type failed: " + (err.message || "Unknown error")); }
  };

  // ---- 粘贴解析 ----
  const handleParse = () => {
    const lines = pasteText.trim().split("\n").filter(l => l.trim());
    const parsed: ParsedRow[] = lines.map((line, idx) => {
      const cols = line.split("\t");
      const discipline = (cols[0] || "").trim().toUpperCase();
      const location = (cols[1] || "").trim();
      const date = (cols[2] || "").trim();
      const content = (cols[3] || "").trim();
      const remark = (cols[4] || "").trim();
      const errors: string[] = [];
      if (!discipline || !projectDisciplines.includes(discipline)) errors.push("Invalid discipline");
      if (!date) errors.push("Missing date");
      if (!content) errors.push("Missing content");
      return { idx: idx + 1, discipline, location, date, content, remark, errors, valid: errors.length === 0 };
    });
    setParsedRows(parsed);
  };

  // ---- 批量导入 ----
  const handleImport = async () => {
    if (!selectedShipId) return;
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) return;
    setImportSubmitting(true);
    try {
      await batchImportObservations(selectedShipId, {
        type: importType,
        items: validRows.map(r => ({
          discipline: r.discipline,
          location: r.location || undefined,
          date: r.date,
          content: r.content,
          remark: r.remark || undefined,
        })),
      });
      setShowImport(false); setPasteText(""); setParsedRows([]);
      void loadData();
    } catch (err: any) { alert("Import failed: " + (err.message || "Unknown error")); }
    finally { setImportSubmitting(false); }
  };

  const getTypeLabel = (code: string) => types.find(t => t.code === code)?.label ?? code;
  const getProjectName = () => projects.find(p => p.id === selectedProjectId)?.name ?? "";
  const validCount = parsedRows.filter(r => r.valid).length;

  return (
    <main className="workspace" style={{ display: "flex", flexDirection: "column" }}>
      {/* 页面标题区 */}
      <section className="hero" style={{ paddingBottom: 16 }}>
        <div>
          <p className="eyebrow">PUNCH LIST MANAGEMENT</p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>
              {getProjectName() ? `Project: ${getProjectName()}` : "ALL PROJECTS"}
            </h2>
          </div>
        </div>
        <div className="heroMeta" style={{ gap: 8 }}>
          <button type="button" onClick={handleExportPdf}>EXPORT PDF</button>
          <button type="button" onClick={handleExportAsciiPdf} style={{ background: '#475569', color: '#fff' }}>ASCII REPORT</button>
          <button type="button" onClick={handleExportExcel}>EXPORT EXCEL</button>
          {activeTab === "observations" && (
            <>
              <button type="button" onClick={() => setShowTypeForm(!showTypeForm)}>+ CUSTOM TYPE</button>
              <button type="button" onClick={() => setShowImport(!showImport)}>PASTE IMPORT</button>
            </>
          )}
        </div>
      </section>

      {/* 项目/船号筛选 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={inlineLabelStyle}>
          <span>Project</span>
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} style={selectStyle}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </label>
        <label style={inlineLabelStyle}>
          <span>Ship</span>
          <select value={selectedShipId} onChange={e => setSelectedShipId(e.target.value)} style={selectStyle}>
            <option value="">All ships</option>
            {ships.map(s => <option key={s.id} value={s.id}>{s.shipName} ({s.hullNumber})</option>)}
          </select>
        </label>
      </div>

      {/* Tabs & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, borderBottom: "2px solid var(--nb-border, #e2e8f0)" }}>
        <div style={{ display: "flex", gap: 0 }}>
          <button onClick={() => setActiveTab("observations")} style={tabStyle(activeTab === "observations")}>Punch List</button>
          <button onClick={() => setActiveTab("inspection-comments")} style={tabStyle(activeTab === "inspection-comments")}>Inspection Comments</button>
        </div>
        {activeTab === "observations" && (
          <div style={{ paddingBottom: 6 }}>
            <button onClick={() => setShowForm(!showForm)} style={{ ...btnStyle("primary"), background: "var(--nb-accent)", color: "#fff" }}>+ NEW PUNCH ITEM</button>
          </div>
        )}
      </div>

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {activeTab === "observations" && (
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
            <option value="">All Types</option>
            {types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        )}
        <select value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)} style={selectStyle}>
          <option value="">All Disciplines</option>
          {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg style={{ position: 'absolute', left: 8, pointerEvents: 'none', color: 'var(--nb-text-muted)' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder={activeTab === 'observations' ? 'Search content, location, remark...' : 'Search item name or comment...'}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{
              ...inputStyle,
              paddingLeft: 26,
              width: 240,
            }}
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword('')}
              style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nb-text-muted)', fontSize: 12, padding: 2, lineHeight: 1 }}
            >✕</button>
          )}
        </div>
        <button
          onClick={() => setHasStarted(true)}
          style={{ ...btnStyle("primary"), background: "var(--nb-accent)", color: "#fff" }}
        >
          {hasStarted ? "REFRESH" : "START"}
        </button>
        <span style={{ fontSize: 12, color: "var(--nb-text-muted)", fontWeight: 600 }}>
          {activeTab === "observations" ? `${items.length} records` : `${comments.length} records`}
        </span>
      </div>

      {/* 新增类型 */}
      {showTypeForm && (
        <form onSubmit={handleAddType} style={formBoxStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Add Custom Punch List Type</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <label style={fieldLabelStyle}><span>Code</span><input type="text" value={newTypeCode} onChange={e => setNewTypeCode(e.target.value)} placeholder="e.g. hatch_cover" style={inputStyle} required /></label>
            <label style={fieldLabelStyle}><span>Label</span><input type="text" value={newTypeLabel} onChange={e => setNewTypeLabel(e.target.value)} placeholder="e.g. Hatch Cover" style={inputStyle} required /></label>
            <button type="submit" style={btnStyle("primary")}>Add</button>
            <button type="button" onClick={() => setShowTypeForm(false)} style={btnStyle("secondary")}>Cancel</button>
          </div>
        </form>
      )}

      {/* 粘贴导入弹窗 */}
      {showImport && (
        <div style={formBoxStyle}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Paste Import</h3>
          <p style={{ fontSize: 12, color: "var(--nb-text-muted)", margin: "0 0 12px" }}>
            Expected columns (tab-separated): <strong>Discipline | Location | Date | Content | Remark</strong>
          </p>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
            <label style={fieldLabelStyle}>
              <span>Type</span>
              <select value={importType} onChange={e => setImportType(e.target.value)} style={inputStyle}>
                {types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <textarea
            value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder="Paste rows from Excel here..."
            rows={5} style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={handleParse} style={btnStyle("secondary")}>Parse</button>
            <button onClick={() => { setShowImport(false); setPasteText(""); setParsedRows([]); }} style={btnStyle("secondary")}>Cancel</button>
          </div>

          {parsedRows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Preview ({validCount} / {parsedRows.length} valid)</h4>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--nb-border)", borderRadius: 6 }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--nb-surface)", borderBottom: "1px solid var(--nb-border)" }}>
                    <th style={thStyle}>S/N</th><th style={thStyle}>Disc</th><th style={thStyle}>Location</th><th style={thStyle}>Date</th><th style={thStyle}>Content</th><th style={thStyle}>Remark</th><th style={thStyle}>Status</th>
                  </tr></thead>
                  <tbody>
                    {parsedRows.map(r => (
                      <tr key={r.idx} style={{ borderBottom: "1px solid var(--nb-border)", background: r.valid ? "transparent" : "#fef2f2" }}>
                        <td style={tdStyle}>{r.idx}</td><td style={tdStyle}>{r.discipline}</td><td style={tdStyle}>{r.location}</td>
                        <td style={tdStyle}>{r.date}</td><td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.content}</td>
                        <td style={tdStyle}>{r.remark}</td>
                        <td style={tdStyle}>{r.valid ? <span style={{ color: "#22c55e" }}>✓</span> : <span style={{ color: "#ef4444" }}>{r.errors.join(", ")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validCount > 0 && (
                <button onClick={handleImport} disabled={importSubmitting} style={{ ...btnStyle("primary"), marginTop: 8 }}>
                  {importSubmitting ? "Importing..." : `Import ${validCount} rows`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 新增意见表单 */}
      {showForm && (
        <form onSubmit={handleSubmit} style={formBoxStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>New Punch List Item</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={fieldLabelStyle}><span>Type</span>
              <select value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle} required>
                <option value="">-- Select --</option>
                {types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            <label style={fieldLabelStyle}><span>Discipline</span>
              <select value={formDiscipline} onChange={e => setFormDiscipline(e.target.value)} style={inputStyle}>
                {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label style={fieldLabelStyle}><span>Location</span>
              <input type="text" value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. FR120" style={inputStyle} />
            </label>
            <label style={fieldLabelStyle}><span>Date</span>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputStyle} required />
            </label>
          </div>
          <label style={{ ...fieldLabelStyle, marginTop: 12, display: "block" }}><span>Content (one per line)</span>
            <textarea value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="Enter punch list items, one per line..." rows={3} style={{ ...inputStyle, resize: "vertical", width: "100%" }} required />
          </label>
          <label style={{ ...fieldLabelStyle, marginTop: 8, display: "block" }}><span>Remark</span>
            <input type="text" value={formRemark} onChange={e => setFormRemark(e.target.value)} placeholder="Optional remark" style={{ ...inputStyle, width: "100%" }} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={submitting} style={btnStyle("primary")}>{submitting ? "Submitting..." : "Submit"}</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnStyle("secondary")}>Cancel</button>
          </div>
        </form>
      )}

      {/* 主内容区 */}
      {!hasStarted ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 14 }}>Select filters and click START to load data</p>
        </div>
      ) : loading ? (
        <p style={{ color: "var(--nb-text-muted)", textAlign: "center", padding: 40 }}>Loading...</p>
      ) : activeTab === "observations" ? (
        (() => {
          const kw = searchKeyword.toLowerCase();
          const filteredItems = searchKeyword
            ? items.filter(item =>
                item.content.toLowerCase().includes(kw)
                || (item.remark || "").toLowerCase().includes(kw)
                || (item.location || "").toLowerCase().includes(kw)
                || item.discipline.toLowerCase().includes(kw)
                || (item.authorName || "").toLowerCase().includes(kw)
              )
            : items;
          return filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
            <p style={{ fontSize: 14 }}>No punch list records found</p>
            <p style={{ fontSize: 12 }}>Click "+ New Punch Item" or "Paste Import" to start adding.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--nb-border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--nb-surface)", borderBottom: "2px solid var(--nb-border)" }}>
                <th style={thStyle}>S/N</th><th style={thStyle}>Type</th><th style={thStyle}>Discipline</th>
                <th style={thStyle}>Location</th><th style={thStyle}>Date</th><th style={thStyle}>Content</th>
                <th style={thStyle}>Author</th><th style={thStyle}>Status</th><th style={thStyle}>Action</th>
              </tr></thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--nb-border)" }}>
                    <td style={tdStyle}>{item.discipline ? `${item.discipline.substring(0, 3).toUpperCase()}-${item.serialNo}` : item.serialNo}</td>
                    <td style={tdStyle}><span style={tagStyle("#6366f1")}>{getTypeLabel(item.type)}</span></td>
                    <td style={tdStyle}><span style={tagStyle("#0ea5e9")}>{item.discipline}</span></td>
                    <td style={tdStyle}>{item.location || "—"}</td>
                    <td style={tdStyle}>{item.date}</td>
                    <td style={{ ...tdStyle, maxWidth: 280, wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}>{item.content}</td>
                    <td style={tdStyle}>{item.authorName ?? item.authorId}</td>
                    <td style={tdStyle}><span style={tagStyle(item.status === "open" ? "#f59e0b" : "#22c55e")}>{item.status.toUpperCase()}</span></td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => handleEditClick(item)} style={{ ...btnStyle("secondary"), fontSize: 10, padding: "3px 6px" }}>Edit</button>
                        {item.status === "open" && <button onClick={() => handleClose(item.id)} style={{ ...btnStyle("secondary"), fontSize: 10, padding: "3px 6px", color: "#166534" }}>Close</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        })()
      ) : (
        (() => {
          const kw = searchKeyword.toLowerCase();
          const filteredComments = searchKeyword
            ? comments.filter(cm =>
                cm.content.toLowerCase().includes(kw)
                || cm.inspectionItemName.toLowerCase().includes(kw)
                || cm.hullNumber.toLowerCase().includes(kw)
                || cm.discipline.toLowerCase().includes(kw)
                || cm.authorName.toLowerCase().includes(kw)
              )
            : comments;
          return filteredComments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
            <p style={{ fontSize: 14 }}>No inspection comments found</p>
            <p style={{ fontSize: 12 }}>Inspection comments are generated from the inspection submission workflow.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--nb-border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--nb-surface)", borderBottom: "2px solid var(--nb-border)" }}>
                <th style={thStyle}>S/N</th><th style={thStyle}>Ship</th><th style={thStyle}>Discipline</th>
                <th style={thStyle}>Inspection Item</th><th style={thStyle}>Round</th><th style={thStyle}>Content</th>
                <th style={thStyle}>Author</th><th style={thStyle}>Status</th><th style={thStyle}>Closed At</th>
              </tr></thead>
              <tbody>
                {filteredComments.map(cm => (
                  <tr key={cm.id} style={{ borderBottom: "1px solid var(--nb-border)" }}>
                    <td style={tdStyle}>{cm.localId}</td>
                    <td style={tdStyle}>{cm.hullNumber}</td>
                    <td style={tdStyle}><span style={tagStyle("#0ea5e9")}>{cm.discipline}</span></td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cm.inspectionItemName}</td>
                    <td style={tdStyle}>R{cm.roundNumber}</td>
                    <td style={{ ...tdStyle, maxWidth: 280, wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}>{cm.content}</td>
                    <td style={tdStyle}>{cm.authorName}</td>
                    <td style={tdStyle}><span style={tagStyle(cm.status === "open" ? "#f59e0b" : "#22c55e")}>{cm.status.toUpperCase()}</span></td>
                    <td style={tdStyle}>{cm.closedAt ? cm.closedAt.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        })()
      )}

      {/* 编辑弹窗 */}
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", display: "grid", placeItems: "center", zIndex: 9999 }}>
          <form style={{ ...formBoxStyle, width: "95%", maxWidth: 650, margin: 0, background: "var(--nb-panel)", borderRadius: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", padding: 24 }} onSubmit={handleEditSubmit}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800 }}>Edit Punch Item #{editingItem.discipline ? `${editingItem.discipline.substring(0, 3).toUpperCase()}-${editingItem.serialNo}` : editingItem.serialNo}</h3>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <label style={fieldLabelStyle}><span>Type</span>
                <select value={editType} onChange={e => setEditType(e.target.value)} style={{ ...inputStyle, width: '100%' }} required>
                  {types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </label>
              <label style={fieldLabelStyle}><span>Discipline</span>
                <select value={editDiscipline} onChange={e => setEditDiscipline(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label style={fieldLabelStyle}><span>Date</span>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} required />
              </label>
            </div>
            <label style={{ ...fieldLabelStyle, marginTop: 16, display: "block" }}><span>Location</span>
              <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </label>
            <label style={{ ...fieldLabelStyle, marginTop: 12, display: "block" }}><span>Content</span>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", width: "100%" }} required />
            </label>
            <label style={{ ...fieldLabelStyle, marginTop: 12, display: "block" }}><span>Remark</span>
              <input type="text" value={editRemark} onChange={e => setEditRemark(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button type="button" onClick={() => setEditingItem(null)} style={btnStyle("secondary")}>Cancel</button>
              <button type="submit" disabled={editSubmitting} style={{ ...btnStyle("primary"), background: "var(--nb-accent)", color: "#fff" }}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

// ---- 数据类型 ----
interface ParsedRow {
  idx: number;
  discipline: string;
  location: string;
  date: string;
  content: string;
  remark: string;
  errors: string[];
  valid: boolean;
}

// ---- 内联样式 ----
function btnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  const base: React.CSSProperties = { border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "background 0.15s", letterSpacing: "0.02em" };
  if (variant === "primary") return { ...base, background: "var(--nb-text, #1e293b)", color: "#fff" };
  return { ...base, background: "var(--nb-surface, #f1f5f9)", color: "var(--nb-text, #334155)", border: "1px solid var(--nb-border, #e2e8f0)" };
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: "none", borderBottom: active ? "2px solid var(--nb-text)" : "2px solid transparent",
    background: "transparent", color: active ? "var(--nb-text)" : "var(--nb-text-muted)",
    transition: "all 0.15s", letterSpacing: "0.02em",
  };
}

const formBoxStyle: React.CSSProperties = { background: "var(--nb-surface)", border: "1px solid var(--nb-border)", borderRadius: 10, padding: "16px 20px", marginBottom: 16 };
const fieldLabelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--nb-text-muted)", fontWeight: 600 };
const inlineLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--nb-text-muted)", fontWeight: 600 };
const inputStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--nb-border, #e2e8f0)", fontSize: 13, background: "var(--nb-bg, #fff)", color: "var(--nb-text, #334155)", minWidth: 130 };
const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 150 };
const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--nb-text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };

function tagStyle(color: string): React.CSSProperties {
  return { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${color}18`, color, letterSpacing: 0.5, textTransform: "uppercase" as const };
}
