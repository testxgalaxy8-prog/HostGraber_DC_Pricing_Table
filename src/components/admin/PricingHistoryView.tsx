import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import type {
  PlanChangeLogItem,
  PortalSettings,
  PricingHistoryItem,
} from '../../shared/types.ts';

export function PricingHistoryView({
  settings,
  onToast,
}: {
  settings: PortalSettings;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [subTab, setSubTab] = useState<'pricing' | 'changes'>('pricing');
  const [pricingRows, setPricingRows] = useState<PricingHistoryItem[]>([]);
  const [changeRows, setChangeRows] = useState<PlanChangeLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedChangeId, setExpandedChangeId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pHist, cHist] = await Promise.all([
        apiFetch<PricingHistoryItem[]>('/api/history/pricing'),
        apiFetch<PlanChangeLogItem[]>('/api/history/changes'),
      ]);
      setPricingRows(pHist);
      setChangeRows(cHist);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load pricing history.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredPricing = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pricingRows;
    return pricingRows.filter((r) =>
      `${r.planName} ${r.categoryName} ${r.billingCycle} ${r.updatedBy} ${r.sourceFilename || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [pricingRows, search]);

  const filteredChanges = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return changeRows;
    return changeRows.filter((r) =>
      `${r.planName} ${r.changeScope} ${r.summary} ${r.updatedBy} ${r.sourceFilename || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [changeRows, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          Pricing History
        </h1>

        <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('pricing')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'pricing'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Price Changes ({pricingRows.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('changes')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'changes'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Specs &amp; Content Logs ({changeRows.length})
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by plan name, user, or source Excel file..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#64748B]">
            Loading audit history...
          </div>
        ) : subTab === 'pricing' ? (
          filteredPricing.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#64748B]">
              No pricing changes recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Plan</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4 text-right">Previous Price</th>
                    <th className="py-3 px-4 text-right">New Price</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Updated By</th>
                    <th className="py-3 px-5">Change Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPricing.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-5">
                        <div className="font-semibold text-[#0F172A]">{row.planName}</div>
                        <div className="text-xs text-[#64748B]">{row.categoryName}</div>
                      </td>
                      <td className="py-3 px-4 capitalize text-[#475569]">
                        {row.billingCycle}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#64748B]">
                        {row.previousPrice !== null
                          ? formatCurrencyValue(
                              row.previousPrice,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#059669]">
                        {row.newPrice !== null
                          ? formatCurrencyValue(
                              row.newPrice,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : 'Removed'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#475569]">
                        {row.sourceFilename || 'Manual Edit'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#475569]">
                        {row.updatedBy}
                      </td>
                      <td className="py-3 px-5 text-xs text-[#64748B] font-mono-tabular whitespace-nowrap">
                        {new Date(row.changedAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredChanges.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#64748B]">
            No specification or offer change logs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Plan Name</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4">Updated By</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-5 text-right">Compare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredChanges.map((item) => {
                  const isOpen = expandedChangeId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-5 font-semibold text-[#0F172A]">
                          {item.planName}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569] capitalize">
                          {item.changeScope}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569]">
                          {item.summary}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569]">
                          {item.updatedBy}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#64748B] font-mono-tabular whitespace-nowrap">
                          {new Date(item.changedAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedChangeId(isOpen ? null : item.id)
                            }
                            className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                          >
                            {isOpen ? 'Hide Diff' : 'View Diff'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-[#F8FAFC]">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-semibold text-[#334155] mb-1">
                                  Previous Snapshot
                                </div>
                                <pre className="p-3 rounded-lg bg-white border border-[#E2E8F0] font-mono text-[11px] text-[#0F172A] overflow-x-auto max-h-48">
                                  {JSON.stringify(item.previousSnapshot, null, 2) ||
                                    'None'}
                                </pre>
                              </div>
                              <div>
                                <div className="font-semibold text-[#334155] mb-1">
                                  New Snapshot
                                </div>
                                <pre className="p-3 rounded-lg bg-white border border-[#E2E8F0] font-mono text-[11px] text-[#0F172A] overflow-x-auto max-h-48">
                                  {JSON.stringify(item.newSnapshot, null, 2) ||
                                    'None'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
