import { useEffect, useState } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  PhoneCall,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  formatLeadDisplayDate,
} from '../../shared/leads.ts';
import type {
  CombinedDashboardData,
  HostingPlanFull,
  PortalSettings,
  PortalUser,
} from '../../shared/types.ts';

export type DashboardTargetTab =
  | 'dashboard'
  | 'leads'
  | 'upload'
  | 'plans'
  | 'history'
  | 'reports'
  | 'team'
  | 'integrations'
  | 'logs'
  | 'profile'
  | 'settings';

export function AdminDashboard({
  user,
  settings,
  onNavigate,
  onOpenLead,
  onViewPlan,
  onEditPlan,
}: {
  user: PortalUser;
  settings: PortalSettings;
  onNavigate: (tab: DashboardTargetTab) => void;
  onOpenLead?: (leadId: number) => void;
  onViewPlan: (plan: HostingPlanFull) => void;
  onEditPlan: (plan: HostingPlanFull) => void;
}) {
  const [data, setData] = useState<CombinedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<CombinedDashboardData>('/api/dashboard')
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load dashboard.'
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const displayName = user.displayName || user.username;
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 bg-white border border-[#E2E8F0] rounded-lg w-60" />
            <div className="h-4 bg-white border border-[#E2E8F0] rounded w-44" />
          </div>
          <div className="h-9 bg-white border border-[#E2E8F0] rounded-lg w-56" />
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl h-28" />
        <div className="bg-white border border-[#E2E8F0] rounded-xl h-64" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 bg-white border border-[#E2E8F0] rounded-xl h-64" />
          <div className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-xl h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
        {error || 'Unable to load dashboard.'}
      </div>
    );
  }

  const { leadSummary, catalogSummary } = data;
  const lastUpload = catalogSummary.recentImports[0] || null;
  const inactivePlans = Math.max(
    0,
    catalogSummary.totalPlans - catalogSummary.activePlans
  );

  const pipelineStats = [
    {
      label: 'Total Leads',
      value: leadSummary.totalLeads,
      sub: 'All active records',
      valueClass: 'text-[#0F172A]',
    },
    {
      label: 'New Today',
      value: leadSummary.newToday,
      sub: 'Added today',
      valueClass: 'text-[#2563EB]',
    },
    {
      label: 'Follow-ups',
      value: leadSummary.followUpsDue,
      sub: 'Due today',
      valueClass: 'text-[#D97706]',
    },
    {
      label: 'Overdue',
      value: leadSummary.overdue,
      sub: 'Past follow-up',
      valueClass: 'text-[#DC2626]',
    },
    {
      label: 'Positive',
      value: leadSummary.positiveCount,
      sub: 'Active interest',
      valueClass: 'text-[#059669]',
    },
    {
      label: 'Won Deals',
      value: leadSummary.wonCount,
      sub: 'Converted clients',
      valueClass: 'text-[#047857]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#0F172A] truncate">
            Welcome back, {displayName}
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            {user.role === 'super_admin' ? 'Super Admin' : 'Admin'} ·{' '}
            {settings.companyName} · {todayLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <PhoneCall className="w-3.5 h-3.5 text-[#059669]" />
            <span>Open Lead CRM</span>
          </button>
          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Unified Pipeline KPI Strip */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Lead Pipeline Summary
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>Full Analytics</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px bg-[#E2E8F0]">
          {pipelineStats.map((stat) => (
            <div key={stat.label} className="bg-white px-4 py-4 sm:px-5">
              <div className="text-xs font-medium text-[#64748B] whitespace-nowrap">
                {stat.label}
              </div>
              <div
                className={`mt-1.5 font-mono-tabular text-2xl font-bold leading-none ${stat.valueClass}`}
              >
                {stat.value}
              </div>
              <div className="mt-2 text-[11px] text-[#94A3B8] whitespace-nowrap">
                {stat.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Recent Active Leads */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Recent Active Leads
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>Manage All Leads</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {leadSummary.recentLeads.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#64748B]">
            No leads recorded yet in your active pipeline.
          </div>
        ) : (
          <>
            {/* Mobile Stacked List */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {leadSummary.recentLeads.map((lead) => {
                const meta = LEAD_STATUS_META[lead.status];
                return (
                  <div key={lead.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-[11px] font-semibold text-[#64748B] whitespace-nowrap">
                            {lead.leadCode}
                          </span>
                          <span className="text-sm font-semibold text-[#0F172A] truncate">
                            {lead.name}
                          </span>
                        </div>
                        <div className="text-xs font-mono-tabular text-[#475569] mt-0.5">
                          {lead.phone}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLead ? onOpenLead(lead.id) : onNavigate('leads')
                        }
                        className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Open Log
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748B]">
                      <span className={`font-semibold ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        Follow-up: {formatLeadDisplayDate(lead.followUpDate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Crisp Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                    <th className="py-2.5 px-5 whitespace-nowrap">Lead ID</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Contact</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Source</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Follow-up</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Lead Owner</th>
                    <th className="py-2.5 px-5 text-right whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {leadSummary.recentLeads.map((lead) => {
                    const meta = LEAD_STATUS_META[lead.status];
                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-[#F8FAFC] transition-colors"
                      >
                        <td className="py-3 px-5 font-mono-tabular text-xs font-semibold text-[#334155] whitespace-nowrap">
                          {lead.leadCode}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-[#0F172A] max-w-[200px] truncate">
                            {lead.name}
                          </div>
                          <div className="text-xs font-mono-tabular text-[#64748B]">
                            {lead.phone}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-xs font-semibold ${meta.textClass}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569] whitespace-nowrap">
                          {LEAD_SOURCE_LABELS[lead.source]}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono-tabular text-[#475569] whitespace-nowrap">
                          {formatLeadDisplayDate(lead.followUpDate)}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569] whitespace-nowrap">
                          <span className="inline-block max-w-[160px] truncate align-bottom">
                            {lead.ownerName}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenLead ? onOpenLead(lead.id) : onNavigate('leads')
                            }
                            className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                          >
                            Open Log
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Section 3: Product & Pricing Catalog Summary */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Product &amp; Pricing Catalog Summary
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>
              {user.role === 'super_admin' ? 'Manage All Plans' : 'View All Plans'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-[#E2E8F0]">
          <div className="bg-white px-5 py-4">
            <div className="text-xs font-medium text-[#64748B]">Hosting Plans</div>
            <div className="mt-2 flex items-baseline gap-6">
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#059669]">
                  {catalogSummary.activePlans}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Active</div>
              </div>
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#DC2626]">
                  {inactivePlans}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Inactive</div>
              </div>
            </div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-medium text-[#64748B]">
              Categories &amp; Tenures
            </div>
            <div className="mt-2 flex items-baseline gap-6">
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#2563EB]">
                  {catalogSummary.categoriesCount}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Categories</div>
              </div>
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#0F172A]">
                  6
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Cycles</div>
              </div>
            </div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-medium text-[#64748B]">Last Import</div>
            <div className="mt-2 flex items-baseline gap-6">
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#2563EB]">
                  {lastUpload ? lastUpload.newPlansImported : 0}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Added</div>
              </div>
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#059669]">
                  {lastUpload ? lastUpload.existingPlansUpdated : 0}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">Updated</div>
              </div>
            </div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-medium text-[#64748B]">
              Tax &amp; Currency
            </div>
            <div className="mt-2 flex items-baseline gap-6">
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#0F172A]">
                  {settings.defaultTaxRate}%
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">GST</div>
              </div>
              <div>
                <div className="font-mono-tabular text-2xl font-bold leading-none text-[#059669]">
                  {settings.currencyCode}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1.5">
                  {settings.currencySymbol}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recently Updated Plans + Price Changes Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <section className="xl:col-span-8 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Recently Updated Plans
            </h2>
            <span className="text-xs text-[#64748B] font-mono-tabular">
              {catalogSummary.totalPlans} total
            </span>
          </div>

          {catalogSummary.recentPlans.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#64748B]">
              No hosting plans in the database yet. Upload an Excel workbook to populate plans.
            </div>
          ) : (
            <>
              {/* Mobile Stacked Plan Rows */}
              <div className="md:hidden divide-y divide-[#E2E8F0]">
                {catalogSummary.recentPlans.map((plan) => {
                  const m = plan.pricing.find(
                    (p) => p.billingCycle === 'monthly'
                  );
                  const a = plan.pricing.find(
                    (p) => p.billingCycle === 'annually'
                  );
                  const mVal =
                    m?.currentPrice ??
                    m?.discountedPrice ??
                    m?.totalPrice ??
                    null;
                  const aVal =
                    a?.currentPrice ??
                    a?.discountedPrice ??
                    a?.totalPrice ??
                    null;
                  return (
                    <div key={plan.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[#0F172A] truncate">
                            {plan.name}
                          </div>
                          <div className="text-xs text-[#64748B]">
                            {plan.categoryName}
                            {plan.series ? ` · ${plan.series}` : ''}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            plan.isActive ? 'text-[#059669]' : 'text-[#DC2626]'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="font-mono-tabular text-[#334155]">
                          <span>
                            Mo:{' '}
                            {mVal !== null && mVal > 0
                              ? formatCurrencyValue(
                                  mVal,
                                  settings.currencySymbol,
                                  settings.currencyCode
                                )
                              : '—'}
                          </span>
                          <span className="mx-2 text-[#CBD5E1]">|</span>
                          <span>
                            Yr:{' '}
                            {aVal !== null && aVal > 0
                              ? formatCurrencyValue(
                                  aVal,
                                  settings.currencySymbol,
                                  settings.currencyCode
                                )
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => onViewPlan(plan)}
                            className="font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
                          >
                            View
                          </button>
                          {user.role === 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => onEditPlan(plan)}
                              className="font-semibold text-[#059669] hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop & Tablet Plans Table */}
              <div className="hidden md:block overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                      <th className="py-2.5 px-5 whitespace-nowrap">Plan Name</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Category</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">
                        Monthly
                      </th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">
                        Annually
                      </th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                      <th className="py-2.5 px-5 text-right whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {catalogSummary.recentPlans.map((plan) => {
                      const m = plan.pricing.find(
                        (p) => p.billingCycle === 'monthly'
                      );
                      const a = plan.pricing.find(
                        (p) => p.billingCycle === 'annually'
                      );
                      const mVal =
                        m?.currentPrice ??
                        m?.discountedPrice ??
                        m?.totalPrice ??
                        null;
                      const aVal =
                        a?.currentPrice ??
                        a?.discountedPrice ??
                        a?.totalPrice ??
                        null;
                      return (
                        <tr
                          key={plan.id}
                          className="hover:bg-[#F8FAFC] transition-colors"
                        >
                          <td className="py-3 px-5">
                            <div className="font-semibold text-[#0F172A]">
                              {plan.name}
                            </div>
                            {plan.series && (
                              <div className="text-xs text-[#64748B]">
                                {plan.series}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475569] whitespace-nowrap">
                            {plan.categoryName}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A] whitespace-nowrap">
                            {mVal !== null && mVal > 0
                              ? formatCurrencyValue(
                                  mVal,
                                  settings.currencySymbol,
                                  settings.currencyCode
                                )
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A] whitespace-nowrap">
                            {aVal !== null && aVal > 0
                              ? formatCurrencyValue(
                                  aVal,
                                  settings.currencySymbol,
                                  settings.currencyCode
                                )
                              : '—'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                plan.isActive
                                  ? 'text-[#059669]'
                                  : 'text-[#DC2626]'
                              }`}
                            >
                              {plan.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-right space-x-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onViewPlan(plan)}
                              className="text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
                            >
                              View
                            </button>
                            {user.role === 'super_admin' && (
                              <button
                                type="button"
                                onClick={() => onEditPlan(plan)}
                                className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Recent Price Changes
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
            >
              View All
            </button>
          </div>

          {catalogSummary.recentPriceChanges.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748B]">
              No recent price adjustments logged.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] flex-1">
              {catalogSummary.recentPriceChanges.map((item) => (
                <div key={item.id} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#0F172A] truncate">
                      {item.planName}
                    </span>
                    <span className="capitalize text-[#64748B] shrink-0">
                      {item.billingCycle}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono-tabular">
                    <span className="text-[#64748B]">
                      {item.previousPrice !== null
                        ? formatCurrencyValue(
                            item.previousPrice,
                            settings.currencySymbol,
                            settings.currencyCode
                          )
                        : 'New'}{' '}
                      →{' '}
                      <span className="font-semibold text-[#059669]">
                        {item.newPrice !== null
                          ? formatCurrencyValue(
                              item.newPrice,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : 'Removed'}
                      </span>
                    </span>
                    <span className="text-[#64748B] whitespace-nowrap">
                      {new Date(item.changedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
