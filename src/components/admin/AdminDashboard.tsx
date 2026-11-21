import { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  ArrowRight,
  Server,
  Layers,
  UploadCloud,
  ReceiptIndianRupee,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import type {
  HostingPlanFull,
  ImportHistoryItem,
  PortalSettings,
  PortalUser,
} from '../../shared/types.ts';

interface DashboardData {
  totalPlans: number;
  activePlans: number;
  inactivePlans: number;
  lastExcelUpload: ImportHistoryItem | null;
  recentlyUpdatedPlans: HostingPlanFull[];
}

export function AdminDashboard({
  user,
  settings,
  categoriesCount,
  onNavigate,
  onViewPlan,
  onEditPlan,
}: {
  user: PortalUser;
  settings: PortalSettings;
  categoriesCount: number;
  onNavigate: (
    tab:
      | 'dashboard'
      | 'upload'
      | 'plans'
      | 'history'
      | 'users'
      | 'logo'
      | 'settings'
  ) => void;
  onViewPlan: (plan: HostingPlanFull) => void;
  onEditPlan: (plan: HostingPlanFull) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<DashboardData>('/api/dashboard')
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
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
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'HG';

  const formattedTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const formattedDay = now.toLocaleDateString('en-IN', {
    weekday: 'long',
  });

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-10 bg-white border border-[#E2E8F0] rounded-lg w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg h-48" />
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white border border-[#E2E8F0] rounded-lg h-24"
              />
            ))}
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-sm text-red-700">
        {error || 'Unable to load dashboard.'}
      </div>
    );
  }

  const lastUpload = data.lastExcelUpload;

  return (
    <div className="space-y-5">
      {/* Welcome & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          Welcome, {displayName}
        </h1>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-[#0F172A] font-mono-tabular leading-tight">
              {formattedTime}
            </div>
            <div className="text-xs text-[#64748B]">{formattedDay}</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Upload Excel</span>
          </button>
        </div>
      </div>

      {/* Top Grid: Profile / Summary Card (left) + 2x2 KPI Cards (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Profile & Catalog Summary Card */}
        <section className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl flex flex-col justify-between">
          <div className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#14181F] text-[#17C964] font-mono-tabular font-bold text-base flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-[#0F172A] truncate">
                {displayName}
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                {user.role === 'super_admin' ? 'Super Admin' : 'Admin'} ·{' '}
                {settings.companyName}
              </div>
              <div className="text-xs text-[#64748B] truncate mt-0.5 font-mono-tabular">
                {user.email}
              </div>
            </div>
          </div>

          <div className="border-t border-[#E2E8F0] grid grid-cols-3 divide-x divide-[#E2E8F0] bg-[#F8FAFC] rounded-b-xl">
            <div className="px-4 py-3.5">
              <div className="text-xs text-[#64748B]">Total Plans</div>
              <div className="mt-1 font-mono-tabular text-lg font-bold text-[#0F172A]">
                {data.totalPlans}
              </div>
            </div>
            <div className="px-4 py-3.5">
              <div className="text-xs text-[#64748B]">Active</div>
              <div className="mt-1 font-mono-tabular text-lg font-bold text-[#059669]">
                {data.activePlans}
              </div>
            </div>
            <div className="px-4 py-3.5">
              <div className="text-xs text-[#64748B]">Inactive</div>
              <div className="mt-1 font-mono-tabular text-lg font-bold text-[#DC2626]">
                {data.inactivePlans}
              </div>
            </div>
          </div>
        </section>

        {/* Right 2x2 KPI Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#64748B]">Hosting Plans</div>
              <div className="mt-3 flex items-baseline gap-6">
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#2563EB]">
                    {data.activePlans}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Active</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#DC2626]">
                    {data.inactivePlans}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Inactive</div>
                </div>
              </div>
            </div>
            <Server className="w-5 h-5 text-[#94A3B8] shrink-0 mt-1" />
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#64748B]">
                Categories &amp; Terms
              </div>
              <div className="mt-3 flex items-baseline gap-6">
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#2563EB]">
                    {categoriesCount}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Categories</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#059669]">
                    6
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Tenures</div>
                </div>
              </div>
            </div>
            <Layers className="w-5 h-5 text-[#94A3B8] shrink-0 mt-1" />
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#64748B]">
                Last Upload
              </div>
              <div className="mt-3 flex items-baseline gap-6">
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#2563EB]">
                    {lastUpload ? lastUpload.newPlansImported : 0}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Added</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#059669]">
                    {lastUpload ? lastUpload.existingPlansUpdated : 0}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">Updated</div>
                </div>
              </div>
            </div>
            <UploadCloud className="w-5 h-5 text-[#94A3B8] shrink-0 mt-1" />
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#64748B]">
                Tax &amp; Currency
              </div>
              <div className="mt-3 flex items-baseline gap-6">
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#0F172A]">
                    {settings.defaultTaxRate}%
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">GST</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#059669]">
                    {settings.currencyCode}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {settings.currencySymbol}
                  </div>
                </div>
              </div>
            </div>
            <ReceiptIndianRupee className="w-5 h-5 text-[#94A3B8] shrink-0 mt-1" />
          </div>
        </div>
      </div>

      {/* Recently Updated Plans Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Recently Updated Plans
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>Manage All Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {data.recentlyUpdatedPlans.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#64748B]">
            No hosting plans in the database yet. Upload an Excel sheet or add a plan in Manage Plans.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Plan Name</th>
                  <th className="py-3 px-4">Series</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Monthly</th>
                  <th className="py-3 px-4 text-right">Annually</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {data.recentlyUpdatedPlans.map((plan) => {
                  const m = plan.pricing.find((p) => p.billingCycle === 'monthly');
                  const a = plan.pricing.find((p) => p.billingCycle === 'annually');
                  const mVal =
                    m?.currentPrice ?? m?.discountedPrice ?? m?.totalPrice ?? null;
                  const aVal =
                    a?.currentPrice ?? a?.discountedPrice ?? a?.totalPrice ?? null;
                  return (
                    <tr key={plan.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-5 font-semibold text-[#0F172A]">
                        {plan.name}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#64748B]">
                        {plan.series || '—'}
                      </td>
                      <td className="py-3 px-4 text-[#475569]">{plan.categoryName}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                        {mVal !== null && mVal > 0
                          ? formatCurrencyValue(
                              mVal,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                        {aVal !== null && aVal > 0
                          ? formatCurrencyValue(
                              aVal,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            plan.isActive ? 'text-[#059669]' : 'text-[#DC2626]'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#64748B] font-mono-tabular whitespace-nowrap">
                        {new Date(plan.updatedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-5 text-right space-x-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onViewPlan(plan)}
                          className="text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditPlan(plan)}
                          className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
