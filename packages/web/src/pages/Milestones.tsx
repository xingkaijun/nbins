import React, { useState, useEffect } from 'react';
import { fetchShips, parseMilestones, DEFAULT_MILESTONES, saveShipMilestones, serializeMilestones } from '../api';
import type { ShipMilestone, ShipRecord } from '../api';
import { useProjectContext } from '../project-context';

const thS: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#475569' };
const tdS: React.CSSProperties = { padding: '6px 12px', fontSize: 12, color: '#334155' };
const cellInput: React.CSSProperties = { width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: 12, outline: 'none' };

export function Milestones() {
  const { selectedProjectId } = useProjectContext();
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [selectedShipId, setSelectedShipId] = useState('');
  const [milestones, setMilestones] = useState<ShipMilestone[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetchShips(selectedProjectId).then(setShips).catch(console.error);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedShipId) { setMilestones([]); return; }
    const ship = ships.find(s => s.id === selectedShipId);
    if (!ship) return;
    const existing = parseMilestones(ship.shipType);
    setMilestones(existing.length > 0
      ? existing
      : DEFAULT_MILESTONES.map(m => ({ ...m, plannedDate: null, actualDate: null }))
    );
  }, [selectedShipId, ships]);

  const handleDateChange = (idx: number, field: 'plannedDate' | 'actualDate', value: string) => {
    setMilestones(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value || null } : m));
  };

  const handleSave = async () => {
    if (!selectedShipId) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const ship = ships.find(s => s.id === selectedShipId);
      await saveShipMilestones(selectedShipId, milestones, ship?.shipType);
      const newShipType = serializeMilestones(milestones, ship?.shipType);
      setShips(prev => prev.map(s => s.id === selectedShipId ? { ...s, shipType: newShipType } : s));
      setNotice('Saved successfully.');
      setTimeout(() => setNotice(null), 3000);
    } catch (e: any) {
      setNotice('Failed: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedShip = ships.find(s => s.id === selectedShipId);
  const completed = milestones.filter(m => !!m.actualDate).length;
  const today = new Date().toISOString().slice(0, 10);

  // Gantt chart calculations
  const allDates = milestones.flatMap(m => [m.plannedDate, m.actualDate].filter(Boolean) as string[]);
  const minDate = allDates.length > 0 ? allDates.reduce((a, b) => a < b ? a : b) : today;
  const maxDate = allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : today;
  const startDate = new Date(minDate);
  startDate.setMonth(startDate.getMonth() - 1);
  const endDate = new Date(maxDate);
  endDate.setMonth(endDate.getMonth() + 1);
  const totalDays = Math.max((endDate.getTime() - startDate.getTime()) / 86400000, 30);
  const toX = (dateStr: string) => ((new Date(dateStr).getTime() - startDate.getTime()) / 86400000 / totalDays) * 100;

  const monthTicks: { label: string; x: number }[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    monthTicks.push({ label: cur.toLocaleString('en', { month: 'short', year: '2-digit' }), x: ((cur.getTime() - startDate.getTime()) / 86400000 / totalDays) * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }

  if (!selectedProjectId) {
    return <main className="pageContainer"><p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 80 }}>Please select a project first.</p></main>;
  }

  return (
    <main className="pageContainer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Production Milestones</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Track key production dates for each ship</p>
        </div>
        <select
          className="filterSelect"
          value={selectedShipId}
          onChange={e => setSelectedShipId(e.target.value)}
          style={{ minWidth: 220, fontWeight: 600 }}
        >
          <option value="">-- Select Ship --</option>
          {ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} ({s.shipName})</option>)}
        </select>
      </div>

      {selectedShip ? (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ padding: '8px 16px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#0369a1' }}>
              {selectedShip.hullNumber} — {selectedShip.shipName}
            </div>
            <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 6, height: 10, overflow: 'hidden', maxWidth: 200 }}>
              <div style={{ width: `${milestones.length ? (completed / milestones.length * 100) : 0}%`, height: '100%', background: '#22c55e', borderRadius: 6, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{completed}/{milestones.length} completed</span>
          </div>

          {/* Gantt Chart */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 20 }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#334155' }}>Timeline</div>
            {allDates.length > 0 ? (
              <div style={{ padding: '16px', overflowX: 'auto' }}>
                <div style={{ position: 'relative', height: 20, marginBottom: 8 }}>
                  {monthTicks.map((m, i) => (
                    <span key={i} style={{ position: 'absolute', left: `${m.x}%`, transform: 'translateX(-50%)', fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{m.label}</span>
                  ))}
                </div>
                {milestones.map((m, idx) => {
                  const isComplete = !!m.actualDate;
                  const isOverdue = !isComplete && !!m.plannedDate && m.plannedDate < today;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', height: 40, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: isComplete ? '#16a34a' : isOverdue ? '#dc2626' : '#334155', paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isComplete ? '✓ ' : isOverdue ? '! ' : '○ '}{m.name}
                      </div>
                      <div style={{ flex: 1, position: 'relative', height: 24 }}>
                        <div style={{ position: 'absolute', left: `${toX(today)}%`, top: -4, bottom: -4, width: 2, background: '#ef4444', opacity: 0.5, zIndex: 1 }} />
                        {m.plannedDate && m.actualDate && (
                          <div style={{ position: 'absolute', left: `${toX(m.plannedDate)}%`, width: `${Math.max(toX(m.actualDate) - toX(m.plannedDate), 1)}%`, top: 4, height: 16, background: isComplete ? '#bbf7d0' : '#fef9c3', borderRadius: 4, border: `1px solid ${isComplete ? '#86efac' : '#fde68a'}`, zIndex: 0 }} />
                        )}
                        {m.plannedDate && !m.actualDate && (
                          <div style={{ position: 'absolute', left: `${toX(m.plannedDate)}%`, top: 4, height: 16, width: 8, background: isOverdue ? '#fecaca' : '#fef9c3', borderRadius: 4, border: `1px solid ${isOverdue ? '#fca5a5' : '#fde68a'}`, zIndex: 0 }} />
                        )}
                        {m.actualDate && (
                          <div style={{ position: 'absolute', left: `${toX(m.actualDate)}%`, top: 2, width: 20, height: 20, background: '#22c55e', borderRadius: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</div>
                        )}
                        {m.plannedDate && (
                          <span style={{ position: 'absolute', left: `${toX(m.plannedDate)}%`, top: 22, transform: 'translateX(-50%)', fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>{m.plannedDate.slice(5)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No dates set yet. Use the table below to enter planned and actual dates.</div>
            )}
          </div>

          {/* Editable table */}
          {notice && (
            <div className={`alert ${notice.includes('Failed') ? 'warning' : 'success'}`} style={{ marginBottom: 12 }}>{notice}</div>
          )}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0f9ff', borderBottom: '2px solid #93c5fd' }}>
                  <th style={thS}>#</th>
                  <th style={thS}>Milestone</th>
                  <th style={thS}>Planned Date</th>
                  <th style={thS}>Actual Date</th>
                  <th style={thS}>Status</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m, idx) => {
                  const isComplete = !!m.actualDate;
                  const isOverdue = !isComplete && !!m.plannedDate && m.plannedDate < today;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: isComplete ? '#f0fdf4' : isOverdue ? '#fef2f2' : 'transparent' }}>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: isComplete ? '#16a34a' : isOverdue ? '#dc2626' : '#94a3b8' }}>
                        {isComplete ? '✓' : isOverdue ? '!' : '○'}
                      </td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#1e3a5f' }}>{m.name}</td>
                      <td style={tdS}>
                        <input type="date" value={m.plannedDate || ''} onChange={e => handleDateChange(idx, 'plannedDate', e.target.value)} style={cellInput} />
                      </td>
                      <td style={tdS}>
                        <input type="date" value={m.actualDate || ''} onChange={e => handleDateChange(idx, 'actualDate', e.target.value)} style={cellInput} />
                      </td>
                      <td style={tdS}>
                        {isComplete ? (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>COMPLETED</span>
                        ) : isOverdue ? (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>OVERDUE</span>
                        ) : m.plannedDate ? (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>PLANNED</span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>PENDING</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="submitButton" onClick={handleSave} disabled={isSaving} style={{ padding: '8px 20px' }}>
              {isSaving ? 'Saving...' : 'Save Milestones'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 60 }}>
          Please select a ship above to view milestones
        </div>
      )}
    </main>
  );
}
