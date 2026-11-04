import React, { useState, useEffect, useMemo } from 'react';
import { DISCIPLINES } from '@nbins/shared';
import { fetchProjects, fetchShips, batchImportInspections } from '../api.ts';
import { useProjectContext } from '../project-context';
import { useToast } from "../components/Toast";
import type { ProjectRecord, ShipRecord } from '../api/types.ts';
import { findImportColumns, removeRowsByUid, resolveShip, rowIssues, submitStaging, type ImportOutcome, type StagingRow } from '../import-staging.ts';

let _uid = 0;
function nextUid() { return `stg-${Date.now()}-${++_uid}`; }

export function Import() {
  const toast = useToast();
  const { selectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [loadedProjectId, setLoadedProjectId] = useState('');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const alive = React.useRef(false);
  const busyRef = React.useRef(false);
  const projectRef = React.useRef(selectedProjectId);
  projectRef.current = selectedProjectId;

  const [selectedShip, setSelectedShip] = useState('');

  // 全局 Date 与 Discipline（仅用于 Parse 时默认值）
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('HULL');

  const [pastedData, setPastedData] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // ── 暂存清单（购物车） ──
  const [staging, setStaging] = useState<StagingRow[]>([]);

  // ── 行内编辑 ──
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StagingRow>>({});

  // ── Drag & Drop ──
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetchProjects().then(data => {
      if (active) { setProjects(data); setProjectsLoaded(true); }
    }).catch(() => { if (active) toast.error('Failed to load projects.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadedProjectId('');
    setShips([]);
    setSelectedShip('');
    if (selectedProjectId) {
      fetchShips().then(data => {
        if (!active) return;
        const projectShips = data.filter(s => s.projectId === selectedProjectId);
        setShips(projectShips);
        setSelectedShip(projectShips[0]?.id || '');
        setLoadedProjectId(selectedProjectId);
      }).catch(() => { if (active) toast.error('Failed to load ships.'); });
    }
    return () => { active = false; };
  }, [selectedProjectId]);

  const ready = projectsLoaded && !!selectedProjectId && loadedProjectId === selectedProjectId && projects.some(p => p.id === selectedProjectId);
  const busy = isParsing || isImporting;
  const projectDisciplines: readonly string[] = (() => {
    const proj = projects.find(p => p.id === selectedProjectId);
    return proj && proj.disciplines && proj.disciplines.length > 0 ? proj.disciplines : DISCIPLINES;
  })();

  // ── Parse → 追加到暂存 ──
  const handleParse = () => {
    if (!ready || busyRef.current || !pastedData.trim()) return;
    const lines = pastedData.trim().split('\n');
    const newRows: StagingRow[] = [];

    // 获取当前选中船只的hull号
    const currentShip = ships.find(s => s.id === selectedShip);
    const currentHullLabel = currentShip?.hullNumber || '-';

    lines.forEach((line) => {
      let cols: string[];
      if (line.includes('\t')) {
        cols = line.split('\t').map(s => s.trim());
      } else {
        cols = line.split(/[,，]/).map(s => s.trim());
      }
      const item = cols[0] || '';
      const qc = cols[1] || '';
      const reinspectVal = parseInt(cols[2] || "1", 10);
      const startAtRound = isNaN(reinspectVal) ? 1 : Math.min(Math.max(reinspectVal, 1), 3);

      if (!item) return; // skip empty lines

      newRows.push({
        uid: nextUid(),
        item,
        discipline: selectedDiscipline,
        date: selectedDate,
        qc: qc || '-',
        startAtRound,
        shipId: selectedShip,
        hullLabel: currentHullLabel,
      });
    });

    if (newRows.length > 0) {
      setStaging(prev => [...prev, ...newRows]);
      setPastedData('');
    }
  };

  const parseExcelFile = async (file: File) => {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setIsParsing(true);
    const projectId = selectedProjectId;
    const isCurrent = () => alive.current && projectRef.current === projectId;
    try {
      const { read, utils } = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false });
      const newRows: StagingRow[] = [];
      const columns = findImportColumns(json);
      const { item: itemIdx, date: dateIdx, hull: hullIdx, qc: qcIdx, round: roundIdx } = columns;
      for (let i = columns.start; i < json.length; i++) {
        const row = json[i];
        if (!Array.isArray(row)) continue;

        const rawItem = String(row[itemIdx] || '').trim();
        if (!rawItem) continue;

        let rawDate = dateIdx !== -1 ? String(row[dateIdx] || '').trim() : selectedDate;
        let rawHull = hullIdx !== -1 ? String(row[hullIdx] || '').trim() : '';
        let rawQc = qcIdx !== -1 ? String(row[qcIdx] || '').trim() : '-';
        let rawRound = roundIdx !== -1 ? parseInt(String(row[roundIdx] || "1"), 10) : 1;
        
        const resolvedShip = resolveShip(rawHull, ships, selectedShip);
        
        let finalDate = selectedDate;
        if (rawDate && rawDate.match(/[\d-./]/)) {
            finalDate = rawDate; 
        }

        const startAtRound = isNaN(rawRound) ? 1 : Math.min(Math.max(rawRound, 1), 3);

        newRows.push({
          uid: nextUid(),
          item: rawItem,
          discipline: selectedDiscipline,
          date: finalDate,
          qc: rawQc || '-',
          startAtRound,
          ...resolvedShip
        });
      };

      if (!isCurrent()) return;
      if (newRows.length > 0) {
        setStaging(prev => [...prev, ...newRows]);
      } else {
        toast.error("No valid items found in the Excel file.");
      }
    } catch (err: unknown) {
      if (isCurrent()) toast.error("Failed to parse Excel file: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!busyRef.current && ready) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (busyRef.current || !ready) return;
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      await parseExcelFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (file) {
      await parseExcelFile(file);
    }
    input.value = '';
  };

  // ── 暂存操作 ──
  const handleDeleteStaging = (uid: string) => {
    if (busyRef.current) return;
    setStaging(prev => prev.filter(r => r.uid !== uid));
    if (editingUid === uid) setEditingUid(null);
  };

  const handleEditStart = (row: StagingRow) => {
    if (busyRef.current) return;
    setEditingUid(row.uid);
    setEditForm({ item: row.item, discipline: row.discipline, date: row.date, qc: row.qc, startAtRound: row.startAtRound, shipId: row.shipId, hullLabel: row.hullLabel });
  };

  const handleEditSave = () => {
    if (!editingUid || busyRef.current) return;
    setStaging(prev => prev.map(r => r.uid === editingUid
      ? { ...r, ...editForm }
      : r
    ));
    setEditingUid(null);
  };

  const handleClearStaging = () => {
    if (busyRef.current || staging.length === 0 || !confirm("Clear the staging list?")) return;
    setStaging([]);
    setEditingUid(null);
  };

  // ── 按专业分组统计 ──
  const disciplineGroups = useMemo(() => {
    const map = new Map<string, number>();
    staging.forEach(r => map.set(r.discipline, (map.get(r.discipline) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [staging]);

  const issuesByUid = useMemo(() => new Map(staging.map(row => [row.uid, rowIssues(row, selectedProjectId || '', ships, projectDisciplines)])), [staging, selectedProjectId, ships, projectDisciplines]);
  const invalidCount = staging.filter(row => (issuesByUid.get(row.uid)?.length ?? 0) > 0).length;

  const handleImport = async () => {
    if (!ready || busyRef.current || editingUid || invalidCount || !staging.length || !selectedProjectId) return;
    busyRef.current = true;
    if (!confirm(`Submit ${staging.length} inspection records to the database?`)) { busyRef.current = false; return; }
    const projectId = selectedProjectId;
    const isCurrent = () => alive.current && projectRef.current === projectId;
    setIsImporting(true);
    setOutcome(null);
    try {
      const result = await submitStaging({
        projectId, rows: staging, ships, disciplines: projectDisciplines,
        request: batchImportInspections,
        shouldContinue: isCurrent,
        onSuccess: rows => { if (isCurrent()) setStaging(prev => removeRowsByUid(prev, rows)); }
      });
      if (isCurrent()) {
        setOutcome(result);
        if (result.failedShip) toast.error(`Import stopped at ${result.failedShip}: ${result.error}`);
        else toast.success(`Imported ${result.succeeded} inspection ${result.succeeded === 1 ? 'record' : 'records'}.`);
      }
    } catch (error: unknown) {
      if (isCurrent()) toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setIsImporting(false);
    }
  };

  const getDisciplineColor = (d: string) => {
    switch (d) {
      case 'HULL': return '#1d4ed8';
      case 'OUTFIT': return '#0f766e';
      case 'PAINT': return '#be185d';
      case 'ELEC': return '#c2410c';
      case 'CCS': return '#15803d';
      default: return '#475569';
    }
  };

  const stepBadge = (n: number) => (
    <span style={{ background: 'var(--nb-accent)', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>{n}</span>
  );

  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectName = currentProject ? `${currentProject.name} (${currentProject.code})` : '';

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--nb-border)' }}>
        <div>
          <p className="eyebrow">NBINS CORE MODULE</p>
          <h2>MANUAL DATA IMPORT</h2>
          {projectName && (
            <p style={{ fontSize: '16px', color: 'var(--nb-text)', margin: '8px 0 0', fontWeight: 600 }}>
              Project: {projectName}
            </p>
          )}
        </div>
      </section>


      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* ═══════  左侧：配置 + 粘贴  ═══════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Step 1 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              {stepBadge(1)}
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Global Import Configuration</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <span>Ship / Hull No.</span>
                <select className="filterSelect" value={selectedShip} onChange={e => setSelectedShip(e.target.value)} disabled={!ready}>
                  {!selectedShip && <option value="">Select a ship</option>}
                  {ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} ({s.shipName})</option>)}
                </select>
              </div>
              <div className="field">
                <span>Discipline</span>
                <select className="filterSelect" value={selectedDiscipline} onChange={e => setSelectedDiscipline(e.target.value)}>
                  {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <span>Date</span>
                <input type="date" className="filterSelect" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {stepBadge(2)}
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Import Data</h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--nb-text-muted)' }}>Paste text or Drop Excel</span>
            </div>
            
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: isDragging ? '2px dashed var(--nb-accent)' : '2px dashed transparent',
                background: isDragging ? 'var(--nb-accent-soft)' : 'transparent',
                borderRadius: '8px',
                transition: 'all 0.2s ease',
                margin: '-2px',
                padding: '2px'
              }}
            >
              <div className="field">
                <textarea
                  rows={9}
                  placeholder={`✏️ Paste your raw text data here...\n\nExample format:\nMain Engine Alignment    Zhang San    1\nPipe System Test         Li Si        2\n\nColumn 3: 1 = Round 1, 2 = Round 2, 3 = Round 3\n\n\n✨ OR DRAG & DROP AN EXCEL FILE (.xlsx) HERE`}
                  value={pastedData}
                  onChange={e => setPastedData(e.target.value)}
                  style={{ fontFamily: 'monospace', whiteSpace: 'pre', fontSize: '11px', background: isDragging ? 'transparent' : undefined }}
                />
              </div>
            </div>
            
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button className="submitButton" onClick={handleParse} disabled={!ready || busy || !pastedData.trim()} style={{ flex: 1 }}>
                Parse Details & Append ➔
              </button>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileSelect} ref={fileInputRef} disabled={!ready || busy} style={{ display: 'none' }} />
              <button 
                className="submitButton" 
                onClick={() => fileInputRef.current?.click()}
                disabled={!ready || busy}
                style={{ flex: 1, background: '#fff', color: 'var(--nb-text)', border: '1px solid var(--nb-border)', boxShadow: 'none' }}
              >
                📁 Select Excel File
              </button>
            </div>
          </section>
        </div>

        {/* ═══════  右侧：暂存清单  ═══════ */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stepBadge(3)}
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
                Staging Queue
                {staging.length > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: 'var(--nb-accent)' }}>({staging.length})</span>}
              </h3>
            </div>
            {staging.length > 0 && (
              <button className="submitButton" onClick={handleClearStaging}
                style={{ background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', boxShadow: 'none', fontSize: 10, padding: '4px 10px' }}>
                Clear All
              </button>
            )}
          </div>

          {staging.length > 0 && <p style={{ fontSize: 12 }}>{staging.length - invalidCount} valid · {invalidCount} need confirmation</p>}
          {outcome && (
            <div role="status" style={{ marginBottom: 12, padding: 12, border: '1px solid var(--nb-border)', borderRadius: 8, fontSize: 12 }}>
              <div>Last import: {outcome.succeeded} succeeded · {outcome.remaining} remaining</div>
              {outcome.failedShip && <div>Stopped at ship {outcome.failedShip}: {outcome.error}</div>}
              {outcome.unknown && <div>Result not confirmed. Check the database before deciding whether to retry. No automatic retry was attempted.</div>}
            </div>
          )}
          {!ready && <p style={{ fontSize: 12 }}>Project and ship data must finish loading before import.</p>}
          {disciplineGroups.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {disciplineGroups.map(([disc, count]) => (
                <span key={disc} style={{
                  fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', letterSpacing: '0.05em',
                  background: `${getDisciplineColor(disc)}12`, color: getDisciplineColor(disc), border: `1px solid ${getDisciplineColor(disc)}30`
                }}>
                  {disc} × {count}
                </span>
              ))}
            </div>
          )}

          {staging.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              minHeight: '320px', border: '2px dashed var(--nb-border)', borderRadius: '12px',
              color: 'var(--nb-text-muted)', gap: 8
            }}>
              <span style={{ fontSize: 28, opacity: 0.3 }}>📋</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Staging list is empty</span>
              <span style={{ fontSize: 10 }}>Paste data on the left and click Parse; items will appear here</span>
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid var(--nb-border)', borderRadius: '10px', overflow: 'hidden', maxHeight: '460px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--nb-bg)', borderBottom: '2px solid var(--nb-border)', position: 'sticky', top: 0 }}>
                      <th style={thS}>#</th>
                      <th style={thS}>Inspection Item</th>
                      <th style={thS}>Disc.</th>
                      <th style={thS}>Hull</th>
                      <th style={thS}>Date</th>
                      <th style={thS}>QC</th>
                      <th style={{ ...thS, textAlign: 'center' }}>Rnd</th>
                      <th style={{ ...thS, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staging.map((r, idx) => {
                      const isEditing = editingUid === r.uid;
                      return (
                        <tr key={r.uid} style={{ borderBottom: '1px solid var(--nb-border)', background: isEditing ? '#f0fdfa' : 'transparent' }}>
                          <td style={tdS}>{idx + 1}</td>
                          {isEditing ? (
                            <>
                              <td style={tdS}><input value={editForm.item || ''} onChange={e => setEditForm(f => ({ ...f, item: e.target.value }))} style={cellInput} /></td>
                              <td style={tdS}>
                                <select value={editForm.discipline || ''} onChange={e => setEditForm(f => ({ ...f, discipline: e.target.value }))} style={cellInput}>
                                  {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </td>
                              <td style={tdS}>
                                <select 
                                  value={editForm.shipId || ''} 
                                  onChange={e => {
                                    const matched = ships.find(s => s.id === e.target.value);
                                    setEditForm(f => ({ ...f, shipId: e.target.value, hullLabel: matched?.hullNumber || r.hullLabel, shipIssue: matched ? undefined : 'Select a ship' }))
                                  }} 
                                  style={cellInput}
                                >
                                  <option value="">Select a ship</option>
                                  {ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber}</option>)}
                                </select>
                              </td>
                              <td style={tdS}><input type="date" value={editForm.date || ''} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={cellInput} /></td>
                              <td style={tdS}><input value={editForm.qc || ''} onChange={e => setEditForm(f => ({ ...f, qc: e.target.value }))} style={cellInput} /></td>
                              <td style={{ ...tdS, textAlign: 'center' }}>
                                <select value={editForm.startAtRound || 1} onChange={e => setEditForm(f => ({ ...f, startAtRound: Number(e.target.value) }))} style={cellInput}>
                                  <option value={1}>1</option><option value={2}>R2</option><option value={3}>R3</option>
                                </select>
                              </td>
                              <td style={{ ...tdS, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                  <button onClick={handleEditSave} style={actionBtn}>✔</button>
                                  <button onClick={() => setEditingUid(null)} style={{ ...actionBtn, color: '#94a3b8' }}>✗</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ ...tdS, fontWeight: 600 }}>{r.item}{(issuesByUid.get(r.uid)?.length ?? 0) > 0 && <div style={{ color: '#b91c1c', fontSize: 10 }}>Needs confirmation: {issuesByUid.get(r.uid)?.join('; ')}</div>}</td>
                              <td style={tdS}>
                                <span style={{
                                  fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em',
                                  background: `${getDisciplineColor(r.discipline)}15`, color: getDisciplineColor(r.discipline)
                                }}>
                                  {r.discipline}
                                </span>
                              </td>
                              <td style={tdS}>{r.hullLabel}</td>
                              <td style={tdS}>{r.date}</td>
                              <td style={tdS}>{r.qc}</td>
                              <td style={{ ...tdS, textAlign: 'center' }}>
                                {r.startAtRound === 1 ? <span style={{ color: 'var(--nb-text-muted)' }}>1</span>
                                  : r.startAtRound === 2 ? <span style={{ color: '#0f766e', fontWeight: 'bold' }}>R2</span>
                                  : <span style={{ color: '#b45309', fontWeight: 'bold' }}>R3</span>}
                              </td>
                              <td style={{ ...tdS, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                  <button onClick={() => handleEditStart(r)} style={actionBtn} title="Edit">✎</button>
                                  <button onClick={() => handleDeleteStaging(r.uid)} style={{ ...actionBtn, color: '#dc2626' }} title="Delete">✕</button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 底部提交栏 */}
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Total Items</span>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--nb-accent)' }}>{staging.length}</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Disciplines</span>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--nb-text)' }}>{disciplineGroups.length}</span>
                  </div>
                </div>
                <button className="submitButton" onClick={handleImport} disabled={!ready || busy || !!editingUid || invalidCount > 0 || staging.length === 0}>
                  {isImporting ? 'Importing…' : `Confirm Import (${staging.length})`}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
      </fieldset>
    </main>
  );
}

// ── 内联微样式 ──
const thS: React.CSSProperties = { padding: '8px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--nb-text-muted)', textAlign: 'left', whiteSpace: 'nowrap' };
const tdS: React.CSSProperties = { padding: '6px 10px', fontSize: 12, verticalAlign: 'middle' };
const cellInput: React.CSSProperties = { width: '100%', padding: '3px 6px', fontSize: 11, border: '1px solid var(--nb-border)', borderRadius: 6, background: '#fff' };
const actionBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: '2px 4px', color: 'var(--nb-accent)', fontWeight: 'bold' };
