import React, { useState, useEffect, useMemo } from 'react';
import { DISCIPLINES } from '@nbins/shared';
import { fetchProjects, fetchShips, batchImportInspections } from '../api.ts';

/** A single staging row — parsed from text but NOT yet in DB */
interface StagingRow {
  /** Unique key for React */
  uid: string;
  item: string;
  discipline: string;
  date: string;
  qc: string;
  startAtRound: number;
  shipId?: string;
  hullLabel?: string;
}

let _uid = 0;
function nextUid() { return `stg-${Date.now()}-${++_uid}`; }

export function Import() {
  const [projects, setProjects] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);

  const [selectedProject, setSelectedProject] = useState('');
  const [selectedShip, setSelectedShip] = useState('');

  // 全局 Date 与 Discipline（仅用于 Parse 时默认值）
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('HULL');

  const [pastedData, setPastedData] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number } | null>(null);

  // ── 暂存清单（购物车） ──
  const [staging, setStaging] = useState<StagingRow[]>([]);

  // ── 行内编辑 ──
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StagingRow>>({});

  // ── Drag & Drop ──
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load backend data
  useEffect(() => {
    fetchProjects().then(data => {
      setProjects(data);
      if (data.length > 0) {
        setSelectedProject(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchShips().then(data => {
        const projectShips = data.filter(s => s.projectId === selectedProject);
        setShips(projectShips);
        if (projectShips.length > 0) {
          setSelectedShip(projectShips[0].id);
        } else {
          setSelectedShip('');
        }
      });
    }
  }, [selectedProject]);

  /** Get effective disciplines for the currently selected project (empty = all presets) */
  const projectDisciplines: readonly string[] = (() => {
    const proj = projects.find((p: any) => p.id === selectedProject);
    return proj && proj.disciplines && proj.disciplines.length > 0 ? proj.disciplines : DISCIPLINES;
  })();

  // ── Parse → 追加到暂存 ──
  const handleParse = () => {
    if (!pastedData.trim()) return;
    const lines = pastedData.trim().split('\n');
    const newRows: StagingRow[] = [];

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
      });
    });

    if (newRows.length > 0) {
      setStaging(prev => [...prev, ...newRows]);
      setPastedData('');
    }
  };

  const parseExcelFile = async (file: File) => {
    try {
      const { read, utils } = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = utils.sheet_to_json<any>(worksheet, { header: 1, raw: false });
      
      const newRows: StagingRow[] = [];
      let headerRowIndex = -1;
      let itemIdx = -1, dateIdx = -1, hullIdx = -1, qcIdx = -1, roundIdx = -1;
      
      // Attempt to find header row (first 20 rows)
      for (let i = 0; i < Math.min(json.length, 20); i++) {
        const row = json[i];
        if (!Array.isArray(row)) continue;
        
        let foundItem = -1, foundDate = -1, foundHull = -1, foundQc = -1, foundRound = -1;
        for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || '').toLowerCase().replace(/[\s\.]/g, '');
            if (cell.includes('item') || cell.includes('项目') || cell.includes('description') || cell.includes('内容')) foundItem = j;
            if (cell.includes('date') || cell.includes('日期') || cell.includes('time') || cell.includes('plan')) foundDate = j;
            if (cell.includes('vs') || cell.includes('hull') || cell.includes('船号') || cell.includes('为') || cell === 'v/s') foundHull = j;
            if (cell.includes('qc') || cell.includes('检验') || cell.includes('inspector') || cell.includes('质检')) foundQc = j;
            if (cell.includes('round') || cell.includes('轮次') || cell.includes('start')) foundRound = j;
        }
        
        if (foundItem !== -1) {
            headerRowIndex = i;
            itemIdx = foundItem;
            dateIdx = foundDate;
            hullIdx = foundHull;
            qcIdx = foundQc;
            roundIdx = foundRound;
            break;
        }
      }

      // Fallback: If no header row found, assume default index: 0=item, 1=qc, 2=round
      if (headerRowIndex === -1) {
        itemIdx = 0;
        qcIdx = 1;
        roundIdx = 2;
        headerRowIndex = 0; 
      }
      
      for (let i = headerRowIndex; i < json.length; i++) {
        const row = json[i];
        if (!Array.isArray(row)) continue;

        const rawItem = String(row[itemIdx] || '').trim();
        // Skip header lines
        if (i === headerRowIndex && (rawItem.toLowerCase().includes('item') || rawItem.includes('项目'))) continue;
        
        if (!rawItem) continue;

        let rawDate = dateIdx !== -1 ? String(row[dateIdx] || '').trim() : selectedDate;
        let rawHull = hullIdx !== -1 ? String(row[hullIdx] || '').trim() : '';
        let rawQc = qcIdx !== -1 ? String(row[qcIdx] || '').trim() : '-';
        let rawRound = roundIdx !== -1 ? parseInt(String(row[roundIdx] || "1"), 10) : 1;
        
        // fuzzy match hull to ship id
        let matchedShipId = selectedShip;
        let finalHullLabel = rawHull || (ships.find(s=>s.id === selectedShip)?.hullNumber || '');
        if (rawHull) {
            const matched = ships.find(s => s.hullNumber.replace(/[\s-]/g, '').toLowerCase() === rawHull.replace(/[\s-]/g, '').toLowerCase() || s.shipName.toLowerCase() === rawHull.toLowerCase());
            if (matched) {
                matchedShipId = matched.id;
                finalHullLabel = matched.hullNumber;
            }
        }
        
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
          shipId: matchedShipId,
          hullLabel: finalHullLabel || '-'
        });
      };

      if (newRows.length > 0) {
        setStaging(prev => [...prev, ...newRows]);
      } else {
        alert("No valid items found in the Excel file.");
      }
    } catch (err: any) {
      alert("Failed to parse Excel file: " + err.message);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      await parseExcelFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await parseExcelFile(file);
    }
    e.target.value = '';
  };

  // ── 暂存操作 ──
  const handleDeleteStaging = (uid: string) => {
    setStaging(prev => prev.filter(r => r.uid !== uid));
    if (editingUid === uid) setEditingUid(null);
  };

  const handleEditStart = (row: StagingRow) => {
    setEditingUid(row.uid);
    setEditForm({ item: row.item, discipline: row.discipline, date: row.date, qc: row.qc, startAtRound: row.startAtRound, shipId: row.shipId, hullLabel: row.hullLabel });
  };

  const handleEditSave = () => {
    if (!editingUid) return;
    setStaging(prev => prev.map(r => r.uid === editingUid
      ? { ...r, item: editForm.item || r.item, discipline: editForm.discipline || r.discipline, date: editForm.date || r.date, qc: editForm.qc ?? r.qc, startAtRound: editForm.startAtRound ?? r.startAtRound, shipId: editForm.shipId ?? r.shipId, hullLabel: editForm.hullLabel ?? r.hullLabel }
      : r
    ));
    setEditingUid(null);
  };

  const handleClearStaging = () => {
    if (staging.length === 0 || !confirm("确定要清空暂存清单吗？")) return;
    setStaging([]);
    setEditingUid(null);
  };

  // ── 按专业分组统计 ──
  const disciplineGroups = useMemo(() => {
    const map = new Map<string, number>();
    staging.forEach(r => map.set(r.discipline, (map.get(r.discipline) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [staging]);

  // ── 最终提交入库 ──
  const handleImport = async () => {
    if (staging.length === 0 || !selectedProject) return;
    if (!confirm(`确认提交 ${staging.length} 条报检记录至数据库？`)) return;

    setIsImporting(true);
    let successCount = 0;
    try {
      const groupedByShip: Record<string, StagingRow[]> = {};
      staging.forEach(r => {
        const sid = r.shipId || selectedShip;
        if (!groupedByShip[sid]) groupedByShip[sid] = [];
        groupedByShip[sid].push(r);
      });

      for (const [sId, items] of Object.entries(groupedByShip)) {
        if (!sId) continue;
        const resp = await batchImportInspections({
          projectId: selectedProject,
          shipId: sId,
          items: items.map(r => ({
            itemName: r.item,
            discipline: r.discipline,
            plannedDate: r.date,
            yardQc: r.qc,
            startAtRound: r.startAtRound
          }))
        });
        successCount += resp.imported;
      }
      setImportResult({ success: successCount });
      setStaging([]);
      setEditingUid(null);
      setTimeout(() => setImportResult(null), 3000);
    } catch (e: any) {
      alert("Import Failed: " + String(e));
    } finally {
      setIsImporting(false);
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

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--nb-border)' }}>
        <div>
          <p className="eyebrow">NBINS CORE MODULE</p>
          <h2>MANUAL DATA IMPORT</h2>
        </div>
      </section>

      {/* ── 成功提示 ── */}
      {importResult && (
        <div className="alert success" style={{ marginTop: 16 }}>
          ✅ 成功导入 {importResult.success} 条报检记录。
        </div>
      )}

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
                <span>Project</span>
                <select className="filterSelect" value={selectedProject} onChange={e => { setSelectedProject(e.target.value); }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <span>Ship / Hull No.</span>
                <select className="filterSelect" value={selectedShip} onChange={e => setSelectedShip(e.target.value)}>
                  {ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} ({s.shipName})</option>)}
                </select>
              </div>
              <div className="field">
                <span>Date</span>
                <input type="date" className="filterSelect" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <div className="field">
                <span>Discipline</span>
                <select className="filterSelect" value={selectedDiscipline} onChange={e => setSelectedDiscipline(e.target.value)}>
                  {projectDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
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
              <button className="submitButton" onClick={handleParse} disabled={!pastedData.trim()} style={{ flex: 1 }}>
                Parse Details & Append ➔
              </button>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileSelect} ref={fileInputRef} style={{ display: 'none' }} />
              <button 
                className="submitButton" 
                onClick={() => fileInputRef.current?.click()}
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

          {/* 专业分组统计 */}
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
              <span style={{ fontSize: 11, fontWeight: 600 }}>暂存清单为空</span>
              <span style={{ fontSize: 10 }}>在左侧粘贴数据并点击 Parse 后，条目将出现在此处</span>
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
                                    setEditForm(f => ({ ...f, shipId: e.target.value, hullLabel: matched?.hullNumber || '-' }))
                                  }} 
                                  style={cellInput}
                                >
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
                              <td style={{ ...tdS, fontWeight: 600 }}>{r.item}</td>
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
                <button className="submitButton" onClick={handleImport} disabled={isImporting || staging.length === 0 || !selectedShip}>
                  {isImporting ? 'Importing...' : `Confirm Import (${staging.length})`}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </main>
  );
}

// ── 内联微样式 ──
const thS: React.CSSProperties = { padding: '8px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--nb-text-muted)', textAlign: 'left', whiteSpace: 'nowrap' };
const tdS: React.CSSProperties = { padding: '6px 10px', fontSize: 12, verticalAlign: 'middle' };
const cellInput: React.CSSProperties = { width: '100%', padding: '3px 6px', fontSize: 11, border: '1px solid var(--nb-border)', borderRadius: 6, background: '#fff' };
const actionBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: '2px 4px', color: 'var(--nb-accent)', fontWeight: 'bold' };
