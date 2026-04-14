import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchInspectionComments, fetchInspectionList, fetchProjects, type ProjectRecord } from '../api';
import type { InspectionCommentView, InspectionListItem } from '@nbins/shared';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO, isValid } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Calendar as CalendarIcon, Printer, CheckCircle, Hash, TrendingUp, AlertTriangle } from 'lucide-react';
import { resolveAvailableProjectId, useProjectContext } from '../project-context';

const PageHeader: React.FC<{ projectName: string }> = ({ projectName }) => (
  <div
    className="border-b-2 border-[#0f172a] pb-5 mb-8 flex justify-between items-end shrink-0"
    style={{
      borderBottom: '2px solid #0f172a',
      paddingBottom: '20px',
      marginBottom: '24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 900,
            color: '#0d9488',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            marginBottom: '2px',
          }}
        >
          PG SHIPMANAGEMENT
        </div>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 900,
            color: '#0f172a',
            textTransform: 'uppercase',
            letterSpacing: '-0.05em',
            margin: 0,
            lineHeight: 1,
          }}
        >
          Quality Activity Report
        </h1>
      </div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          background: '#f8fafc',
          padding: '6px 12px',
          borderRadius: '8px',
          display: 'inline-block',
          marginBottom: '12px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 900,
            color: '#1e293b',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: 0,
          }}
        >
          {projectName}
        </div>
      </div>
      <div
        style={{
          fontSize: '8px',
          fontWeight: 900,
          textTransform: 'uppercase',
          color: '#94a3b8',
          marginBottom: '4px',
          letterSpacing: '0.1em',
        }}
      >
        Report Reference
      </div>
      <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{format(new Date(), 'yyyyMMdd-HHmm')}</div>
    </div>
  </div>
);

const PageFooter: React.FC<{ pageNumber: number; totalPages: number; projectName: string }> = ({
  pageNumber,
  totalPages,
  projectName,
}) => (
  <div
    className="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center relative shrink-0"
    style={{
      marginTop: 'auto',
      paddingTop: '18px',
      borderTop: '1px solid #f1f5f9',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
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

const ReportPage: React.FC<{
  children: React.ReactNode;
  pageNumber: number;
  totalPages: number;
  projectName: string;
  isFlexible?: boolean;
}> = ({ children, pageNumber, totalPages, projectName, isFlexible }) => (
  <div
    className={`${isFlexible ? '' : 'break-after-page'} print:m-0 print:border-none print:shadow-none bg-white p-8 flex flex-col relative`}
    style={{
      width: '210mm',
      height: isFlexible ? 'auto' : '297mm',
      minHeight: isFlexible ? '297mm' : 'auto',
      margin: '0 auto 48px',
      boxShadow: '0 0 50px -12px rgba(0,0,0,0.12)',
      border: '1px solid #e2e8f0',
      padding: '15mm',
      boxSizing: 'border-box',
      overflow: isFlexible ? 'visible' : 'hidden',
    }}
  >
    <PageHeader projectName={projectName} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    <PageFooter pageNumber={pageNumber} totalPages={totalPages} projectName={projectName} />
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string | number;
  helper?: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'amber' | 'slate' | 'indigo' | 'rose';
}> = ({ label, value, helper, icon, color }) => {
  const styles = {
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#dbeafe' },
    emerald: { bg: '#ecfdf5', text: '#047857', border: '#d1fae5' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fef3c7' },
    slate: { bg: '#f8fafc', text: '#334155', border: '#f1f5f9' },
    indigo: { bg: '#eef2ff', text: '#4338ca', border: '#e0e7ff' },
    rose: { bg: '#fff1f2', text: '#be123c', border: '#ffe4e6' },
  } as const;
  const s = styles[color];

  return (
    <div
      style={{
        background: s.bg,
        color: s.text,
        border: `2px solid ${s.border}`,
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>{icon}</div>
        <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7 }}>{label}</span>
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        {helper ? <div style={{ fontSize: '9px', fontWeight: 800, marginTop: '6px', opacity: 0.7 }}>{helper}</div> : null}
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ title: string; subtitle?: string; accent: string }> = ({ title, subtitle, accent }) => (
  <div style={{ borderLeft: `4px solid ${accent}`, paddingLeft: '12px' }}>
    <h3
      style={{
        margin: 0,
        fontSize: '12px',
        fontWeight: 900,
        color: '#1e293b',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {title}
    </h3>
    {subtitle ? <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>{subtitle}</p> : null}
  </div>
);

const LegendItem: React.FC<{ color: string; label: string; count: number; total: number }> = ({ color, label, count, total }) => {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '10px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
        <span style={{ fontSize: '8px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ fontSize: '9px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {count} <span style={{ color: '#94a3b8', fontSize: '8px' }}>({pct}%)</span>
      </div>
    </div>
  );
};

const RESULT_SEGMENTS = [
  { key: 'acceptedAA', label: 'Accepted (AA)', color: '#10b981' },
  { key: 'qualifiedQCC', label: 'Qualified (QCC)', color: '#3b82f6' },
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
  { key: 'rejectedRJ', label: 'Rejected (RJ)', color: '#ef4444' },
  { key: 'owc', label: 'OWC', color: '#f59e0b' },
] as const;

function isDateInRange(value: string | null | undefined, interval: { start: Date; end: Date }): boolean {
  if (!value) {
    return false;
  }
  const parsed = parseISO(value);
  return isValid(parsed) && isWithinInterval(parsed, interval);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function Reports() {
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [items, setItems] = useState<InspectionListItem[]>([]);
  const [comments, setComments] = useState<InspectionCommentView[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeRange, setTimeRange] = useState<number>(1);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [filterHull, setFilterHull] = useState<string>('ALL');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('ALL');
  const printContainerRef = useRef<HTMLDivElement | null>(null);
  const printCleanupTimerRef = useRef<number | null>(null);



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

    async function load() {
      if (!selectedProjectId) {
        setItems([]);
        setComments([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [inspectionSnapshot, inspectionComments] = await Promise.all([
          fetchInspectionList(selectedProjectId),
          fetchInspectionComments({ projectId: selectedProjectId }),
        ]);

        if (!active) {
          return;
        }

        setItems(inspectionSnapshot.items);
        setComments(inspectionComments);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const currentProjectName = currentProject?.name ?? items[0]?.projectName ?? 'NBINS MASTER';

  const hullOptions = useMemo(() => Array.from(new Set(items.map((item) => item.hullNumber))).sort(), [items]);
  const disciplineOptions = useMemo(() => Array.from(new Set(items.map((item) => item.discipline))).sort(), [items]);

  const now = new Date();
  const rangeEnd = customRange?.end ? endOfDay(parseISO(customRange.end)) : endOfDay(now);
  const rangeStart = customRange?.start ? startOfDay(parseISO(customRange.start)) : startOfDay(subDays(now, timeRange - 1));
  const interval = { start: rangeStart, end: rangeEnd };
  const rangeLabel = `${format(rangeStart, 'yyyy/MM/dd')} – ${format(rangeEnd, 'yyyy/MM/dd')}`;

  const filteredData = useMemo(() => {
    return items.filter((item) => {
      if (!isDateInRange(item.plannedDate, interval)) {
        return false;
      }
      if (filterHull !== 'ALL' && item.hullNumber !== filterHull) {
        return false;
      }
      if (filterDiscipline !== 'ALL' && item.discipline !== filterDiscipline) {
        return false;
      }
      return true;
    });
  }, [items, interval, filterHull, filterDiscipline]);

  const filteredComments = useMemo(() => {
    return comments.filter((comment) => {
      if (!isDateInRange(comment.createdAt, interval)) {
        return false;
      }
      if (filterHull !== 'ALL' && comment.hullNumber !== filterHull) {
        return false;
      }
      if (filterDiscipline !== 'ALL' && comment.discipline !== filterDiscipline) {
        return false;
      }
      return true;
    });
  }, [comments, interval, filterHull, filterDiscipline]);

  const inspectionStats = useMemo(() => {
    const total = filteredData.length;
    const acceptedAA = filteredData.filter((item) => item.currentResult === 'AA').length;
    const qualifiedQCC = filteredData.filter((item) => item.currentResult === 'QCC').length;
    const rejectedRJ = filteredData.filter((item) => item.currentResult === 'RJ').length;
    const owc = filteredData.filter((item) => item.currentResult === 'OWC').length;
    const pending = total - acceptedAA - qualifiedQCC - rejectedRJ - owc;
    const passed = acceptedAA + qualifiedQCC;
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const passed1stTurn = filteredData.filter(
      (item) => (item.currentResult === 'AA' || item.currentResult === 'QCC') && item.currentRound === 1
    ).length;
    const yield1stTime = total > 0 ? (passed1stTurn / total) * 100 : 0;

    return {
      total,
      acceptedAA,
      qualifiedQCC,
      rejectedRJ,
      owc,
      pending,
      passed,
      passRate,
      yield1stTime,
    };
  }, [filteredData]);

  const commentStats = useMemo(() => {
    const total = filteredComments.length;
    const disciplinesWithComments = new Set(filteredComments.map((comment) => comment.discipline || 'UNKNOWN')).size;

    return { total, disciplinesWithComments };
  }, [filteredComments]);

  const overallResultBreakdown = useMemo(
    () => [
      { key: 'acceptedAA', label: 'Accepted (AA)', value: inspectionStats.acceptedAA, color: '#10b981' },
      { key: 'qualifiedQCC', label: 'Qualified (QCC)', value: inspectionStats.qualifiedQCC, color: '#3b82f6' },
      { key: 'pending', label: 'Pending', value: inspectionStats.pending, color: '#94a3b8' },
      { key: 'rejectedRJ', label: 'Rejected (RJ)', value: inspectionStats.rejectedRJ, color: '#ef4444' },
      { key: 'owc', label: 'OWC', value: inspectionStats.owc, color: '#f59e0b' },
    ],
    [inspectionStats]
  );

  const pieData = useMemo(
    () => overallResultBreakdown.filter((segment) => segment.value > 0).map((segment) => ({ name: segment.label, value: segment.value, color: segment.color })),
    [overallResultBreakdown]
  );

  const disciplineCommentData = useMemo(() => {
    const map = new Map<string, { discipline: string; TotalComments: number }>();

    filteredComments.forEach((comment) => {
      const key = comment.discipline || 'UNKNOWN';
      if (!map.has(key)) {
        map.set(key, {
          discipline: key,
          TotalComments: 0,
        });
      }
      map.get(key)!.TotalComments += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.TotalComments - a.TotalComments || a.discipline.localeCompare(b.discipline));
  }, [filteredComments]);

  const disciplineQualityData = useMemo(() => {
    const map = new Map<
      string,
      {
        discipline: string;
        total: number;
        acceptedAA: number;
        qualifiedQCC: number;
        pending: number;
        rejectedRJ: number;
        owc: number;
        TotalComments: number;
        passRate: number;
      }
    >();

    filteredData.forEach((item) => {
      const key = item.discipline || 'UNKNOWN';
      if (!map.has(key)) {
        map.set(key, {
          discipline: key,
          total: 0,
          acceptedAA: 0,
          qualifiedQCC: 0,
          pending: 0,
          rejectedRJ: 0,
          owc: 0,
          TotalComments: 0,
          passRate: 0,
        });
      }
      const current = map.get(key)!;
      current.total += 1;
      if (item.currentResult === 'AA') {
        current.acceptedAA += 1;
      } else if (item.currentResult === 'QCC') {
        current.qualifiedQCC += 1;
      } else if (item.currentResult === 'RJ') {
        current.rejectedRJ += 1;
      } else if (item.currentResult === 'OWC') {
        current.owc += 1;
      } else {
        current.pending += 1;
      }
    });

    filteredComments.forEach((comment) => {
      const key = comment.discipline || 'UNKNOWN';
      if (!map.has(key)) {
        map.set(key, {
          discipline: key,
          total: 0,
          acceptedAA: 0,
          qualifiedQCC: 0,
          pending: 0,
          rejectedRJ: 0,
          owc: 0,
          TotalComments: 0,
          passRate: 0,
        });
      }
      map.get(key)!.TotalComments += 1;
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        passRate: item.total > 0 ? Math.round(((item.acceptedAA + item.qualifiedQCC) / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.TotalComments - a.TotalComments || a.discipline.localeCompare(b.discipline));
  }, [filteredData, filteredComments]);

  const clearPrintCleanupTimer = useCallback(() => {
    if (printCleanupTimerRef.current !== null) {
      window.clearTimeout(printCleanupTimerRef.current);
      printCleanupTimerRef.current = null;
    }
  }, []);

  const deactivatePrintMode = useCallback(() => {
    clearPrintCleanupTimer();
    document.body.classList.remove('reports-print-mode');
  }, [clearPrintCleanupTimer]);

  const activatePrintMode = useCallback(() => {
    if (!printContainerRef.current) {
      return false;
    }

    document.body.classList.add('reports-print-mode');
    clearPrintCleanupTimer();
    printCleanupTimerRef.current = window.setTimeout(() => {
      document.body.classList.remove('reports-print-mode');
      printCleanupTimerRef.current = null;
    }, 60000);
    return true;
  }, [clearPrintCleanupTimer]);

  useEffect(() => {
    const handleBeforePrint = () => {
      void activatePrintMode();
    };
    const handleAfterPrint = () => {
      deactivatePrintMode();
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      deactivatePrintMode();
    };
  }, [activatePrintMode, deactivatePrintMode]);

  const handlePrintReport = () => {
    if (!activatePrintMode()) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.print();
    });
  };


  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading Data...</div>;
  }

  return (

    <div className="reports-page-root" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      <div
        className="no-print"
        style={{
          padding: '16px 24px',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 900,
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <TrendingUp size={18} color="#0d9488" />
            QUALITY REPORTS
          </h2>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px', gap: '4px' }}>
            {[1, 7, 30].map((days) => (
              <button
                key={days}
                onClick={() => {
                  setTimeRange(days);
                  setCustomRange(null);
                }}
                style={{
                  border: 'none',
                  background: timeRange === days && !customRange ? '#fff' : 'transparent',
                  color: timeRange === days && !customRange ? '#0d9488' : '#64748b',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: timeRange === days && !customRange ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {days === 1 ? 'TODAY' : days === 30 ? 'MONTH' : `${days}D`}
              </button>
            ))}
          </div>
          {customRange ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ecfeff',
                padding: '4px 12px',
                borderRadius: '8px',
                border: '1px solid #a5f3fc',
              }}
            >
              <CalendarIcon size={14} color="#0891b2" />
              <input
                type="date"
                value={customRange.start}
                onChange={(event) => setCustomRange({ ...customRange, start: event.target.value })}
                style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, outline: 'none' }}
              />
              <span style={{ color: '#0891b2' }}>→</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(event) => setCustomRange({ ...customRange, end: event.target.value })}
                style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, outline: 'none' }}
              />
              <button
                onClick={() => setCustomRange(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#0891b2', fontWeight: 900 }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCustomRange({ start: format(rangeStart, 'yyyy-MM-dd'), end: format(rangeEnd, 'yyyy-MM-dd') })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 800,
                background: '#fff',
                border: '1px solid #e2e8f0',
                color: '#475569',
                padding: '4px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <CalendarIcon size={14} /> CUSTOM
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={filterHull}
            onChange={(event) => setFilterHull(event.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, outline: 'none' }}
          >
            <option value="ALL">ALL HULLS</option>
            {hullOptions.map((hull) => (
              <option value={hull} key={hull}>
                {hull}
              </option>
            ))}
          </select>
          <select
            value={filterDiscipline}
            onChange={(event) => setFilterDiscipline(event.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, outline: 'none' }}
          >
            <option value="ALL">ALL DISCIPLINES</option>
            {disciplineOptions.map((discipline) => (
              <option value={discipline} key={discipline}>
                {discipline}
              </option>
            ))}
          </select>
          <button
            onClick={handlePrintReport}
            style={{

              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            <Printer size={14} /> PRINT / PDF
          </button>
        </div>
      </div>

      <div ref={printContainerRef} style={{ flex: 1, overflowY: 'auto', background: '#f4f7f9', padding: '32px 0' }} className="reports-print-frame" id="a4-pages-container">
        <ReportPage pageNumber={1} totalPages={3} projectName={currentProjectName}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <SectionTitle
              title="Executive Quality Summary"
              subtitle="Overall inspection outcome distribution and discipline comment totals within the selected reporting scope"
              accent="#0d9488"
            />

            <div
              style={{
                background: '#e0f2fe',
                color: '#0f172a',
                borderRadius: '18px',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '18px',
                border: '1px solid #bae6fd',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#0369a1' }}>
                  Report Period
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.1, marginTop: '6px' }}>{rangeLabel}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#0369a1' }}>
                  Active Filters
                </div>
                <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '6px' }}>Hull: {filterHull}</div>
                <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '2px' }}>Discipline: {filterDiscipline}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              <StatCard
                label="Total Inspections"
                value={inspectionStats.total}
                helper="Inspection items inside report period"
                icon={<Hash size={14} color="#64748b" />}
                color="slate"
              />
              <StatCard
                label="Overall Pass Rate"
                value={formatPercent(inspectionStats.passRate)}
                helper={`${inspectionStats.passed} accepted / qualified`}
                icon={<CheckCircle size={14} color="#10b981" />}
                color="emerald"
              />
              <StatCard
                label="First-Time Yield"
                value={formatPercent(inspectionStats.yield1stTime)}
                helper="Accepted / qualified at round 1"
                icon={<TrendingUp size={14} color="#4f46e5" />}
                color="indigo"
              />
              <StatCard
                label="Inspection Comments"
                value={commentStats.total}
                helper={`${commentStats.disciplinesWithComments} disciplines with comments`}
                icon={<AlertTriangle size={14} color="#ea580c" />}
                color="amber"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.7fr)', gap: '16px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '16px' }}>
                  Quality Results Distribution
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{ height: '220px', width: '220px', position: 'relative', flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={88}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((segment) => (
                            <Cell key={segment.name} fill={segment.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', lineHeight: 1, marginTop: '2px' }}>{inspectionStats.total}</div>
                      <div style={{ fontSize: '8px', fontWeight: 900, color: '#0d9488', textTransform: 'uppercase', marginTop: '4px' }}>Items</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '8px' }}>
                    {RESULT_SEGMENTS.map((segment) => {
                      const count = overallResultBreakdown.find((item) => item.key === segment.key)?.value ?? 0;
                      return (
                        <LegendItem
                          key={segment.key}
                          color={segment.color}
                          label={segment.label}
                          count={count}
                          total={inspectionStats.total}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  Discipline Insights
                </div>

                <div style={{ flex: 1, minHeight: '220px', background: '#fff', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '9px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
                    Top Disciplines by Comment Volume
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={disciplineCommentData.slice(0, 6)} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="discipline" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      />
                      <Bar dataKey="TotalComments" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </ReportPage>

        <ReportPage pageNumber={2} totalPages={3} projectName={currentProjectName}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <SectionTitle
              title="Discipline Result Analysis"
              subtitle="Per-discipline inspection result distribution and total inspection comment volume"
              accent="#f59e0b"
            />

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                Inspection Result Distribution by Discipline
              </div>
              <div style={{ minHeight: '270px' }}>
                {disciplineQualityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={disciplineQualityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="discipline" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      />
                      <Bar dataKey="acceptedAA" name="Accepted (AA)" stackId="result" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="qualifiedQCC" name="Qualified (QCC)" stackId="result" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="pending" name="Pending" stackId="result" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="rejectedRJ" name="Rejected (RJ)" stackId="result" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="owc" name="OWC" stackId="result" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '270px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: '10px', fontWeight: 700 }}>
                    NO DATA AVAILABLE IN SELECTED SCOPE
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                  Inspection Comments by Discipline
                </div>
                <div style={{ minHeight: '220px' }}>
                  {disciplineCommentData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={disciplineCommentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="discipline" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#94a3b8' }} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        />
                        <Bar dataKey="TotalComments" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: '10px', fontWeight: 700 }}>
                      NO DATA AVAILABLE
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                  Discipline Result Summary
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {disciplineQualityData.slice(0, 6).map((row) => (
                    <div
                      key={row.discipline}
                      style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        border: '1px solid #e2e8f0',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.2fr) repeat(3, auto)',
                        gap: '12px',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{row.discipline}</div>
                        <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.08em' }}>
                          {row.total} inspections • {row.TotalComments} comments
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>AA+QCC</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{row.acceptedAA + row.qualifiedQCC}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Pending</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#64748b', marginTop: '4px' }}>{row.pending}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>RJ+OWC</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>{row.rejectedRJ + row.owc}</div>
                      </div>
                    </div>
                  ))}
                  {disciplineQualityData.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                      No discipline summary available in the selected report scope.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

          </div>
        </ReportPage>

        <ReportPage pageNumber={3} totalPages={3} projectName={currentProjectName} isFlexible>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <SectionTitle
              title="Discipline Summary Details"
              subtitle="Full inspection result matrix and comment totals for each construction discipline"
              accent="#0ea5e9"
            />

            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div
                style={{
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: '10px',
                  fontWeight: 900,
                  color: '#334155',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Discipline Inspection Result and Comment Summary
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Discipline</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Inspections</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#10b981', textTransform: 'uppercase' }}>AA</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase' }}>QCC</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Pending</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>RJ</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase' }}>OWC</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#0ea5e9', textTransform: 'uppercase' }}>Comments</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: '#4338ca', textTransform: 'uppercase' }}>Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplineQualityData.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                        No discipline inspection data found in the selected report scope.
                      </td>
                    </tr>
                  ) : (
                    disciplineQualityData.map((row) => (
                      <tr key={row.discipline} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{row.discipline}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569' }}>{row.total}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#10b981' }}>{row.acceptedAA}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#3b82f6' }}>{row.qualifiedQCC}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#64748b' }}>{row.pending}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#ef4444' }}>{row.rejectedRJ}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#f59e0b' }}>{row.owc}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: '#0ea5e9' }}>{row.TotalComments}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: row.passRate >= 80 ? '#10b981' : row.passRate >= 50 ? '#eab308' : '#ef4444' }}>
                          {row.passRate}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '9px', color: '#94a3b8', fontStyle: 'italic', padding: '16px 0' }}>
              * End of Report *
            </div>
          </div>
        </ReportPage>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media screen {
          #a4-pages-container {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
        }
      `,
        }}
      />
    </div>
  );
}
