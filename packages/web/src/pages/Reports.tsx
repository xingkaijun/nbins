import React, { useEffect, useState, useMemo } from 'react';
import { fetchInspectionList, fetchProjects, type ProjectRecord } from '../api';
import type { InspectionListItem } from '@nbins/shared';
import { format, subDays, startOfDay, endOfDay, differenceInDays, isWithinInterval, parseISO } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { Calendar as CalendarIcon, Printer, CheckCircle, Search, Hash, TrendingUp, AlertTriangle } from 'lucide-react';
import { resolveAvailableProjectId, useProjectContext } from '../project-context';

// --- A4 Components ---
const PageHeader: React.FC<{ projectName: string }> = ({ projectName }) => (
  <div className="border-b-2 border-[#0f172a] pb-5 mb-8 flex justify-between items-end shrink-0" style={{ borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
    <div className="flex items-center gap-5" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '9px', fontWeight: 900, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '2px' }}>PG SHIPMANAGEMENT</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.05em', margin: 0, lineHeight: 1 }}>Quality Activity Report</h1>
      </div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', display: 'inline-block', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{projectName}</div>
      </div>
      <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px', letterSpacing: '0.1em' }}>Report Reference</div>
      <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{format(new Date(), 'yyyyMMdd-HHmm')}</div>
    </div>
  </div>
);

const PageFooter: React.FC<{ pageNumber: number; totalPages: number; projectName: string }> = ({ pageNumber, totalPages, projectName }) => (
  <div className="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center relative shrink-0" style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ fontSize: '7px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.4em' }}>
      {projectName} • NBINS QUALITY REPORT • INTERNAL USE ONLY
    </div>
    {pageNumber > 0 && totalPages > 0 && (
      <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Page {pageNumber} of {totalPages}
      </div>
    )}
  </div>
);

const ReportPage: React.FC<{ children: React.ReactNode; pageNumber: number; totalPages: number; projectName: string }> = ({ children, pageNumber, totalPages, projectName }) => (
  <div className="break-after-page print:m-0 print:border-none print:shadow-none bg-white p-8 flex flex-col relative"
       style={{ 
         width: '210mm', height: '297mm', margin: '0 auto 48px',
         boxShadow: '0 0 50px -12px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0',
         padding: '15mm', boxSizing: 'border-box', overflow: 'hidden'
       }}>
    <PageHeader projectName={projectName} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {children}
    </div>
    <PageFooter pageNumber={pageNumber} totalPages={totalPages} projectName={projectName} />
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: 'blue' | 'emerald' | 'amber' | 'slate' | 'indigo' | 'rose' }> = ({ label, value, icon, color }) => {
  const styles = {
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#dbeafe' },
    emerald: { bg: '#ecfdf5', text: '#047857', border: '#d1fae5' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fef3c7' },
    slate: { bg: '#f8fafc', text: '#334155', border: '#f1f5f9' },
    indigo: { bg: '#eef2ff', text: '#4338ca', border: '#e0e7ff' },
    rose: { bg: '#fff1f2', text: '#be123c', border: '#ffe4e6' },
  };
  const s = styles[color];
  return (
    <div style={{ background: s.bg, color: s.text, border: `2px solid ${s.border}`, borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>{icon}</div>
        <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>{label}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
    </div>
  );
};

const HEALTH_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#94a3b8'];
const HEALTH_LABELS = ['Accepted (AA)', 'Qualified (QCC)', 'Pending', 'Rejected (RJ)', 'Others'];

const LegendItem: React.FC<{ color: string; label: string; count?: number; total?: number }> = ({ color, label, count, total }) => {
  const pct = count !== undefined && total && total > 0 ? ((count / total) * 100).toFixed(1) : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }} />
      <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1 }}>
        {label} {pct !== undefined ? <span style={{ color: '#64748b' }}>({pct}%)</span> : ''}
      </span>
    </div>
  );
};

export function Reports() {
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [items, setItems] = useState<InspectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [timeRange, setTimeRange] = useState<number>(30); // days
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [filterHull, setFilterHull] = useState<string>("ALL");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("ALL");

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

    return () => { active = false; };
  }, [selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedProjectId) {
        setItems([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetchInspectionList(selectedProjectId);
        if (active) setItems(res.items);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [selectedProjectId]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const currentProjectName = currentProject?.name ?? items[0]?.projectName ?? 'NBINS MASTER';

  // Filter Options
  const hullOptions = useMemo(() => Array.from(new Set(items.map(i => i.hullNumber))).sort(), [items]);
  const disciplineOptions = useMemo(() => Array.from(new Set(items.map(i => i.discipline))).sort(), [items]);

  // Date boundaries
  const now = new Date();
  const rangeEnd = customRange?.end ? endOfDay(parseISO(customRange.end)) : endOfDay(now);
  const rangeStart = customRange?.start ? startOfDay(parseISO(customRange.start)) : startOfDay(subDays(now, timeRange - 1));
  const interval = { start: rangeStart, end: rangeEnd };
  const rangeLabel = `${format(rangeStart, 'yyyy/MM/dd')} – ${format(rangeEnd, 'yyyy/MM/dd')}`;

  // Apply filters
  const filteredData = useMemo(() => {
    return items.filter(item => {
      // Time filter (using plannedDate for simplicity if actual isn't standard, though actual logic could differ)
      if (!item.plannedDate) return false;
      const d = parseISO(item.plannedDate);
      if (!isWithinInterval(d, interval)) return false;
      if (filterHull !== "ALL" && item.hullNumber !== filterHull) return false;
      if (filterDiscipline !== "ALL" && item.discipline !== filterDiscipline) return false;
      return true;
    });
  }, [items, interval, filterHull, filterDiscipline]);

  // Calc metrics
  const stats = useMemo(() => {
    const total = filteredData.length;
    const acceptAA = filteredData.filter(i => i.currentResult === "AA").length;
    const acceptQCC = filteredData.filter(i => i.currentResult === "QCC").length;
    const rejectRJ = filteredData.filter(i => i.currentResult === "RJ").length;
    const rejectOWC = filteredData.filter(i => i.currentResult === "OWC").length;
    
    // Total passed (AA + QCC) vs Total completed (not pending/cx)
    const passed = acceptAA + acceptQCC;
    const completion = total > 0 ? Math.round((passed / total) * 100) : 0;

    // 1st time yield (Passed and currentRound == 1)
    const passed1stTurn = filteredData.filter(i => (i.currentResult === "AA" || i.currentResult === "QCC") && i.currentRound === 1).length;
    const yield1stTime = total > 0 ? Math.round((passed1stTurn / total) * 100) : 0;

    const totalOpenComments = filteredData.reduce((acc, i) => acc + (i.openComments || 0), 0);

    return { total, acceptAA, acceptQCC, rejectRJ, rejectOWC, passed, completion, yield1stTime, totalOpenComments };
  }, [filteredData]);

  // Status Pie Data
  const pieData = [
    { name: 'Accepted (AA)', value: stats.acceptAA },
    { name: 'Qualified (QCC)', value: stats.acceptQCC },
    { name: 'Pending', value: stats.total - stats.passed - stats.rejectRJ - stats.rejectOWC },
    { name: 'Rejected (RJ)', value: stats.rejectRJ + stats.rejectOWC },
  ].filter(p => p.value > 0);

  // Area chart data: group by day
  const areaData = useMemo(() => {
    const daysMap = new Map<string, { date: string, Total: number, Passed: number, Rejected: number }>();
    filteredData.forEach(i => {
      const dStr = format(parseISO(i.plannedDate), 'MM/dd');
      if (!daysMap.has(dStr)) daysMap.set(dStr, { date: dStr, Total: 0, Passed: 0, Rejected: 0 });
      const day = daysMap.get(dStr)!;
      day.Total++;
      if (i.currentResult === "AA" || i.currentResult === "QCC") day.Passed++;
      if (i.currentResult === "RJ" || i.currentResult === "OWC") day.Rejected++;
    });
    return Array.from(daysMap.values()).sort((a,b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  // Discipline Bar Chart data (Focus on Rejected & Open Comments)
  const disciplineData = useMemo(() => {
    const map = new Map<string, { discipline: string, RoundsSum: number, ItemsCount: number, Rejected: number, OpenComments: number }>();
    filteredData.forEach(i => {
      if (!map.has(i.discipline)) map.set(i.discipline, { discipline: i.discipline, RoundsSum: 0, ItemsCount: 0, Rejected: 0, OpenComments: 0 });
      const d = map.get(i.discipline)!;
      d.ItemsCount++;
      d.RoundsSum += i.currentRound;
      d.OpenComments += i.openComments;
      if (i.currentResult === "RJ" || i.currentResult === "OWC") d.Rejected++;
    });
    return Array.from(map.values()).map(d => ({
      ...d,
      AvgRounds: d.ItemsCount > 0 ? Number((d.RoundsSum / d.ItemsCount).toFixed(1)) : 0
    })).sort((a, b) => b.Rejected - a.Rejected);
  }, [filteredData]);

  // Hull Comparison Data
  const hullData = useMemo(() => {
    const map = new Map<string, { hull: string, ItemsCount: number, Passed: number }>();
    filteredData.forEach(i => {
      if (!map.has(i.hullNumber)) map.set(i.hullNumber, { hull: i.hullNumber, ItemsCount: 0, Passed: 0 });
      const h = map.get(i.hullNumber)!;
      h.ItemsCount++;
      if (i.currentResult === "AA" || i.currentResult === "QCC") h.Passed++;
    });
    return Array.from(map.values()).map(h => ({
      ...h,
      PassRate: h.ItemsCount > 0 ? Math.round((h.Passed / h.ItemsCount) * 100) : 0
    })).sort((a, b) => a.hull.localeCompare(b.hull));
  }, [filteredData]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading Data...</div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Control Bar (Screen Only) */}
      <div className="no-print" style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="#0d9488" />
            QUALITY REPORTS
          </h2>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px', gap: '4px' }}>
             {[1, 7, 30].map(days => (
                <button key={days} onClick={() => { setTimeRange(days); setCustomRange(null); }}
                  style={{ border: 'none', background: timeRange === days && !customRange ? '#fff' : 'transparent', color: timeRange === days && !customRange ? '#0d9488' : '#64748b', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', boxShadow: timeRange === days && !customRange ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
                  {days === 1 ? 'TODAY' : days === 30 ? 'MONTH' : `${days}D`}
                </button>
             ))}
          </div>
          {customRange ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ecfeff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #a5f3fc' }}>
              <CalendarIcon size={14} color="#0891b2" />
              <input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, outline: 'none' }} />
              <span style={{ color: '#0891b2' }}>→</span>
              <input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, outline: 'none' }} />
              <button onClick={() => setCustomRange(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#0891b2', fontWeight: 900 }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setCustomRange({ start: format(rangeStart, 'yyyy-MM-dd'), end: format(rangeEnd, 'yyyy-MM-dd') })}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '4px 12px', borderRadius: '8px', cursor: 'pointer' }}>
              <CalendarIcon size={14} /> CUSTOM
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
           <select value={filterHull} onChange={e => setFilterHull(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, outline: 'none' }}>
             <option value="ALL">ALL HULLS</option>
             {hullOptions.map(h => <option value={h} key={h}>{h}</option>)}
           </select>
           <select value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, outline: 'none' }}>
             <option value="ALL">ALL DISCIPLINES</option>
             {disciplineOptions.map(d => <option value={d} key={d}>{d}</option>)}
           </select>
           <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>
             <Printer size={14} /> PRINT / PDF
           </button>
        </div>
      </div>

      {/* A4 Report Pages Container */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f4f7f9', padding: '32px 0' }} className="print-only" id="a4-pages-container">
        
        {/* PAGE 1: Quality Executive Summary */}
        <ReportPage pageNumber={1} totalPages={2} projectName={currentProjectName}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div style={{ borderLeft: '4px solid #0d9488', paddingLeft: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Executive Quality Summary</h3>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>{rangeLabel} | Filters: Hull={filterHull}, Disc={filterDiscipline}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <StatCard label="Total Inspections" value={stats.total} icon={<Hash size={14} color="#64748b" />} color="slate" />
              <StatCard label="Overall Pass Rate" value={`${stats.completion}%`} icon={<CheckCircle size={14} color="#10b981" />} color="emerald" />
              <StatCard label="1st Time Yield (FTY)" value={`${stats.yield1stTime}%`} icon={<TrendingUp size={14} color="#0ea5e9" />} color="blue" />
              <StatCard label="Total Open NCRs" value={stats.totalOpenComments} icon={<AlertTriangle size={14} color="#e11d48" />} color="rose" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
               {/* Pie Chart */}
               <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Quality Results Distribution</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                     <div style={{ height: '140px', width: '140px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value" stroke="none">
                              {pieData.map((p, i) => <Cell key={i} fill={HEALTH_COLORS[HEALTH_LABELS.indexOf(p.name)]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 700 }} />
                          </PieChart>
                        </ResponsiveContainer>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '16px' }}>
                        {HEALTH_LABELS.map((l, i) => {
                          const count = pieData.find(p => p.name === l)?.value || 0;
                          if (count === 0 && l !== "Accepted (AA)") return null;
                          return <LegendItem key={l} color={HEALTH_COLORS[i]} label={l} count={count} total={stats.total} />;
                        })}
                     </div>
                  </div>
               </div>

               {/* Area Chart */}
               <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Daily Quality Assessment Trend</div>
                  <div style={{ flex: 1, minHeight: '160px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorRej" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 700 }} />
                        <Area type="monotone" dataKey="Passed" stroke="#10b981" strokeWidth={2} fill="url(#colorPass)" />
                        <Area type="monotone" dataKey="Rejected" stroke="#ef4444" strokeWidth={2} fill="url(#colorRej)" />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>

            {/* Hull Table */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
               <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                 Hull Quality Comparison matrix
               </div>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead>
                   <tr style={{ background: '#f1f5f9' }}>
                     <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Hull Details</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Inspections</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#10b981', textTransform: 'uppercase' }}>Passed</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#0ea5e9', textTransform: 'uppercase' }}>Pass Rate</th>
                   </tr>
                 </thead>
                 <tbody>
                   {hullData.map((h, i) => (
                     <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                       <td style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{h.hull}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569' }}>{h.ItemsCount}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#10b981' }}>{h.Passed}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: h.PassRate > 80 ? '#10b981' : '#eab308' }}>{h.PassRate}%</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>

          </div>
        </ReportPage>

        {/* PAGE 2: Discipline Drill-down */}
        <ReportPage pageNumber={2} totalPages={2} projectName={items[0]?.projectName || 'NBINS MASTER'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ borderLeft: '4px solid #f59e0b', paddingLeft: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Discipline Deficiencies Index</h3>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Highlighting bottleneck disciplines requiring further QC attention</p>
            </div>

             {/* Discipline Rejections Bar Chart */}
             <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Rejections (RJ/OWC) by Discipline</div>
                  <div style={{ flex: 1, minHeight: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={disciplineData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="discipline" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 700 }} cursor={{ fill: '#f1f5f9' }} />
                        <Bar dataKey="Rejected" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
             </div>

             {/* Discipline Matrix Table */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
               <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                 Discipline Metric Detail
               </div>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead>
                   <tr style={{ background: '#f1f5f9' }}>
                     <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Discipline</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Total Checks</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>Rejections</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#b45309', textTransform: 'uppercase' }}>Total Open NCRs</th>
                     <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#4338ca', textTransform: 'uppercase' }}>Avg. Rounds per check</th>
                   </tr>
                 </thead>
                 <tbody>
                   {disciplineData.map((d, i) => (
                     <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                       <td style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{d.discipline}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569' }}>{d.ItemsCount}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#ef4444' }}>{d.Rejected > 0 ? d.Rejected : '-'}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#f59e0b' }}>{d.OpenComments > 0 ? d.OpenComments : '-'}</td>
                       <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: d.AvgRounds > 1.2 ? '#ef4444' : '#10b981' }}>{d.AvgRounds}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
            {/* Disclaimer at bottom */}
            <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '9px', color: '#94a3b8', fontStyle: 'italic', paddingTop: '16px' }}>
               * End of Report *
            </div>
          </div>
        </ReportPage>
        
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media screen {
          #a4-pages-container {
             display: flex;
             flex-direction: column;
             align-items: center;
          }
        }
      `}} />
    </div>
  );
}
