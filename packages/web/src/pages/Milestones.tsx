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
  const [pxPerDay, setPxPerDay] = useState(12);

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

  const handleAddCustomMilestone = () => {
    const maxSort = milestones.reduce((max, m) => Math.max(max, m.sortOrder), 0);
    const name = prompt('Enter milestone name:');
    if (!name?.trim()) return;
    setMilestones(prev => [...prev, { name: name.trim(), sortOrder: maxSort + 1, plannedDate: null, actualDate: null }]);
  };

  const handleAddMilestoneForAllShips = async () => {
    const name = prompt('Enter milestone name to add for ALL ships:');
    if (!name?.trim()) return;
    setIsSaving(true);
    setNotice(null);
    try {
      for (const ship of ships) {
        const existing = parseMilestones(ship.shipType);
        const ms = existing.length > 0
          ? existing
          : DEFAULT_MILESTONES.map(m => ({ ...m, plannedDate: null, actualDate: null }));
        // Skip if milestone with same name already exists
        if (ms.some(m => m.name === name.trim())) continue;
        const maxSort = ms.reduce((max, m) => Math.max(max, m.sortOrder), 0);
        const updated = [...ms, { name: name.trim(), sortOrder: maxSort + 1, plannedDate: null, actualDate: null }];
        await saveShipMilestones(ship.id, updated, ship.shipType);
        const newShipType = serializeMilestones(updated, ship.shipType);
        setShips(prev => prev.map(s => s.id === ship.id ? { ...s, shipType: newShipType } : s));
      }
      // Refresh current milestones if a ship is selected
      if (selectedShipId) {
        const ship = ships.find(s => s.id === selectedShipId);
        if (ship) {
          const existing = parseMilestones(ship.shipType);
          setMilestones(existing.length > 0
            ? existing
            : DEFAULT_MILESTONES.map(m => ({ ...m, plannedDate: null, actualDate: null }))
          );
        }
      }
      setNotice(`"${name.trim()}" added to all ships.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (e: any) {
      setNotice('Failed: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMilestone = (idx: number) => {
    setMilestones(prev => prev.filter((_, i) => i !== idx));
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

  // Gantt chart - SVG with absolute pixel positioning (6px per day)
  const ROW_H = 40;
  const HDR_H = 28;
  const NAME_W = 140;
  const PX_PER_DAY = pxPerDay;
  const allDates = milestones.flatMap(m => [m.plannedDate, m.actualDate].filter(Boolean) as string[]);
  const minDate = allDates.length > 0 ? allDates.reduce((a, b) => a < b ? a : b) : today;
  const maxDate = allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : today;

  // Parse "YYYY-MM-DD" as day number (UTC, no timezone issues)
  const dayNum = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };

  // Range: 1st of month before min -> 1st of month after max
  const [minY, minM] = minDate.split('-').map(Number);
  const sY = minM === 1 ? minY - 1 : minY;
  const sM = minM === 1 ? 12 : minM - 1;
  const startDay = dayNum(`${sY}-${String(sM).padStart(2, '0')}-01`);
  const [maxY, maxM] = maxDate.split('-').map(Number);
  const eY = maxM === 12 ? maxY + 1 : maxY;
  const eM = maxM === 12 ? 1 : maxM + 1;
  const endDay = dayNum(`${eY}-${String(eM).padStart(2, '0')}-01`);
  const totalDays = Math.max(endDay - startDay, 30);
  const svgW = totalDays * PX_PER_DAY;
  const svgH = HDR_H + milestones.length * ROW_H;

  // Absolute pixel position for any date
  const toX = (dateStr: string) => (dayNum(dateStr) - startDay) * PX_PER_DAY;

  // Month ticks at 1st of each month
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthTicks: { label: string; px: number }[] = [];
  let ty = sY, tm = sM;
  while (dayNum(`${ty}-${String(tm).padStart(2, '0')}-01`) <= endDay) {
    const td = dayNum(`${ty}-${String(tm).padStart(2, '0')}-01`);
    monthTicks.push({ label: `${monthNames[tm - 1]} ${ty}`, px: (td - startDay) * PX_PER_DAY });
    tm++; if (tm > 12) { tm = 1; ty++; }
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

          {/* Gantt Chart - SVG */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 20 }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 12 }}>
              Timeline
              <button onClick={() => setPxPerDay(p => Math.max(2, p - 1))} disabled={pxPerDay <= 2} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1', background: pxPerDay <= 2 ? '#f1f5f9' : '#fff', color: pxPerDay <= 2 ? '#94a3b8' : '#334155', fontWeight: 700, cursor: pxPerDay <= 2 ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: '24px', padding: 0 }}>-</button>
              <button onClick={() => setPxPerDay(p => Math.min(18, p + 1))} disabled={pxPerDay >= 18} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1', background: pxPerDay >= 18 ? '#f1f5f9' : '#fff', color: pxPerDay >= 18 ? '#94a3b8' : '#334155', fontWeight: 700, cursor: pxPerDay >= 18 ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: '24px', padding: 0 }}>+</button>
            </div>
            {allDates.length > 0 ? (
              <div style={{ display: 'flex' }}>
                {/* Left: milestone names */}
                <div style={{ width: NAME_W, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fafbfc' }}>
                  <div style={{ height: HDR_H, borderBottom: '1px solid #e2e8f0' }} />
                  {milestones.map((m, idx) => {
                    const isComplete = !!m.actualDate;
                    const isOverdue = !isComplete && !!m.plannedDate && m.plannedDate < today;
                    return (
                      <div key={idx} style={{ height: ROW_H, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '0 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? '#16a34a' : isOverdue ? '#dc2626' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isComplete ? '✓ ' : isOverdue ? '! ' : '○ '}{m.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Right: SVG timeline */}
                <div style={{ flex: 1, overflowX: 'auto' }}>
                  <svg width={svgW} height={svgH} style={{ display: 'block' }}>
                    {/* Daily grid lines */}
                    {Array.from({ length: totalDays + 1 }, (_, i) => {
                      const x = i * PX_PER_DAY;
                      // Check if this day is the 1st of a month (thicker line)
                      const isMonthStart = monthTicks.some(t => Math.abs(t.px - x) < 0.5);
                      return (
                        <line key={`day-${i}`} x1={x} y1={0} x2={x} y2={svgH}
                          stroke={isMonthStart ? '#cbd5e1' : '#f1f5f9'}
                          strokeWidth={isMonthStart ? 1 : 0.5}
                        />
                      );
                    })}
                    {/* Month labels */}
                    {monthTicks.map((t, i) => (
                      <text key={`ml-${i}`} x={t.px + 4} y={18} fontSize={10} fill="#64748b" fontWeight={600}>{t.label}</text>
                    ))}
                    {/* Header bottom line */}
                    <line x1={0} y1={HDR_H} x2={svgW} y2={HDR_H} stroke="#cbd5e1" strokeWidth={1} />
                    {/* Today line */}
                    <line x1={toX(today)} y1={0} x2={toX(today)} y2={svgH} stroke="#ef4444" strokeWidth={2} opacity={0.6} />
                    {/* Milestone rows */}
                    {milestones.map((m, idx) => {
                      const isComplete = !!m.actualDate;
                      const isOverdue = !isComplete && !!m.plannedDate && m.plannedDate < today;
                      const rowY = HDR_H + idx * ROW_H;
                      const els: React.ReactNode[] = [];
                      // Row separator
                      els.push(<line key={`rs-${idx}`} x1={0} y1={rowY + ROW_H} x2={svgW} y2={rowY + ROW_H} stroke="#f1f5f9" strokeWidth={1} />);
                      // Determine the rightmost icon position for name label
                      let nameX = 4;
                      // Bar planned->actual
                      if (m.plannedDate && m.actualDate) {
                        const x1 = toX(m.plannedDate);
                        const x2 = toX(m.actualDate);
                        els.push(<rect key={`bar-${idx}`} x={x1} y={rowY + 12} width={Math.max(x2 - x1, 2)} height={16} rx={4} fill={isComplete ? '#bbf7d0' : '#fef9c3'} stroke={isComplete ? '#86efac' : '#fde68a'} strokeWidth={1} />);
                        nameX = x2 + 14;
                      }
                      // Planned marker (no actual yet)
                      if (m.plannedDate && !m.actualDate) {
                        els.push(<rect key={`pm-${idx}`} x={toX(m.plannedDate)} y={rowY + 12} width={8} height={16} rx={4} fill={isOverdue ? '#fecaca' : '#fef9c3'} stroke={isOverdue ? '#fca5a5' : '#fde68a'} strokeWidth={1} />);
                        nameX = toX(m.plannedDate) + 14;
                      }
                      // Actual circle
                      if (m.actualDate) {
                        const ax = toX(m.actualDate);
                        els.push(<circle key={`ac-${idx}`} cx={ax} cy={rowY + 20} r={10} fill="#22c55e" />);
                        els.push(<text key={`at-${idx}`} x={ax} y={rowY + 24} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">✓</text>);
                        nameX = ax + 14;
                      }
                      // Planned date label (above icon)
                      if (m.plannedDate) {
                        els.push(<text key={`dl-${idx}`} x={toX(m.plannedDate)} y={rowY + 8} textAnchor="middle" fontSize={9} fill="#94a3b8">{m.plannedDate.slice(5)}</text>);
                      }
                      // Actual date label (below icon)
                      if (m.actualDate) {
                        els.push(<text key={`adl-${idx}`} x={toX(m.actualDate)} y={rowY + 38} textAnchor="middle" fontSize={9} fill="#16a34a">{m.actualDate.slice(5)}</text>);
                      }
                      // Milestone name next to the icon
                      els.push(<text key={`name-${idx}`} x={nameX} y={rowY + 24} fontSize={9} fontWeight={700} fill={isComplete ? '#16a34a' : isOverdue ? '#dc2626' : '#64748b'}>{m.name}</text>);
                      return <g key={`row-${idx}`}>{els}</g>;
                    })}
                  </svg>
                </div>
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
                  <th style={{ ...thS, width: 48, textAlign: 'center' }}></th>
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
                      <td style={{ ...tdS, textAlign: 'center' }}>
                        {!DEFAULT_MILESTONES.some(dm => dm.name === m.name) && (
                          <button onClick={() => handleRemoveMilestone(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', fontWeight: 700 }} title="Remove milestone">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAddCustomMilestone}
                style={{ background: '#fff', color: '#3b82f6', border: '1px dashed #93c5fd', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                + Add Custom Milestone
              </button>
              <button
                onClick={handleAddMilestoneForAllShips}
                disabled={isSaving || ships.length === 0}
                style={{ background: '#fff', color: '#8b5cf6', border: '1px dashed #c4b5fd', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer', opacity: isSaving || ships.length === 0 ? 0.5 : 1 }}
              >
                + Add for All Ships
              </button>
            </div>
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
