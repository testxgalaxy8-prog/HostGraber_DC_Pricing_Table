import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { PricingHistoryView } from '../admin/PricingHistoryView.tsx';
import type {
  ImportHistoryItem,
  LeadAccessLogItem,
  PortalSettings,
} from '../../shared/types.ts';

export type LogsCenterTab = 'access' | 'imports' | 'pricing';

export function LogsCenterView({
  settings,
  initialTab = 'access',
  onToast,
}: {
  settings: PortalSettings;
  initialTab?: LogsCenterTab;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [subTab, setSubTab] = useState<LogsCenterTab>(initialTab);
  const [accessLogs, setAccessLogs] = useState<LeadAccessLogItem[]>([]);
  const [imports, setImports] = useState<ImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [aLogs, iRows] = await Promise.all([
        apiFetch<LeadAccessLogItem[]>('/api/leads/access-logs'),
        apiFetch<ImportHistoryItem[]>('/api/imports'),
      ]);
      setAccessLogs(aLogs);
      setImports(iRows);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load logs.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredAccessLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accessLogs.filter((log) => {
      if (actionFilter === 'unlocks') {
        if (
          !log.action.includes('unlock') &&
          !log.action.includes('view')
        ) {
          return false;
        }
      } else if (actionFilter === 'edits') {
        if (
          log.action.includes('unlock') ||
          log.action.includes('view')
        ) {
          return false;
        }
      }
      if (!q) return true;
      return `${log.viewerName} ${log.targetName} ${log.action} ${log.details || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [accessLogs, search, actionFilter]);

  const filteredImports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return imports;
    return imports.filter((imp) =>
      `${imp.originalFilename} ${imp.uploadedBy} ${imp.importMode} ${imp.worksheetNames.join(' ')}`
        .toLowerCase()
        .includes(q)
    );
  }, [imports, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Audit &amp; Activity Logs
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Lead access, Excel imports &amp; pricing changes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('access')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'access'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Lead Access Logs</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('imports')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'imports'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel Import History</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('pricing')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'pricing'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Plan &amp; Pricing Logs</span>
            </button>
          </div>
        </div>
      </div>

      {subTab === 'pricing' ? (
        <PricingHistoryView settings={settings} onToast={onToast} />
      ) : (
        <>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  subTab === 'access'
                    ? 'Filter by team member, action, or details...'
                    : 'Filter by Excel file name or uploader...'
                }
                className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <div className="flex items-center gap-2">
              {subTab === 'access' && (
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                >
                  <option value="all">All Events</option>
                  <option value="unlocks">Unlocks &amp; View Switches</option>
                  <option value="edits">Edits, Calls &amp; Deletes</option>
                </select>
              )}
              <button
                type="button"
                onClick={loadLogs}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-[#64748B]">
                Loading logs...
              </div>
            ) : subTab === 'access' ? (
              filteredAccessLogs.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#64748B]">
                  No lead access audit records match your filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold text-[#64748B]">
                        <th className="py-3 px-5">Timestamp</th>
                        <th className="py-3 px-4">Viewer</th>
                        <th className="py-3 px-4">Target Owner</th>
                        <th className="py-3 px-4">Event</th>
                        <th className="py-3 px-5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredAccessLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-5 font-mono-tabular text-[#64748B] whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#0F172A]">
                            {log.viewerName}
                          </td>
                          <td className="py-3 px-4 text-[#334155]">
                            {log.targetName}
                          </td>
                          <td className="py-3 px-4 font-medium text-[#059669]">
                            {log.action.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-5 text-[#475569]">
                            {log.details || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : filteredImports.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#64748B]">
                No Excel import history found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold text-[#64748B]">
                      <th className="py-3 px-5">Workbook</th>
                      <th className="py-3 px-4">Uploaded By</th>
                      <th className="py-3 px-4">Mode</th>
                      <th className="py-3 px-4 text-right">Detected</th>
                      <th className="py-3 px-4 text-right">Added / Updated</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredImports.map((imp) => (
                      <tr key={imp.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-5">
                          <div className="font-semibold text-[#0F172A]">
                            {imp.originalFilename}
                          </div>
                          {imp.worksheetNames.length > 0 && (
                            <div className="text-[11px] text-[#64748B]">
                              Sheets: {imp.worksheetNames.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#334155]">
                          <div>{imp.uploadedBy}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {imp.uploadedByEmail}
                          </div>
                        </td>
                        <td className="py-3 px-4 capitalize text-[#475569]">
                          {imp.importMode.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          {imp.totalPlansDetected}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          <span className="text-[#059669] font-semibold">
                            +{imp.newPlansImported}
                          </span>{' '}
                          / {imp.existingPlansUpdated}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold capitalize ${
                              imp.status === 'failed'
                                ? 'text-[#DC2626]'
                                : 'text-[#059669]'
                            }`}
                          >
                            {imp.status}
                          </span>
                        </td>
                        <td className="py-3 px-5 font-mono-tabular text-[#64748B] whitespace-nowrap">
                          {new Date(imp.createdAt).toLocaleString('en-IN', {
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
