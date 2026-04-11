import React, { useState, useEffect } from 'react';
import { DISCIPLINES } from '@nbins/shared';
import { fetchProjects, fetchShips, batchImportInspections } from '../api.ts';

interface ParsedRow {
  id: number;
  item: string;
  discipline: string;
  date: string;
  qc: string;
  startAtRound: number;
  error?: string;
}

export function Import() {
  const [projects, setProjects] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);
  
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedShip, setSelectedShip] = useState('');
  
  // 新增全局 Date 与 Discipline
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('HULL');

  const [pastedData, setPastedData] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; skipped: number } | null>(null);

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
      // In a real app we would pass projectId, but we are fetching all and filtering
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

  const handleParse = () => {
    if (!pastedData.trim()) return;
    const lines = pastedData.trim().split('\n');
    const result: ParsedRow[] = [];
    
    lines.forEach((line, i) => {
      // 当前要求只有3列：Item | QC | Start Round

      // 支持 Tab、半角逗号、全角逗号分隔
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

      let error = undefined;
      if (!item) {
        error = "Missing Inspection Item";
      }

      result.push({
        id: i + 1,
        item: item || '(empty)',
        discipline: selectedDiscipline,
        date: selectedDate,
        qc: qc || '-',
        startAtRound,
        error
      });
    });
    setParsedRows(result);
    setImportResult(null);
  };

  const errorCount = parsedRows?.filter(r => r.error).length || 0;
  const validCount = parsedRows?.filter(r => !r.error).length || 0;

  const handleImport = async () => {
    if (!parsedRows || parsedRows.length === 0 || errorCount > 0 || !selectedProject || !selectedShip) return;

    setIsImporting(true);
    try {
      const resp = await batchImportInspections({
        projectId: selectedProject,
        shipId: selectedShip,
        items: parsedRows.map(r => ({
          itemName: r.item,
          discipline: r.discipline,
          plannedDate: r.date,
          yardQc: r.qc,
          startAtRound: r.startAtRound
        }))
      });
      setImportResult({ success: resp.imported, errors: 0, skipped: 0 });
      // 导入成功后延迟重置，让用户看到成功消息
      setTimeout(() => {
        setPastedData('');
        setParsedRows(null);
        setImportResult(null);
      }, 2000);
    } catch (e: any) {
      alert("Import Failed: " + String(e));
    } finally {
      setIsImporting(false);
    }
  };

  const getDisciplineColor = (d: string) => {
    switch (d) {
      case 'HULL': return '#1d4ed8'; // blue
      case 'OUTFIT': return '#0f766e'; // teal
      case 'PAINT': return '#be185d'; // pink
      case 'ELEC': return '#c2410c'; // orange
      case 'CCS': return '#15803d'; // green
      default: return '#475569';
    }
  };

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--nb-border)' }}>
        <div>
          <p className="eyebrow">NBINS CORE MODULE</p>
          <h2>MANUAL DATA IMPORT</h2>
        </div>
      </section>

      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1000px' }}>
        
        {/* Step 1 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ background: 'var(--nb-accent)', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>1</span>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Global Import Configuration</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
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
              <span style={{ background: 'var(--nb-accent)', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>2</span>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Paste Spreadsheet Data</h3>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--nb-text-muted)' }}>支持 Tab 或逗号（全角/半角）分隔: Item | QC | Start Round</span>

          </div>
          <div className="field">
            <textarea 
              rows={8} 
              placeholder="Example format:&#10;Main Engine Alignment    Zhang San    1&#10;Pipe System Test         Li Si        2&#10;&#10;Column 3: 1 = Start at Round 1, 2 = Start at Round 2, 3 = Start at Round 3" 

              value={pastedData}
              onChange={e => setPastedData(e.target.value)}
              style={{ fontFamily: 'monospace', whiteSpace: 'pre', fontSize: '11px' }}
            />
          </div>
          <div style={{ marginTop: '12px' }}>
             <button className="submitButton" onClick={handleParse} disabled={!pastedData.trim() || importResult !== null}>Parse Preview Data ➔</button>
          </div>
        </section>

        {/* Step 3 */}
        {parsedRows && (
          <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ background: 'var(--nb-accent)', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>3</span>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Review & Confirmation</h3>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Inspection Item</th>
                    <th style={{ width: '100px' }}>Discipline</th>
                    <th style={{ width: '90px' }}>Date</th>
                    <th style={{ width: '100px' }}>QC Inspector</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>Start Round</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, idx) => (
                    <tr key={idx} className="record-row" style={{ background: r.error ? '#fff1f2' : 'transparent' }}>
                      <td style={{ color: 'var(--nb-text-muted)', fontWeight: 'bold' }}>{r.id}</td>
                      <td style={{ fontWeight: 600 }}>{r.item}</td>
                      <td>
                        {r.discipline && !r.error?.includes('Discipline') ? (
                          <span style={{ 
                            fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em',
                            background: `${getDisciplineColor(r.discipline)}15`, color: getDisciplineColor(r.discipline)
                          }}>
                            {r.discipline}
                          </span>
                        ) : <span style={{ color: '#ef4444' }}>{r.discipline}</span>}
                      </td>
                      <td>{r.date}</td>
                      <td>{r.qc}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.startAtRound === 1 ? <span style={{ color: 'var(--nb-border)' }}>1</span>
                         : r.startAtRound === 2 ? <span style={{ color: '#0f766e', fontWeight: 'bold' }}>R2</span>
                         : <span style={{ color: '#b45309', fontWeight: 'bold' }}>R3</span>}
                      </td>
                      <td>
                        {r.error ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '10px', fontWeight: '600' }}>
                           <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#b91c1c' }} /> {r.error}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '10px', fontWeight: '600' }}>
                           <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#15803d' }} /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {parsedRows.length === 0 && (
                     <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--nb-text-muted)' }}>No data parsed.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Valid Items</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#15803d' }}>{validCount}</span>
                </div>
                <div>
                   <span style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Errors / Skips</span>
                   <span style={{ fontSize: '16px', fontWeight: 800, color: errorCount > 0 ? '#b91c1c' : 'var(--nb-text-muted)' }}>{errorCount}</span>
                </div>
              </div>
              
              {!importResult ? (
                 <div style={{ display: 'flex', gap: '8px' }}>
                   <button className="submitButton" onClick={() => setParsedRows(null)} style={{ background: '#fff', color: 'var(--nb-text)', border: '1px solid var(--nb-border)', boxShadow: 'none' }}>Cancel</button>
                   <button className="submitButton" onClick={handleImport} disabled={isImporting || validCount === 0 || errorCount > 0}>
                     {isImporting ? 'Importing...' : 'Confirm Bulk Import'}
                   </button>
                 </div>
              ) : (
                 <div className="alert success" style={{ margin: 0 }}>
                   ✅ Successfully imported {importResult.success} items to {selectedShip}.
                 </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
