import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  KeyRound,
  Lock,
  MessageCircle,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Webhook,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiError, apiFetch } from '../../lib/api.ts';
import {
  ALL_LEAD_STATUSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  computeLeadMetrics,
  formatLeadDisplayDate,
  getFollowUpUrgency,
  getTodayIsoDate,
} from '../../shared/leads.ts';
import type {
  LeadColleagueOption,
  LeadInterventionScope,
  LeadItem,
  LeadSource,
  LeadStatus,
  PortalSettings,
} from '../../shared/types.ts';
import { IntervenedByDropdown } from './IntervenedByDropdown.tsx';
import { LeadDetailDrawer } from './LeadDetailDrawer.tsx';
import { LeadFormModal, type LeadFormSubmitPayload } from './LeadFormModal.tsx';
import { LeadImportModal } from './LeadImportModal.tsx';
import {
  LeadAccessLogsModal,
  MySecurityCodeModal,
  UnlockColleagueModal,
} from './LeadSecurityModals.tsx';
import { LeadWebhookModal } from './LeadWebhookModal.tsx';
import { LeadWhatsAppModal } from './LeadWhatsAppModal.tsx';

type FollowUpFilter =
  | 'all'
  | 'due_or_overdue'
  | 'overdue'
  | 'today'
  | 'upcoming';

type SortOption = 'updated' | 'follow_up' | 'lead_date' | 'name';

function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

export function LeadManageView({
  settings,
  onToast,
}: {
  settings: PortalSettings;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const { user, refreshSession } = useAuth();
  const currentUserId = user?.id ?? 0;
  const currentUserName = user?.displayName || user?.username || 'Me';
  const hasSecurityCode = Boolean(user?.hasLeadSecurityCode);

  const [scope, setScope] = useState<LeadInterventionScope>('me');
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [myLeadCount, setMyLeadCount] = useState(0);
  const [colleagues, setColleagues] = useState<LeadColleagueOption[]>([]);

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmRowDeleteId, setConfirmRowDeleteId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadItem | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<LeadItem | null>(null);

  const [securityCodeModalOpen, setSecurityCodeModalOpen] = useState(false);
  const [unlockTargetColleague, setUnlockTargetColleague] =
    useState<LeadColleagueOption | null>(null);
  const [accessLogsOpen, setAccessLogsOpen] = useState(false);

  const loadColleagues = useCallback(async () => {
    try {
      const data = await apiFetch<{
        myLeadCount: number;
        colleagues: LeadColleagueOption[];
      }>('/api/leads/colleagues');
      setMyLeadCount(data.myLeadCount);
      setColleagues(data.colleagues);
      return data;
    } catch {
      return null;
    }
  }, []);

  const loadLeads = useCallback(
    async (opts?: {
      scope?: LeadInterventionScope;
      userId?: number | null;
      logSwitch?: boolean;
    }) => {
      const activeScope = opts?.scope ?? scope;
      const activeUserId = opts?.userId !== undefined ? opts.userId : targetUserId;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ scope: activeScope });
        if (activeScope === 'user' && activeUserId) {
          params.set('userId', String(activeUserId));
        }
        if (opts?.logSwitch) {
          params.set('logSwitch', '1');
        }
        const items = await apiFetch<LeadItem[]>(`/api/leads?${params.toString()}`);
        setLeads(items);
        setSelectedIds([]);
      } catch (err) {
        if (err instanceof ApiError && err.requiresUnlock && err.targetUserId) {
          const refreshed = await loadColleagues();
          const list = refreshed?.colleagues || colleagues;
          const match = list.find((c) => c.id === err.targetUserId) || null;
          if (match) {
            setUnlockTargetColleague(match);
          }
          setScope('me');
          setTargetUserId(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load leads.');
        }
      } finally {
        setLoading(false);
      }
    },
    [scope, targetUserId, loadColleagues, colleagues]
  );

  useEffect(() => {
    loadColleagues();
    loadLeads({ scope: 'me', userId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([loadColleagues(), loadLeads()]);
  }, [loadColleagues, loadLeads]);

  const handleSelectScope = async (
    nextScope: LeadInterventionScope,
    nextUserId: number | null
  ) => {
    setScope(nextScope);
    setTargetUserId(nextUserId);
    await loadLeads({
      scope: nextScope,
      userId: nextUserId,
      logSwitch: nextScope === 'user' && Boolean(nextUserId),
    });
  };

  const handleColleagueUnlocked = async (colleague: LeadColleagueOption) => {
    await loadColleagues();
    setScope('user');
    setTargetUserId(colleague.id);
    await loadLeads({
      scope: 'user',
      userId: colleague.id,
      logSwitch: false,
    });
  };

  const handleLockColleague = async (colleague: LeadColleagueOption) => {
    try {
      await apiFetch('/api/leads/lock', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: colleague.id }),
      });
      await loadColleagues();
      onToast('success', `Locked access to ${colleague.displayName}'s leads.`);
      if (scope === 'user' && targetUserId === colleague.id) {
        setScope('me');
        setTargetUserId(null);
        await loadLeads({ scope: 'me', userId: null });
      } else if (scope === 'any' || scope === 'other') {
        await loadLeads();
      }
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to lock colleague access.'
      );
    }
  };

  const unlockedColleagues = useMemo(
    () => colleagues.filter((c) => c.unlocked),
    [colleagues]
  );

  const activeColleague = useMemo(
    () =>
      scope === 'user' && targetUserId
        ? colleagues.find((c) => c.id === targetUserId) ?? null
        : null,
    [scope, targetUserId, colleagues]
  );

  const defaultOwnerForCreate =
    scope === 'user' && targetUserId ? targetUserId : currentUserId;
  const defaultOwnerNameForCreate =
    scope === 'user' && activeColleague ? activeColleague.displayName : currentUserName;

  const todayStr = getTodayIsoDate();
  const metrics = useMemo(
    () => computeLeadMetrics(leads, todayStr),
    [leads, todayStr]
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) {
        return false;
      }
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) {
        return false;
      }
      if (followUpFilter !== 'all') {
        const urgency = getFollowUpUrgency(
          lead.followUpDate,
          lead.status,
          todayStr
        );
        if (followUpFilter === 'overdue' && urgency !== 'overdue') return false;
        if (followUpFilter === 'today' && urgency !== 'today') return false;
        if (
          followUpFilter === 'due_or_overdue' &&
          urgency !== 'overdue' &&
          urgency !== 'today'
        ) {
          return false;
        }
        if (followUpFilter === 'upcoming' && urgency !== 'upcoming') return false;
      }

      if (q) {
        const haystack = [
          lead.name,
          lead.phone,
          lead.normalizedPhone,
          lead.latestRemark,
          lead.campaignName || '',
          lead.ownerName,
          LEAD_SOURCE_LABELS[lead.source],
          LEAD_STATUS_META[lead.status].label,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...list];
    if (sortBy === 'updated') {
      sorted.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'lead_date') {
      sorted.sort((a, b) => (b.leadDate || '').localeCompare(a.leadDate || ''));
    } else if (sortBy === 'follow_up') {
      sorted.sort((a, b) => {
        const da = a.followUpDate || '9999-12-31';
        const db = b.followUpDate || '9999-12-31';
        return da.localeCompare(db);
      });
    }

    return sorted;
  }, [
    leads,
    searchQuery,
    statusFilter,
    followUpFilter,
    sourceFilter,
    sortBy,
    todayStr,
  ]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedSet.has(l.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredLeads.map((l) => l.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const l of filteredLeads) next.add(l.id);
        return Array.from(next);
      });
    }
  };

  const handleOpenCreate = () => {
    setEditingLead(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (lead: LeadItem) => {
    setEditingLead(lead);
    setFormOpen(true);
  };

  const handleFormSubmit = async (payload: LeadFormSubmitPayload) => {
    setSavingForm(true);
    try {
      if (editingLead) {
        const updated = await apiFetch<LeadItem>(`/api/leads/${editingLead.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setLeads((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        onToast('success', `Updated lead ${updated.name}.`);
      } else {
        const created = await apiFetch<LeadItem>('/api/leads', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const belongsToCurrentScope =
          scope === 'any' ||
          (scope === 'me' && created.ownerUserId === currentUserId) ||
          (scope === 'other' && created.ownerUserId !== currentUserId) ||
          (scope === 'user' && created.ownerUserId === targetUserId);
        if (belongsToCurrentScope) {
          setLeads((prev) => [created, ...prev]);
        }
        await loadColleagues();
        onToast(
          'success',
          `Added lead ${created.name}${
            created.ownerUserId !== currentUserId
              ? ` under ${created.ownerName}`
              : ''
          }.`
        );
      }
      setFormOpen(false);
    } finally {
      setSavingForm(false);
    }
  };

  const handleInlineStatusChange = async (
    lead: LeadItem,
    nextStatus: LeadStatus
  ) => {
    if (lead.status === nextStatus) return;
    const prevStatus = lead.status;
    setLeads((prev) =>
      prev.map((item) =>
        item.id === lead.id ? { ...item, status: nextStatus } : item
      )
    );
    try {
      const updated = await apiFetch<LeadItem>(`/api/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setLeads((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      onToast(
        'success',
        `${lead.name} marked as ${LEAD_STATUS_META[nextStatus].label}.`
      );
    } catch (err) {
      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id ? { ...item, status: prevStatus } : item
        )
      );
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update status.'
      );
    }
  };

  const handleDeleteRow = async (lead: LeadItem) => {
    try {
      await apiFetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      setLeads((prev) => prev.filter((item) => item.id !== lead.id));
      setSelectedIds((prev) => prev.filter((id) => id !== lead.id));
      setConfirmRowDeleteId(null);
      await loadColleagues();
      onToast('success', `Deleted lead ${lead.name}.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete lead.'
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await apiFetch<{ deletedCount: number }>(
        '/api/leads/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds }),
        }
      );
      const removed = new Set(selectedIds);
      setLeads((prev) => prev.filter((item) => !removed.has(item.id)));
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      await loadColleagues();
      onToast('success', `Deleted ${res.deletedCount} selected leads.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Bulk delete failed.'
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const exportRows =
      selectedIds.length > 0
        ? leads.filter((l) => selectedSet.has(l.id))
        : filteredLeads;

    if (exportRows.length === 0) {
      onToast('error', 'No leads available to export.');
      return;
    }

    const header = [
      'Name',
      'Mobile Number',
      'Owner',
      'Status',
      'Latest Call Remark',
      'Call / Lead Date',
      'Follow-up Date',
      'Source',
      'Campaign',
      'Updated By',
    ];

    const csvLines = [
      header.map(sanitizeCsvCell).join(','),
      ...exportRows.map((lead) =>
        [
          lead.name,
          lead.phone,
          lead.ownerName,
          LEAD_STATUS_META[lead.status].label,
          lead.latestRemark,
          lead.leadDate,
          lead.followUpDate || '',
          LEAD_SOURCE_LABELS[lead.source],
          lead.campaignName || '',
          lead.updatedBy,
        ]
          .map(sanitizeCsvCell)
          .join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-crm-${todayStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onToast(
      'success',
      `Exported ${exportRows.length} ${exportRows.length === 1 ? 'lead' : 'leads'} as CSV.`
    );
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    followUpFilter !== 'all' ||
    sourceFilter !== 'all';

  const showOwnerColumn = scope === 'any' || scope === 'other';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header & Top Action Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold text-[#0F172A]">
                Lead Manage
              </h2>
              <span className="text-xs font-mono-tabular text-[#64748B]">
                {filteredLeads.length} of {leads.length} leads
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Manage leads from calls, WhatsApp, website, referrals, or bulk imports
            </p>
          </div>

          <IntervenedByDropdown
            scope={scope}
            targetUserId={targetUserId}
            myLeadCount={myLeadCount}
            currentCount={leads.length}
            colleagues={colleagues}
            onSelectScope={handleSelectScope}
            onRequestUnlock={(colleague) => setUnlockTargetColleague(colleague)}
            onLockColleague={handleLockColleague}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto min-w-0">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Lead</span>
          </button>

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
            <span>Bulk Import</span>
          </button>

          <button
            type="button"
            onClick={() => setSecurityCodeModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              hasSecurityCode
                ? 'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0] hover:bg-[#D1FAE5]'
                : 'text-[#B45309] bg-[#FFFBEB] border-[#FCD34D] hover:bg-[#FEF3C7]'
            }`}
          >
            {hasSecurityCode ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            <span>{hasSecurityCode ? 'Security Code Set' : 'Set Security Code'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAccessLogsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5 text-[#059669]" />
            <span>Access Logs</span>
          </button>

          <button
            type="button"
            onClick={() => setWebhookOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Webhook className="w-3.5 h-3.5 text-[#059669]" />
            <span>Webhook</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0 && selectedIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#059669]" />
            <span>
              {selectedIds.length > 0
                ? `Export CSV (${selectedIds.length})`
                : 'Export CSV'}
            </span>
          </button>

          <button
            type="button"
            onClick={refreshWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#059669]" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Active Intervention Banner */}
      {scope !== 'me' && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#065F46]">
            <UserCheck className="w-4 h-4 text-[#059669] shrink-0" />
            {scope === 'user' && activeColleague ? (
              <span>
                Intervened in <strong>{activeColleague.displayName}&rsquo;s</strong> leads ·
                Every view and update is recorded with a timestamp
              </span>
            ) : scope === 'any' ? (
              <span>
                Showing <strong>your leads</strong> combined with{' '}
                <strong>{unlockedColleagues.length}</strong> unlocked{' '}
                {unlockedColleagues.length === 1 ? 'teammate' : 'teammates'}
              </span>
            ) : (
              <span>
                Showing leads from <strong>{unlockedColleagues.length}</strong> unlocked{' '}
                {unlockedColleagues.length === 1 ? 'teammate' : 'teammates'} (excluding yours)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {scope === 'user' && activeColleague && (
              <button
                type="button"
                onClick={() => handleLockColleague(activeColleague)}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[#B45309] bg-white border border-[#FCD34D] hover:bg-[#FFFBEB] rounded-lg cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>Lock Access</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSelectScope('me', null)}
              className="px-2.5 py-1 font-semibold text-[#065F46] bg-white border border-[#A7F3D0] hover:bg-[#D1FAE5] rounded-lg cursor-pointer"
            >
              Back to My Leads
            </button>
          </div>
        </div>
      )}

      {/* Interactive Status & Follow-Up Alert Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setFollowUpFilter('all');
          }}
          className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
            statusFilter === 'all' && followUpFilter === 'all'
              ? 'bg-white border-[#0F172A] ring-1 ring-[#0F172A]/15'
              : 'bg-white border-[#E2E8F0] hover:border-[#94A3B8]'
          }`}
        >
          <div className="text-[11px] font-medium text-[#64748B]">All Leads</div>
          <div className="mt-1 text-lg font-bold font-mono-tabular text-[#0F172A]">
            {metrics.total}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setFollowUpFilter((prev) => (prev === 'today' ? 'all' : 'today'));
          }}
          className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
            followUpFilter === 'today'
              ? 'bg-[#FFFBEB] border-[#F59E0B] ring-1 ring-[#F59E0B]/30'
              : metrics.todayFollowUps > 0
                ? 'bg-[#FFFBEB]/60 border-[#FCD34D]'
                : 'bg-white border-[#E2E8F0] hover:border-[#FCD34D]'
          }`}
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#B45309]">
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Today</span>
          </div>
          <div className="mt-1 text-lg font-bold font-mono-tabular text-[#B45309]">
            {metrics.todayFollowUps}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setFollowUpFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'));
          }}
          className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
            followUpFilter === 'overdue'
              ? 'bg-[#FEF2F2] border-[#EF4444] ring-1 ring-[#EF4444]/30'
              : metrics.overdueFollowUps > 0
                ? 'bg-[#FEF2F2]/65 border-[#FCA5A5]'
                : 'bg-white border-[#E2E8F0] hover:border-[#FCA5A5]'
          }`}
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#B91C1C]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Overdue</span>
          </div>
          <div className="mt-1 text-lg font-bold font-mono-tabular text-[#B91C1C]">
            {metrics.overdueFollowUps}
          </div>
        </button>

        {ALL_LEAD_STATUSES.map((st) => {
          const meta = LEAD_STATUS_META[st];
          const countValue =
            st === 'positive'
              ? metrics.positive
              : st === 'call_needed'
                ? metrics.callNeeded
                : st === 'deny'
                  ? metrics.deny
                  : st === 'converted'
                    ? metrics.converted
                    : metrics.existingClient;
          const active = statusFilter === st;

          return (
            <button
              key={st}
              type="button"
              onClick={() => {
                setFollowUpFilter('all');
                setStatusFilter((prev) => (prev === st ? 'all' : st));
              }}
              className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? `${meta.cardBgClass} ${meta.cardBorderClass} ring-1 ring-current/20`
                  : `${meta.cardBgClass} border-[#E2E8F0] hover:${meta.cardBorderClass}`
              }`}
            >
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${meta.textClass}`}>
                <span className={`w-2 h-2 rounded-full ${meta.indicatorClass}`} />
                <span className="truncate">{meta.label}</span>
              </div>
              <div className={`mt-1 text-lg font-bold font-mono-tabular ${meta.textClass}`}>
                {countValue}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client name, mobile number, call remark, owner, or campaign..."
            className="w-full pl-10 pr-9 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2.5 w-full lg:w-auto min-w-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
            aria-label="Filter by lead status"
            className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="all">All Statuses</option>
            {ALL_LEAD_STATUSES.map((st) => (
              <option key={st} value={st}>
                {LEAD_STATUS_META[st].label}
              </option>
            ))}
          </select>

          <select
            value={followUpFilter}
            onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)}
            aria-label="Filter by follow-up schedule"
            className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="all">All Follow-ups</option>
            <option value="due_or_overdue">Today &amp; Overdue</option>
            <option value="overdue">Overdue Only</option>
            <option value="today">Follow-up Today</option>
            <option value="upcoming">Upcoming</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | LeadSource)}
            aria-label="Filter by lead source"
            className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="all">All Sources</option>
            {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((src) => (
              <option key={src} value={src}>
                {LEAD_SOURCE_LABELS[src]}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort leads"
            className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="updated">Recent Update</option>
            <option value="follow_up">Follow-up Soonest</option>
            <option value="lead_date">Call Date Newest</option>
            <option value="name">Name (A–Z)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setFollowUpFilter('all');
                setSourceFilter('all');
              }}
              className="col-span-2 sm:col-span-1 justify-self-start px-2.5 py-1.5 text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#065F46]">
            <span className="font-semibold text-[#047857]">
              {selectedIds.length}{' '}
              {selectedIds.length === 1 ? 'lead selected' : 'leads selected'}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="font-semibold text-[#059669] hover:underline cursor-pointer"
            >
              {allFilteredSelected
                ? 'Unselect filtered'
                : `Select all filtered (${filteredLeads.length})`}
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setConfirmBulkDelete(false);
              }}
              className="text-[#475569] hover:text-[#0F172A] hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#065F46] bg-white border border-[#A7F3D0] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {!confirmBulkDelete ? (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#B91C1C] bg-white border border-[#FCA5A5] hover:bg-[#FEF2F2] rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white border border-[#FCA5A5] rounded-lg px-2.5 py-1 text-xs">
                <span className="font-medium text-[#B91C1C]">
                  Delete {selectedIds.length}?
                </span>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                  className="px-2.5 py-1 font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                >
                  {bulkDeleting ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-1.5 py-1 text-[#475569] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* States */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-12 bg-[#F1F5F9] rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            type="button"
            onClick={() => loadLeads()}
            className="mt-4 px-4 py-2 text-xs font-semibold bg-[#17C964] text-[#04120A] rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center space-y-3">
          <h3 className="text-base font-semibold text-[#0F172A]">
            {leads.length === 0
              ? scope === 'other' && unlockedColleagues.length === 0
                ? 'No teammate leads unlocked yet'
                : 'No leads in this view yet'
              : 'No leads match your filters'}
          </h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            {leads.length === 0
              ? scope === 'other' && unlockedColleagues.length === 0
                ? 'Open the Intervened By menu above and select a teammate to enter their security code.'
                : 'Add a lead manually from calls, WhatsApp, website, or referrals, or bulk import a CSV/Excel sheet.'
              : 'Try clearing the search query or switching status and follow-up filters.'}
          </p>
          {leads.length === 0 && scope !== 'other' && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Lead</span>
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
                <span>Import CSV / Excel</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Status-Colored Table */}
          <div className="hidden lg:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 pl-4 pr-2 w-9">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all filtered leads"
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Client</th>
                    {showOwnerColumn && <th className="py-3 px-3">Owner</th>}
                    <th className="py-3 px-3">Mobile Number</th>
                    <th className="py-3 px-3">Lead Status</th>
                    <th className="py-3 px-3">Latest Call Remark</th>
                    <th className="py-3 px-3">Call Date</th>
                    <th className="py-3 px-3">Follow-up Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredLeads.map((lead) => {
                    const meta = LEAD_STATUS_META[lead.status];
                    const urgency = getFollowUpUrgency(
                      lead.followUpDate,
                      lead.status,
                      todayStr
                    );
                    const isDeletingThis = confirmRowDeleteId === lead.id;

                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors ${meta.rowBgClass}`}
                      >
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            aria-label={`Select ${lead.name}`}
                            className="mt-0.5 w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-3 align-top">
                          <button
                            type="button"
                            onClick={() => setDrawerLeadId(lead.id)}
                            className="text-left group cursor-pointer"
                          >
                            <div className="font-semibold text-[#0F172A] group-hover:text-[#059669] group-hover:underline">
                              {lead.name}
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-0.5">
                              {LEAD_SOURCE_LABELS[lead.source]}
                              {lead.campaignName ? ` · ${lead.campaignName}` : ''}
                            </div>
                          </button>
                        </td>

                        {showOwnerColumn && (
                          <td className="py-3.5 px-3 align-top whitespace-nowrap text-xs font-medium text-[#334155]">
                            {lead.ownerUserId === currentUserId
                              ? `${lead.ownerName} (Me)`
                              : lead.ownerName}
                          </td>
                        )}

                        <td className="py-3.5 px-3 align-top whitespace-nowrap">
                          <a
                            href={`tel:+${lead.normalizedPhone}`}
                            className="inline-flex items-center gap-1.5 text-xs font-mono-tabular font-semibold text-[#0F172A] hover:text-[#059669]"
                          >
                            <Phone className="w-3.5 h-3.5 text-[#64748B]" />
                            <span>{lead.phone}</span>
                          </a>
                        </td>

                        <td className="py-3.5 px-3 align-top whitespace-nowrap">
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              handleInlineStatusChange(
                                lead,
                                e.target.value as LeadStatus
                              )
                            }
                            aria-label={`Status for ${lead.name}`}
                            className={`px-2.5 py-1 text-xs font-semibold border rounded-lg cursor-pointer focus:outline-none ${meta.selectClass}`}
                          >
                            {ALL_LEAD_STATUSES.map((st) => (
                              <option
                                key={st}
                                value={st}
                                className="bg-white text-[#0F172A]"
                              >
                                {LEAD_STATUS_META[st].label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-3 align-top max-w-xs">
                          <button
                            type="button"
                            onClick={() => setDrawerLeadId(lead.id)}
                            className="text-left w-full cursor-pointer group"
                          >
                            <div className="text-xs text-[#1E293B] line-clamp-2 group-hover:text-[#0F172A]">
                              {lead.latestRemark || (
                                <span className="text-[#94A3B8] italic">
                                  No call remark yet — click to log
                                </span>
                              )}
                            </div>
                            {lead.remarksCount > 0 && (
                              <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#059669]">
                                <MessageSquareText className="w-3 h-3" />
                                <span>
                                  {lead.remarksCount}{' '}
                                  {lead.remarksCount === 1 ? 'log' : 'logs'}
                                </span>
                              </div>
                            )}
                          </button>
                        </td>

                        <td className="py-3.5 px-3 align-top whitespace-nowrap text-xs font-mono-tabular text-[#475569]">
                          {formatLeadDisplayDate(lead.leadDate)}
                        </td>

                        <td className="py-3.5 px-3 align-top whitespace-nowrap text-xs font-mono-tabular">
                          {lead.followUpDate ? (
                            <div>
                              <span
                                className={
                                  urgency === 'overdue'
                                    ? 'font-semibold text-[#B91C1C]'
                                    : urgency === 'today'
                                      ? 'font-semibold text-[#B45309]'
                                      : 'text-[#334155]'
                                }
                              >
                                {formatLeadDisplayDate(lead.followUpDate)}
                              </span>
                              {urgency === 'overdue' && (
                                <div className="text-[10px] font-sans font-semibold text-[#DC2626]">
                                  Overdue
                                </div>
                              )}
                              {urgency === 'today' && (
                                <div className="text-[10px] font-sans font-semibold text-[#D97706]">
                                  Due Today
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          {isDeletingThis ? (
                            <div className="inline-flex items-center gap-1.5 bg-white border border-[#FCA5A5] rounded-lg px-2 py-1 text-xs">
                              <span className="text-[#B91C1C] font-medium">
                                Delete?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(lead)}
                                className="px-2 py-0.5 font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRowDeleteId(null)}
                                className="px-1.5 py-0.5 text-[#475569] cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setWhatsAppLead(lead)}
                                title="Send WhatsApp or Plan Quote"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#ECFDF5] rounded-lg cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDrawerLeadId(lead.id)}
                                title="Log call remark & history"
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
                              >
                                Call Log
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(lead)}
                                aria-label={`Edit ${lead.name}`}
                                className="p-1.5 text-[#475569] hover:text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRowDeleteId(lead.id)}
                                aria-label={`Delete ${lead.name}`}
                                className="p-1.5 text-[#B91C1C] hover:bg-[#FEF2F2] bg-white border border-[#FCA5A5] rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile / Tablet Status-Colored Cards */}
          <div className="lg:hidden space-y-3">
            {filteredLeads.map((lead) => {
              const meta = LEAD_STATUS_META[lead.status];
              const urgency = getFollowUpUrgency(
                lead.followUpDate,
                lead.status,
                todayStr
              );
              const isDeletingThis = confirmRowDeleteId === lead.id;

              return (
                <article
                  key={lead.id}
                  className={`rounded-xl p-4 border space-y-3 min-w-0 ${meta.cardBgClass} ${meta.cardBorderClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        aria-label={`Select ${lead.name}`}
                        className="mt-1 w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#64748B] truncate">
                          {LEAD_SOURCE_LABELS[lead.source]}
                          {lead.campaignName ? ` · ${lead.campaignName}` : ''}
                          {showOwnerColumn ? ` · Owner: ${lead.ownerName}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDrawerLeadId(lead.id)}
                          className="text-left text-base font-semibold text-[#0F172A] hover:underline truncate block cursor-pointer"
                        >
                          {lead.name}
                        </button>
                        <a
                          href={`tel:+${lead.normalizedPhone}`}
                          className="inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold text-[#334155] mt-0.5"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{lead.phone}</span>
                        </a>
                      </div>
                    </div>

                    <select
                      value={lead.status}
                      onChange={(e) =>
                        handleInlineStatusChange(lead, e.target.value as LeadStatus)
                      }
                      aria-label={`Status for ${lead.name}`}
                      className={`px-2 py-1 text-xs font-semibold border rounded-lg shrink-0 ${meta.selectClass}`}
                    >
                      {ALL_LEAD_STATUSES.map((st) => (
                        <option key={st} value={st} className="bg-white text-[#0F172A]">
                          {LEAD_STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E8F0] text-xs text-[#1E293B]">
                    {lead.latestRemark || (
                      <span className="text-[#94A3B8] italic">
                        No call remark logged yet
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#475569]">
                    <span>Call: {formatLeadDisplayDate(lead.leadDate)}</span>
                    <span>
                      Follow-up:{' '}
                      <strong
                        className={
                          urgency === 'overdue'
                            ? 'text-[#B91C1C]'
                            : urgency === 'today'
                              ? 'text-[#B45309]'
                              : 'text-[#0F172A]'
                        }
                      >
                        {formatLeadDisplayDate(lead.followUpDate)}
                        {urgency === 'overdue'
                          ? ' (Overdue)'
                          : urgency === 'today'
                            ? ' (Today)'
                            : ''}
                      </strong>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#E2E8F0]/80 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWhatsAppLead(lead)}
                      className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#047857] bg-white border border-[#A7F3D0] rounded-lg cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerLeadId(lead.id)}
                      className="flex-1 min-w-[96px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] rounded-lg cursor-pointer"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>Call Log ({lead.remarksCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(lead)}
                      aria-label={`Edit ${lead.name}`}
                      className="p-2 text-[#334155] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {!isDeletingThis ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRowDeleteId(lead.id)}
                        aria-label={`Delete ${lead.name}`}
                        className="p-2 text-[#B91C1C] bg-white border border-[#FCA5A5] rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(lead)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* Modals & Detail Drawer */}
      <LeadFormModal
        isOpen={formOpen}
        editingLead={editingLead}
        saving={savingForm}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        defaultOwnerUserId={defaultOwnerForCreate}
        unlockedColleagues={unlockedColleagues}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <LeadImportModal
        isOpen={importOpen}
        ownerUserId={defaultOwnerForCreate}
        ownerName={defaultOwnerNameForCreate}
        onClose={() => setImportOpen(false)}
        onImported={refreshWorkspace}
        onToast={onToast}
      />

      <LeadWebhookModal
        isOpen={webhookOpen}
        onClose={() => setWebhookOpen(false)}
        onToast={onToast}
      />

      <LeadDetailDrawer
        leadId={drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
        onEditLead={(lead) => {
          setDrawerLeadId(null);
          handleOpenEdit(lead);
        }}
        onOpenWhatsApp={(lead) => setWhatsAppLead(lead)}
        onLeadUpdated={(updated) => {
          setLeads((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }}
        onLeadDeleted={async (deletedId) => {
          setLeads((prev) => prev.filter((item) => item.id !== deletedId));
          setSelectedIds((prev) => prev.filter((id) => id !== deletedId));
          await loadColleagues();
        }}
        onToast={onToast}
      />

      <LeadWhatsAppModal
        lead={whatsAppLead}
        settings={settings}
        onClose={() => setWhatsAppLead(null)}
        onToast={onToast}
      />

      <MySecurityCodeModal
        isOpen={securityCodeModalOpen}
        hasExistingCode={hasSecurityCode}
        onClose={() => setSecurityCodeModalOpen(false)}
        onSaved={refreshSession}
        onToast={onToast}
      />

      <UnlockColleagueModal
        colleague={unlockTargetColleague}
        onClose={() => setUnlockTargetColleague(null)}
        onUnlocked={handleColleagueUnlocked}
        onToast={onToast}
      />

      <LeadAccessLogsModal
        isOpen={accessLogsOpen}
        onClose={() => setAccessLogsOpen(false)}
      />
    </div>
  );
}
