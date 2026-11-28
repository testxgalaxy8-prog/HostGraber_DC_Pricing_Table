import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  IndianRupee,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  getTodayIsoDate,
} from '../../shared/leads.ts';
import { UserAvatar } from '../UserAvatar.tsx';
import type {
  LeadStatus,
  PortalSettings,
  ReportsAnalyticsData,
} from '../../shared/types.ts';

export type ReportsSubTab = 'sales' | 'revenue' | 'team';

interface StageBucket {
  id: string;
  label: string;
  color: string;
  statuses: LeadStatus[];
}

const STAGE_BUCKETS: StageBucket[] = [
  {
    id: 'discovery',
    label: 'Discovery & Contact',
    color: '#2563EB',
    statuses: ['new_lead', 'positive_lead', 'not_answering'],
  },
  {
    id: 'negotiation',
    label: 'Quote, Meeting & Trial',
    color: '#D97706',
    statuses: ['quotation_shared', 'meeting_scheduled', 'trial_given'],
  },
  {
    id: 'won',
    label: 'Closed Won',
    color: '#17C964',
    statuses: ['won'],
  },
  {
    id: 'nurture',
    label: 'Existing & Future',
    color: '#0EA5E9',
    statuses: ['existing_client_lead', 'future_prospect'],
  },
  {
    id: 'closed',
    label: 'Lost, Cold & Denied',
    color: '#94A3B8',
    statuses: ['lost', 'cold_lead', 'denied'],
  },
];

function formatCompactMoney(val: number, symbol: string): string {
  const abs = Math.abs(val);
  if (abs >= 10_000_000) return `${symbol}${(val / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${symbol}${(val / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${symbol}${(val / 1_000).toFixed(1)}K`;
  return `${symbol}${Math.round(val)}`;
}

function buildSmoothLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function ReportsAnalyticsView({
  initialTab = 'sales',
  settings,
  onToast,
}: {
  initialTab?: ReportsSubTab;
  settings: PortalSettings;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [subTab, setSubTab] = useState<ReportsSubTab>(initialTab);
  const [monthKey, setMonthKey] = useState(() => getTodayIsoDate().slice(0, 7));
  const [data, setData] = useState<ReportsAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [hoveredRevIdx, setHoveredRevIdx] = useState<number | null>(null);
  const [hoveredStageId, setHoveredStageId] = useState<string | null>(null);
  const [hoveredMixId, setHoveredMixId] = useState<'won' | 'pipeline' | null>(null);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const loadReports = useCallback(
    async (month: string) => {
      setLoading(true);
      try {
        const res = await apiFetch<ReportsAnalyticsData>(
          `/api/reports?month=${encodeURIComponent(month)}`
        );
        setData(res);
      } catch (err) {
        onToast(
          'error',
          err instanceof Error
            ? err.message
            : 'Failed to load reports & analytics.'
        );
      } finally {
        setLoading(false);
      }
    },
    [onToast]
  );

  useEffect(() => {
    loadReports(monthKey);
  }, [loadReports, monthKey]);

  const formatMoney = useCallback(
    (val: number) =>
      formatCurrencyValue(val, settings.currencySymbol, settings.currencyCode),
    [settings.currencyCode, settings.currencySymbol]
  );

  const stageBreakdown = useMemo(() => {
    if (!data) return [];
    const statusMap = new Map(data.byStatus.map((row) => [row.status, row]));
    const total = Math.max(0, data.summary.totalLeads);
    return STAGE_BUCKETS.map((bucket) => {
      const count = bucket.statuses.reduce(
        (sum, st) => sum + (statusMap.get(st)?.count ?? 0),
        0
      );
      const value = bucket.statuses.reduce(
        (sum, st) => sum + (statusMap.get(st)?.pipelineValue ?? 0),
        0
      );
      const percentage = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
      return {
        ...bucket,
        count,
        value,
        percentage,
      };
    });
  }, [data]);

  const avgDealSize = useMemo(() => {
    if (!data || data.summary.wonLeads === 0) return 0;
    return Math.round(data.summary.wonRevenue / data.summary.wonLeads);
  }, [data]);

  const maxStatusCount = data
    ? Math.max(1, ...data.byStatus.map((s) => s.count))
    : 1;
  const maxSourceTotal = data
    ? Math.max(1, ...data.bySource.map((s) => s.totalLeads))
    : 1;
  const maxSourceRev = data
    ? Math.max(1, ...data.bySource.map((s) => s.revenue))
    : 1;

  // Monthly Lead Intake vs Won Deals SVG Geometry
  const comboChart = useMemo(() => {
    const rows = data?.monthlyTrend ?? [];
    const width = 640;
    const height = 250;
    const padL = 42;
    const padR = 20;
    const padT = 18;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const rawMax = Math.max(4, ...rows.map((r) => Math.max(r.newLeads, r.wonLeads)));
    const yMax = Math.ceil(rawMax / 4) * 4;
    const colW = rows.length > 0 ? plotW / rows.length : plotW;
    const barW = Math.min(22, Math.max(10, colW * 0.24));

    const points = rows.map((r, idx) => {
      const cx = padL + colW * idx + colW / 2;
      const winPct = r.newLeads > 0 ? (r.wonLeads / r.newLeads) * 100 : 0;
      const newH = (r.newLeads / yMax) * plotH;
      const wonH = (r.wonLeads / yMax) * plotH;
      const lineY = padT + plotH - (Math.min(100, winPct) / 100) * plotH;
      return {
        ...r,
        winPct: Math.round(winPct * 10) / 10,
        cx,
        newX: cx - barW - 2,
        newY: padT + plotH - newH,
        newH,
        wonX: cx + 2,
        wonY: padT + plotH - wonH,
        wonH,
        lineY,
      };
    });

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      value: Math.round(yMax * t),
      y: padT + plotH - plotH * t,
    }));

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      colW,
      barW,
      ticks,
      points,
      linePath: buildSmoothLinePath(points.map((p) => ({ x: p.cx, y: p.lineY }))),
    };
  }, [data]);

  // Monthly Revenue Area Trajectory SVG Geometry
  const revenueChart = useMemo(() => {
    const rows = data?.monthlyTrend ?? [];
    const width = 680;
    const height = 260;
    const padL = 62;
    const padR = 24;
    const padT = 20;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const rawMax = Math.max(1000, ...rows.map((r) => r.revenue));
    const yMax = rawMax * 1.15;
    const stepX = rows.length > 1 ? plotW / (rows.length - 1) : 0;

    const points = rows.map((r, idx) => {
      const x = rows.length === 1 ? padL + plotW / 2 : padL + stepX * idx;
      const y = padT + plotH - (r.revenue / yMax) * plotH;
      const prevRev = idx > 0 ? rows[idx - 1].revenue : null;
      const momPct =
        prevRev && prevRev > 0
          ? Math.round(((r.revenue - prevRev) / prevRev) * 1000) / 10
          : null;
      return {
        ...r,
        x,
        y,
        momPct,
      };
    });

    const linePath = buildSmoothLinePath(points.map((p) => ({ x: p.x, y: p.y })));
    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
        : '';

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      value: yMax * t,
      y: padT + plotH - plotH * t,
    }));

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      ticks,
      points,
      linePath,
      areaPath,
    };
  }, [data]);

  const activeTrendPoint =
    hoveredTrendIdx !== null
      ? comboChart.points[hoveredTrendIdx] ?? null
      : comboChart.points[comboChart.points.length - 1] ?? null;

  const activeRevPoint =
    hoveredRevIdx !== null
      ? revenueChart.points[hoveredRevIdx] ?? null
      : revenueChart.points[revenueChart.points.length - 1] ?? null;

  const activeStage =
    hoveredStageId !== null
      ? stageBreakdown.find((s) => s.id === hoveredStageId) ?? null
      : null;

  const b2bPct =
    data && data.summary.totalLeads > 0
      ? Math.round((data.summary.b2bCount / data.summary.totalLeads) * 100)
      : 50;

  return (
    <div className="space-y-5">
      {/* Executive Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Reports &amp; Analytics
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Pipeline velocity, conversion funnel, revenue trajectory &amp; team quota attainment
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          <input
            type="month"
            aria-label="Select report month"
            value={monthKey}
            onChange={(e) => {
              if (e.target.value) setMonthKey(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          />

          <button
            type="button"
            onClick={() => loadReports(monthKey)}
            disabled={loading}
            title="Refresh analytics"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSubTab('sales')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'sales'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Sales Performance</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('revenue')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'revenue'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5" />
              <span>Revenue Reports</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('team')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'team'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Performance</span>
            </button>
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-28 bg-white border border-[#E2E8F0] rounded-xl"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-7 h-80 bg-white border border-[#E2E8F0] rounded-xl" />
            <div className="xl:col-span-5 h-80 bg-white border border-[#E2E8F0] rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          {/* Executive KPI Strip */}
          <div className="border border-[#E2E8F0] rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-px bg-[#E2E8F0]">
            <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">Total Leads</span>
                <span className="text-[11px] font-mono-tabular text-[#475569] whitespace-nowrap">
                  B2B {data.summary.b2bCount} · Retail {data.summary.retailCount}
                </span>
              </div>
              <div className="mt-2 font-mono-tabular text-2xl font-bold text-[#0F172A]">
                {data.summary.totalLeads}
              </div>
              <div className="mt-3 space-y-1">
                <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-[#0F172A]"
                    style={{ width: `${b2bPct}%` }}
                  />
                  <div
                    className="h-full bg-[#17C964]"
                    style={{ width: `${100 - b2bPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#64748B] font-mono-tabular">
                  <span>B2B {b2bPct}%</span>
                  <span>Retail {100 - b2bPct}%</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">
                  Active Pipeline
                </span>
                <span className="text-[11px] font-medium text-[#2563EB] whitespace-nowrap">
                  In Progress
                </span>
              </div>
              <div className="mt-2 font-mono-tabular text-2xl font-bold text-[#2563EB]">
                {data.summary.activePipeline}
              </div>
              <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Open Value</span>
                <span className="font-mono-tabular font-semibold text-[#0F172A]">
                  {formatMoney(data.summary.pipelineValue)}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">Won Deals</span>
                <span className="text-[11px] font-medium text-[#059669] whitespace-nowrap">
                  Converted
                </span>
              </div>
              <div className="mt-2 font-mono-tabular text-2xl font-bold text-[#059669]">
                {data.summary.wonLeads}
              </div>
              <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Closed Non-Won</span>
                <span className="font-mono-tabular font-semibold text-[#475569]">
                  {data.summary.lostAndDenied}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">Win Rate</span>
                <TrendingUp className="w-3.5 h-3.5 text-[#059669] shrink-0" />
              </div>
              <div className="mt-2 font-mono-tabular text-2xl font-bold text-[#0F172A]">
                {data.summary.conversionRate}%
              </div>
              <div className="mt-3 space-y-1">
                <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#17C964] rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, data.summary.conversionRate))}%`,
                    }}
                  />
                </div>
                <div className="text-[11px] text-[#64748B] font-mono-tabular">
                  {data.summary.wonLeads} of {data.summary.totalLeads} total leads
                </div>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">Won Revenue</span>
                <span className="text-[11px] font-medium text-[#059669] whitespace-nowrap">
                  Realized
                </span>
              </div>
              <div className="mt-2 font-mono-tabular text-xl font-bold text-[#059669] truncate">
                {formatMoney(data.summary.wonRevenue)}
              </div>
              <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Avg Deal</span>
                <span className="font-mono-tabular font-semibold text-[#0F172A]">
                  {formatMoney(avgDealSize)}
                </span>
              </div>
            </div>
          </div>

          {/* SUB-TAB 1: SALES PERFORMANCE */}
          {subTab === 'sales' && (
            <div className="space-y-5">
              {/* Row 1: Monthly Volume Combo Graph + Pipeline Stage Donut */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#0F172A]">
                        Monthly Lead Intake vs. Won Deals
                      </h2>
                      <p className="text-[11px] text-[#64748B]">
                        6-month acquisition volume &amp; win conversion trend
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#475569]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#1E293B]" />
                        <span>New Leads</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#17C964]" />
                        <span>Won Deals</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-0.5 bg-[#D97706]" />
                        <span>Win %</span>
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    {activeTrendPoint && (
                      <div className="mb-3 px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0F172A]">
                          {activeTrendPoint.label}
                        </span>
                        <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                          <span className="text-[#334155]">
                            New: <strong>{activeTrendPoint.newLeads}</strong>
                          </span>
                          <span className="text-[#059669]">
                            Won: <strong>{activeTrendPoint.wonLeads}</strong>
                          </span>
                          <span className="text-[#D97706]">
                            Win Rate: <strong>{activeTrendPoint.winPct}%</strong>
                          </span>
                          <span className="text-[#0F172A]">
                            Rev: <strong>{formatMoney(activeTrendPoint.revenue)}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="w-full overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${comboChart.width} ${comboChart.height}`}
                        className="w-full min-w-[480px] h-64 select-none"
                        role="img"
                        aria-label="Monthly Lead Intake and Won Deals chart"
                      >
                        {/* Horizontal gridlines */}
                        {comboChart.ticks.map((tick) => (
                          <g key={tick.value}>
                            <line
                              x1={comboChart.padL}
                              y1={tick.y}
                              x2={comboChart.width - comboChart.padR}
                              y2={tick.y}
                              stroke="#E2E8F0"
                              strokeDasharray={tick.value === 0 ? undefined : '3 3'}
                            />
                            <text
                              x={comboChart.padL - 8}
                              y={tick.y + 4}
                              textAnchor="end"
                              className="fill-[#64748B] text-[10px] font-mono"
                            >
                              {tick.value}
                            </text>
                          </g>
                        ))}

                        {/* Hover column highlights + bars */}
                        {comboChart.points.map((pt, idx) => {
                          const isHovered = hoveredTrendIdx === idx;
                          return (
                            <g
                              key={pt.monthKey}
                              onMouseEnter={() => setHoveredTrendIdx(idx)}
                              onMouseLeave={() => setHoveredTrendIdx(null)}
                              className="cursor-pointer"
                            >
                              {isHovered && (
                                <rect
                                  x={comboChart.padL + comboChart.colW * idx + 4}
                                  y={comboChart.padT}
                                  width={Math.max(0, comboChart.colW - 8)}
                                  height={comboChart.plotH}
                                  rx={6}
                                  fill="#F1F5F9"
                                />
                              )}
                              <rect
                                x={pt.newX}
                                y={pt.newY}
                                width={comboChart.barW}
                                height={Math.max(2, pt.newH)}
                                rx={3}
                                fill={isHovered ? '#0F172A' : '#1E293B'}
                              />
                              <rect
                                x={pt.wonX}
                                y={pt.wonY}
                                width={comboChart.barW}
                                height={Math.max(2, pt.wonH)}
                                rx={3}
                                fill={isHovered ? '#059669' : '#17C964'}
                              />
                              <text
                                x={pt.cx}
                                y={comboChart.height - 10}
                                textAnchor="middle"
                                className={`text-[11px] ${
                                  isHovered
                                    ? 'fill-[#0F172A] font-semibold'
                                    : 'fill-[#64748B]'
                                }`}
                              >
                                {pt.label}
                              </text>
                            </g>
                          );
                        })}

                        {/* Win rate trend line */}
                        {comboChart.linePath && (
                          <path
                            d={comboChart.linePath}
                            fill="none"
                            stroke="#D97706"
                            strokeWidth={2}
                            strokeLinecap="round"
                            pointerEvents="none"
                          />
                        )}
                        {comboChart.points.map((pt, idx) => (
                          <circle
                            key={`node-${pt.monthKey}`}
                            cx={pt.cx}
                            cy={pt.lineY}
                            r={hoveredTrendIdx === idx ? 5 : 3.5}
                            fill="#FFFFFF"
                            stroke="#D97706"
                            strokeWidth={2}
                            pointerEvents="none"
                          />
                        ))}
                      </svg>
                    </div>
                  </div>
                </section>

                {/* Pipeline Stage Donut Chart */}
                <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-[#0F172A]">
                        Pipeline Stage Distribution
                      </h2>
                      <p className="text-[11px] text-[#64748B]">
                        Hover stage to inspect lead count &amp; value
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular text-[#64748B]">
                      {data.summary.totalLeads} total
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative w-44 h-44 shrink-0">
                      <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                        <circle
                          cx="90"
                          cy="90"
                          r="66"
                          fill="none"
                          stroke="#F1F5F9"
                          strokeWidth="18"
                        />
                        {(() => {
                          const total = data.summary.totalLeads;
                          if (total <= 0) return null;
                          const circumference = 2 * Math.PI * 66;
                          let offsetAccum = 0;
                          return stageBreakdown.map((seg) => {
                            if (seg.count <= 0) return null;
                            const dashLen = (seg.count / total) * circumference;
                            const currentOffset = offsetAccum;
                            offsetAccum += dashLen;
                            const active = hoveredStageId === seg.id;
                            return (
                              <circle
                                key={seg.id}
                                cx="90"
                                cy="90"
                                r="66"
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={active ? 22 : 18}
                                strokeDasharray={`${Math.max(1, dashLen - 1.5)} ${circumference}`}
                                strokeDashoffset={-currentOffset}
                                className="transition-all duration-150 cursor-pointer"
                                onMouseEnter={() => setHoveredStageId(seg.id)}
                                onMouseLeave={() => setHoveredStageId(null)}
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                        <div className="font-mono-tabular text-2xl font-bold text-[#0F172A]">
                          {activeStage ? activeStage.count : data.summary.totalLeads}
                        </div>
                        <div className="text-[11px] font-medium text-[#64748B] leading-tight mt-0.5">
                          {activeStage
                            ? `${activeStage.percentage}% · ${activeStage.label}`
                            : `${data.summary.conversionRate}% Win Rate`}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 w-full space-y-2">
                      {stageBreakdown.map((seg) => {
                        const active = hoveredStageId === seg.id;
                        return (
                          <div
                            key={seg.id}
                            onMouseEnter={() => setHoveredStageId(seg.id)}
                            onMouseLeave={() => setHoveredStageId(null)}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              active ? 'bg-[#F8FAFC]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className="font-medium text-[#0F172A] truncate">
                                {seg.label}
                              </span>
                            </div>
                            <div className="font-mono-tabular text-[#334155] shrink-0">
                              <span className="font-semibold text-[#0F172A]">
                                {seg.count}
                              </span>{' '}
                              <span className="text-[#64748B]">({seg.percentage}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>

              {/* Row 2: 12-Status Pipeline Funnel + Source Conversion Bar Graph */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      12-Status Pipeline Funnel
                    </h2>
                    <span className="text-xs text-[#64748B] font-mono-tabular">
                      Open: {formatMoney(data.summary.pipelineValue)}
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    {data.byStatus.map((row) => {
                      const meta = LEAD_STATUS_META[row.status];
                      const widthPct =
                        row.count === 0
                          ? 0
                          : Math.max(4, Math.round((row.count / maxStatusCount) * 100));
                      return (
                        <div key={row.status} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold ${meta.textClass}`}>
                              {meta.label}
                            </span>
                            <span className="font-mono-tabular text-[#334155]">
                              {row.count} leads ({row.percentage}%)
                              {row.pipelineValue > 0
                                ? ` · ${formatMoney(row.pipelineValue)}`
                                : ''}
                            </span>
                          </div>
                          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${meta.indicatorClass}`}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      Acquisition Source Volume &amp; Win %
                    </h2>
                    <span className="text-[11px] text-[#64748B]">
                      Total vs. Won
                    </span>
                  </div>
                  <div className="p-5 space-y-3.5">
                    {data.bySource.map((row) => {
                      const totalPct =
                        row.totalLeads === 0
                          ? 0
                          : Math.max(4, Math.round((row.totalLeads / maxSourceTotal) * 100));
                      const wonShareOfTotal =
                        row.totalLeads > 0
                          ? Math.round((row.wonLeads / row.totalLeads) * 100)
                          : 0;
                      return (
                        <div key={row.source} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-[#0F172A] truncate">
                              {LEAD_SOURCE_LABELS[row.source]}
                            </span>
                            <span className="font-mono-tabular text-[#334155] shrink-0">
                              <strong className="text-[#0F172A]">{row.totalLeads}</strong>
                              {' · '}
                              <span className="text-[#059669] font-semibold">
                                {row.wonLeads} won
                              </span>
                              {' · '}
                              <span className="text-[#64748B]">{row.conversionRate}%</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#CBD5E1] rounded-full overflow-hidden"
                              style={{ width: `${totalPct}%` }}
                            >
                              <div
                                className="h-full bg-[#17C964] rounded-full"
                                style={{ width: `${wonShareOfTotal}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: REVENUE REPORTS */}
          {subTab === 'revenue' && (
            <div className="space-y-5">
              {/* Row 1: Revenue Trajectory Area Chart + Realized vs Open Pipeline Donut */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <section className="xl:col-span-8 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#0F172A]">
                        Won Revenue Trajectory
                      </h2>
                      <p className="text-[11px] text-[#64748B]">
                        Monthly closed-won deal value over the last 6 months
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular font-semibold text-[#059669]">
                      Total Won: {formatMoney(data.summary.wonRevenue)}
                    </span>
                  </div>

                  <div className="p-5">
                    {activeRevPoint && (
                      <div className="mb-3 px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0F172A]">
                          {activeRevPoint.label}
                        </span>
                        <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                          <span className="text-[#059669]">
                            Won Revenue: <strong>{formatMoney(activeRevPoint.revenue)}</strong>
                          </span>
                          <span className="text-[#334155]">
                            Deals: <strong>{activeRevPoint.wonLeads}</strong>
                          </span>
                          <span className="text-[#475569]">
                            Avg:{' '}
                            <strong>
                              {formatMoney(
                                activeRevPoint.wonLeads > 0
                                  ? Math.round(activeRevPoint.revenue / activeRevPoint.wonLeads)
                                  : 0
                              )}
                            </strong>
                          </span>
                          {activeRevPoint.momPct !== null && (
                            <span
                              className={
                                activeRevPoint.momPct >= 0
                                  ? 'text-[#059669] font-semibold'
                                  : 'text-[#DC2626] font-semibold'
                              }
                            >
                              MoM {activeRevPoint.momPct >= 0 ? '+' : ''}
                              {activeRevPoint.momPct}%
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="w-full overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${revenueChart.width} ${revenueChart.height}`}
                        className="w-full min-w-[500px] h-64 select-none"
                        role="img"
                        aria-label="Won Revenue Trajectory Area Chart"
                      >
                        <defs>
                          <linearGradient id="hgRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#17C964" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#17C964" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>

                        {revenueChart.ticks.map((tick, idx) => (
                          <g key={idx}>
                            <line
                              x1={revenueChart.padL}
                              y1={tick.y}
                              x2={revenueChart.width - revenueChart.padR}
                              y2={tick.y}
                              stroke="#E2E8F0"
                              strokeDasharray={idx === 0 ? undefined : '3 3'}
                            />
                            <text
                              x={revenueChart.padL - 8}
                              y={tick.y + 4}
                              textAnchor="end"
                              className="fill-[#64748B] text-[10px] font-mono"
                            >
                              {formatCompactMoney(tick.value, settings.currencySymbol)}
                            </text>
                          </g>
                        ))}

                        {revenueChart.areaPath && (
                          <path d={revenueChart.areaPath} fill="url(#hgRevenueGrad)" />
                        )}

                        {revenueChart.linePath && (
                          <path
                            d={revenueChart.linePath}
                            fill="none"
                            stroke="#059669"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                          />
                        )}

                        {revenueChart.points.map((pt, idx) => {
                          const isHovered = hoveredRevIdx === idx;
                          return (
                            <g
                              key={pt.monthKey}
                              onMouseEnter={() => setHoveredRevIdx(idx)}
                              onMouseLeave={() => setHoveredRevIdx(null)}
                              className="cursor-pointer"
                            >
                              {isHovered && (
                                <line
                                  x1={pt.x}
                                  y1={revenueChart.padT}
                                  x2={pt.x}
                                  y2={revenueChart.padT + revenueChart.plotH}
                                  stroke="#94A3B8"
                                  strokeDasharray="3 3"
                                />
                              )}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={isHovered ? 6 : 4}
                                fill={isHovered ? '#059669' : '#FFFFFF'}
                                stroke="#059669"
                                strokeWidth={2.5}
                              />
                              <rect
                                x={pt.x - 28}
                                y={revenueChart.padT}
                                width={56}
                                height={revenueChart.plotH + 26}
                                fill="transparent"
                              />
                              <text
                                x={pt.x}
                                y={revenueChart.height - 10}
                                textAnchor="middle"
                                className={`text-[11px] ${
                                  isHovered
                                    ? 'fill-[#0F172A] font-semibold'
                                    : 'fill-[#64748B]'
                                }`}
                              >
                                {pt.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </section>

                {/* Realized vs Active Pipeline Donut */}
                <section className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      Realized vs. Open Pipeline
                    </h2>
                    <p className="text-[11px] text-[#64748B]">
                      Deal value distribution
                    </p>
                  </div>

                  {(() => {
                    const totalVal =
                      data.summary.wonRevenue + data.summary.pipelineValue;
                    const wonShare =
                      totalVal > 0
                        ? Math.round((data.summary.wonRevenue / totalVal) * 1000) / 10
                        : 0;
                    const pipeShare =
                      totalVal > 0 ? Math.round((100 - wonShare) * 10) / 10 : 0;
                    const circumference = 2 * Math.PI * 62;
                    const wonDash =
                      totalVal > 0
                        ? (data.summary.wonRevenue / totalVal) * circumference
                        : 0;
                    const pipeDash =
                      totalVal > 0
                        ? (data.summary.pipelineValue / totalVal) * circumference
                        : 0;

                    return (
                      <div className="p-5 flex-1 flex flex-col items-center justify-between gap-4">
                        <div className="relative w-44 h-44">
                          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                            <circle
                              cx="80"
                              cy="80"
                              r="62"
                              fill="none"
                              stroke="#F1F5F9"
                              strokeWidth="18"
                            />
                            {totalVal > 0 && (
                              <>
                                <circle
                                  cx="80"
                                  cy="80"
                                  r="62"
                                  fill="none"
                                  stroke="#17C964"
                                  strokeWidth={hoveredMixId === 'won' ? 21 : 18}
                                  strokeDasharray={`${Math.max(1, wonDash - 1.5)} ${circumference}`}
                                  strokeDashoffset={0}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredMixId('won')}
                                  onMouseLeave={() => setHoveredMixId(null)}
                                />
                                <circle
                                  cx="80"
                                  cy="80"
                                  r="62"
                                  fill="none"
                                  stroke="#2563EB"
                                  strokeWidth={hoveredMixId === 'pipeline' ? 21 : 18}
                                  strokeDasharray={`${Math.max(1, pipeDash - 1.5)} ${circumference}`}
                                  strokeDashoffset={-wonDash}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredMixId('pipeline')}
                                  onMouseLeave={() => setHoveredMixId(null)}
                                />
                              </>
                            )}
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                            <div className="text-[11px] text-[#64748B]">
                              {hoveredMixId === 'won'
                                ? 'Won Revenue'
                                : hoveredMixId === 'pipeline'
                                  ? 'Open Pipeline'
                                  : 'Total Value'}
                            </div>
                            <div className="font-mono-tabular text-base font-bold text-[#0F172A] mt-0.5">
                              {formatCompactMoney(
                                hoveredMixId === 'won'
                                  ? data.summary.wonRevenue
                                  : hoveredMixId === 'pipeline'
                                    ? data.summary.pipelineValue
                                    : totalVal,
                                settings.currencySymbol
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="w-full space-y-2 pt-2 border-t border-[#F1F5F9]">
                          <div
                            onMouseEnter={() => setHoveredMixId('won')}
                            onMouseLeave={() => setHoveredMixId(null)}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-[#F8FAFC] cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2 text-[#334155]">
                              <span className="w-2.5 h-2.5 rounded-xs bg-[#17C964]" />
                              <span>Won Revenue ({wonShare}%)</span>
                            </span>
                            <span className="font-mono-tabular font-semibold text-[#059669]">
                              {formatMoney(data.summary.wonRevenue)}
                            </span>
                          </div>
                          <div
                            onMouseEnter={() => setHoveredMixId('pipeline')}
                            onMouseLeave={() => setHoveredMixId(null)}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-[#F8FAFC] cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2 text-[#334155]">
                              <span className="w-2.5 h-2.5 rounded-xs bg-[#2563EB]" />
                              <span>Open Pipeline ({pipeShare}%)</span>
                            </span>
                            <span className="font-mono-tabular font-semibold text-[#2563EB]">
                              {formatMoney(data.summary.pipelineValue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              </div>

              {/* Row 2: Monthly Ledger + Revenue by Acquisition Source */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      Monthly Revenue &amp; Deal Ledger
                    </h2>
                    <span className="text-xs text-[#64748B] font-mono-tabular">
                      Last {data.monthlyTrend.length} months
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                          <th className="py-2.5 px-5">Month</th>
                          <th className="py-2.5 px-4 text-right">New Leads</th>
                          <th className="py-2.5 px-4 text-right">Won Deals</th>
                          <th className="py-2.5 px-4 text-right">Win %</th>
                          <th className="py-2.5 px-5 text-right">Won Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {data.monthlyTrend.map((m) => {
                          const winPct =
                            m.newLeads > 0
                              ? Math.round((m.wonLeads / m.newLeads) * 1000) / 10
                              : 0;
                          return (
                            <tr key={m.monthKey} className="hover:bg-[#F8FAFC]">
                              <td className="py-2.5 px-5 font-medium text-[#0F172A]">
                                {m.label}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular text-[#334155]">
                                {m.newLeads}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular text-[#059669] font-semibold">
                                {m.wonLeads}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular text-[#475569]">
                                {winPct}%
                              </td>
                              <td className="py-2.5 px-5 text-right font-mono-tabular font-semibold text-[#0F172A]">
                                {formatMoney(m.revenue)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      Revenue by Acquisition Source
                    </h2>
                  </div>
                  <div className="p-5 space-y-3">
                    {data.bySource.map((row) => {
                      const widthPct =
                        row.revenue === 0
                          ? 0
                          : Math.max(4, Math.round((row.revenue / maxSourceRev) * 100));
                      const sharePct =
                        data.summary.wonRevenue > 0
                          ? Math.round((row.revenue / data.summary.wonRevenue) * 100)
                          : 0;
                      return (
                        <div key={row.source} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[#0F172A]">
                              {LEAD_SOURCE_LABELS[row.source]}
                            </span>
                            <span className="font-mono-tabular font-semibold text-[#059669]">
                              {formatMoney(row.revenue)}{' '}
                              <span className="text-[#64748B] font-normal">
                                ({sharePct}%)
                              </span>
                            </span>
                          </div>
                          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#17C964]"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* SUB-TAB 3: TEAM PERFORMANCE */}
          {subTab === 'team' && (
            <div className="space-y-5">
              {data.teamPerformance.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  {/* Revenue vs Target Attainment Chart */}
                  <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-[#0F172A]">
                          Revenue Attainment vs. Target ({data.monthKey})
                        </h2>
                        <p className="text-[11px] text-[#64748B]">
                          Closed-won revenue compared against assigned monthly quota
                        </p>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      {(() => {
                        const maxTeamRev = Math.max(
                          1,
                          ...data.teamPerformance.map((m) =>
                            Math.max(m.wonRevenue, m.revenueTarget)
                          )
                        );
                        return data.teamPerformance.map((member) => {
                          const targetPct =
                            member.revenueTarget > 0
                              ? Math.round((member.wonRevenue / member.revenueTarget) * 100)
                              : null;
                          const revBarPct =
                            member.wonRevenue > 0
                              ? Math.max(4, Math.round((member.wonRevenue / maxTeamRev) * 100))
                              : 0;
                          const targetBarPct =
                            member.revenueTarget > 0
                              ? Math.max(4, Math.round((member.revenueTarget / maxTeamRev) * 100))
                              : 0;
                          return (
                            <div key={member.userId} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <UserAvatar
                                    avatarUrl={member.avatarUrl}
                                    name={member.displayName}
                                    size="xs"
                                  />
                                  <span className="text-xs font-semibold text-[#0F172A] truncate">
                                    {member.displayName}
                                  </span>
                                  {member.departmentName && (
                                    <span className="text-[11px] text-[#64748B] truncate hidden sm:inline">
                                      · {member.departmentName}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs font-mono-tabular shrink-0">
                                  <span className="font-semibold text-[#059669]">
                                    {formatMoney(member.wonRevenue)}
                                  </span>
                                  {member.revenueTarget > 0 && (
                                    <span className="text-[#64748B]">
                                      {' / '}
                                      {formatMoney(member.revenueTarget)} ({targetPct}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="relative h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                {targetBarPct > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 bg-[#CBD5E1]/70 rounded-full"
                                    style={{ width: `${targetBarPct}%` }}
                                  />
                                )}
                                <div
                                  className={`relative h-full rounded-full ${
                                    targetPct !== null && targetPct < 50
                                      ? 'bg-[#D97706]'
                                      : 'bg-[#17C964]'
                                  }`}
                                  style={{ width: `${revBarPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </section>

                  {/* Win Conversion & Deals Won Comparison */}
                  <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-[#0F172A]">
                          Conversion &amp; Follow-up Activity
                        </h2>
                        <p className="text-[11px] text-[#64748B]">
                          Win rate percentage &amp; active scheduled follow-ups
                        </p>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      {data.teamPerformance.map((member) => (
                        <div key={member.userId} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <UserAvatar
                                avatarUrl={member.avatarUrl}
                                name={member.displayName}
                                size="xs"
                              />
                              <span className="font-medium text-[#0F172A] truncate">
                                {member.displayName}
                              </span>
                            </div>
                            <div className="font-mono-tabular shrink-0 text-[#334155]">
                              <strong className="text-[#0F172A]">
                                {member.conversionRate}%
                              </strong>{' '}
                              win ·{' '}
                              <span className="text-[#D97706]">
                                {member.activeFollowUps} due
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#2563EB] rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  member.conversionRate > 0
                                    ? Math.max(5, member.conversionRate)
                                    : 0
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* Detailed Team Scorecard Table */}
              <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#0F172A]">
                    Team Performance Scorecard ({data.monthKey})
                  </h2>
                </div>
                {data.teamPerformance.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No active team member metrics found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                          <th className="py-3 px-5">Team Member</th>
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-3 text-right">Total Leads</th>
                          <th className="py-3 px-3 text-right">Month / Target</th>
                          <th className="py-3 px-3 text-right">Active Follow-ups</th>
                          <th className="py-3 px-3 text-right">Won / Target</th>
                          <th className="py-3 px-3 text-right">Win %</th>
                          <th className="py-3 px-5 text-right">Revenue / Target</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {data.teamPerformance.map((member) => (
                          <tr key={member.userId} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  avatarUrl={member.avatarUrl}
                                  name={member.displayName}
                                  size="sm"
                                />
                                <div>
                                  <div className="font-semibold text-[#0F172A]">
                                    {member.displayName}
                                  </div>
                                  <div className="text-xs font-mono-tabular text-[#64748B]">
                                    @{member.username}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#475569]">
                              {member.departmentName || '—'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-tabular text-[#0F172A]">
                              {member.totalLeads}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-tabular text-[#334155]">
                              {member.newLeadsThisMonth}
                              {member.leadsTarget > 0 ? ` / ${member.leadsTarget}` : ''}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-tabular text-[#D97706]">
                              {member.activeFollowUps}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#059669]">
                              {member.wonLeads}
                              {member.wonTarget > 0 ? ` / ${member.wonTarget}` : ''}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-tabular text-[#475569]">
                              {member.conversionRate}%
                            </td>
                            <td className="py-3 px-5 text-right font-mono-tabular font-semibold text-[#0F172A]">
                              {formatMoney(member.wonRevenue)}
                              {member.revenueTarget > 0
                                ? ` / ${formatMoney(member.revenueTarget)}`
                                : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
