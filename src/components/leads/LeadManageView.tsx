import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CalendarPlus,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  Lock,
  MessageCircle,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiError, apiFetch } from '../../lib/api.ts';
import {
  exportLeadsFile,
  type LeadExportFormat,
  type LeadExportSelection,
} from '../../lib/leadExport.ts';
import {
  ALL_LEAD_STATUSES,
  LEAD_FORM_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  LEAD_TYPE_LABELS,
  SUMMARY_STATUS_CARDS,
  computeLeadMetrics,
  formatLeadDisplayDate,
  formatLeadDisplayTime,
  getFollowUpUrgency,
  getReminderTimingStatus,
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
import {
  FollowUpFilterPopover,
  type FollowUpFilter,
} from './FollowUpFilterPopover.tsx';
import { IntervenedByDropdown } from './IntervenedByDropdown.tsx';
import { LeadDetailDrawer } from './LeadDetailDrawer.tsx';
import { LeadExportMenu } from './LeadExportMenu.tsx';
import { LeadFormModal, type LeadFormSubmitPayload } from './LeadFormModal.tsx';
import { LeadImportModal } from './LeadImportModal.tsx';
import { UnlockColleagueModal } from './LeadSecurityModals.tsx';
import { LeadTransferModal } from './LeadTransferModal.tsx';
import { LeadWhatsAppModal } from './LeadWhatsAppModal.tsx';

type SortOption =
  | 'updated'
  | 'follow_up'
  | 'lead_date'
  | 'lead_id_asc'
  | 'lead_id_desc'
  | 'name';

export function LeadManageView({
  settings,
  openLeadId = null,
  onOpenedLeadHandled,
  onToast,
}: {
  settings: PortalSettings;
  openLeadId?: number | null;
  onOpenedLeadHandled?: () => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? 0;
  const currentUserName = user?.displayName || user?.username || 'Me';
  const isSuperAdmin = user?.role === 'super_admin';

  const [scope, setScope] = useState<LeadInterventionScope>('me');
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [myLeadCount, setMyLeadCount] = useState(0);
  const [watchedLeadCount, setWatchedLeadCount] = useState(0);
  const [colleagues, setColleagues] = useState<LeadColleagueOption[]>([]);

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('all');
  const [customFollowUpDate, setCustomFollowUpDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  const todayStr = getTodayIsoDate();
  const [newLeadDate, setNewLeadDate] = useState(todayStr);
  const [newLeadDateFilterActive, setNewLeadDateFilterActive] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmRowDeleteId, setConfirmRowDeleteId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadItem | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<LeadItem | null>(null);

  const [unlockTargetColleague, setUnlockTargetColleague] =
    useState<LeadColleagueOption | null>(null);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferLeadsSubset, setTransferLeadsSubset] = useState<LeadItem[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadColleagues = useCallback(async () => {
    try {
      const data = await apiFetch<{
        myLeadCount: number;
        watchedLeadCount?: number;
        colleagues: LeadColleagueOption[];
      }>('/api/leads/colleagues');
      setMyLeadCount(data.myLeadCount);
      setWatchedLeadCount(data.watchedLeadCount ?? 0);
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

  useEffect(() => {
    if (openLeadId) {
      setDrawerLeadId(openLeadId);
      onOpenedLeadHandled?.();
    }
  }, [openLeadId, onOpenedLeadHandled]);

  const hasTimedReminders = useMemo(
    () => leads.some((l) => Boolean(l.followUpDate && l.followUpTime)),
    [leads]
  );

  useEffect(() => {
    if (!hasTimedReminders) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasTimedReminders]);

  useEffect(() => {
    const onReminderUpdated = (event: Event) => {
      const custom = event as CustomEvent<LeadItem | undefined>;
      if (custom.detail && custom.detail.id) {
        const updated = custom.detail;
        setLeads((prev) =>
          prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
        );
      }
    };
    window.addEventListener('hg-reminder-updated', onReminderUpdated);
    return () => window.removeEventListener('hg-reminder-updated', onReminderUpdated);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([loadColleagues(), loadLeads()]);
    window.dispatchEvent(new Event('hg-leads-changed'));
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

  const metrics = useMemo(
    () => computeLeadMetrics(leads, todayStr, newLeadDate),
    [leads, todayStr, newLeadDate]
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = leads.filter((lead) => {
      if (newLeadDateFilterActive && lead.leadDate !== newLeadDate) {
        return false;
      }
      if (statusFilter !== 'all' && lead.status !== statusFilter) {
        return false;
      }
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) {
        return false;
      }
      if (followUpFilter !== 'all') {
        if (followUpFilter === 'custom_date') {
          if (customFollowUpDate && lead.followUpDate !== customFollowUpDate) {
            return false;
          }
        } else {
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
      }

      if (q) {
        const haystack = [
          lead.leadCode,
          lead.name,
          lead.phone,
          lead.normalizedPhone,
          lead.email || '',
          LEAD_TYPE_LABELS[lead.leadType],
          lead.latestRemark,
          lead.campaignName || '',
          lead.ownerName,
          lead.watcherNames.join(' '),
          LEAD_SOURCE_LABELS[lead.source],
          LEAD_STATUS_META[lead.status]?.label || lead.status,
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
    } else if (sortBy === 'lead_id_asc') {
      sorted.sort((a, b) => a.leadCode.localeCompare(b.leadCode, undefined, { numeric: true }));
    } else if (sortBy === 'lead_id_desc') {
      sorted.sort((a, b) => b.leadCode.localeCompare(a.leadCode, undefined, { numeric: true }));
    } else if (sortBy === 'lead_date') {
      sorted.sort((a, b) => (b.leadDate || '').localeCompare(a.leadDate || ''));
    } else if (sortBy === 'follow_up') {
      sorted.sort((a, b) => {
        const da = `${a.followUpDate || '9999-12-31'} ${a.followUpTime || '23:59'}`;
        const db = `${b.followUpDate || '9999-12-31'} ${b.followUpTime || '23:59'}`;
        return da.localeCompare(db);
      });
    }

    return sorted;
  }, [
    leads,
    searchQuery,
    statusFilter,
    followUpFilter,
    customFollowUpDate,
    sourceFilter,
    sortBy,
    todayStr,
    newLeadDate,
    newLeadDateFilterActive,
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

  const openTransferModal = (subset: LeadItem[]) => {
    setTransferLeadsSubset(subset);
    setTransferModalOpen(true);
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
        await loadColleagues();
        onToast('success', `Updated lead ${updated.leadCode} · ${updated.name}.`);
      } else {
        const created = await apiFetch<LeadItem>('/api/leads', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const belongsToCurrentScope =
          scope === 'any' ||
          (scope === 'me' && created.ownerUserId === currentUserId) ||
          (scope === 'other' && created.ownerUserId !== currentUserId) ||
          (scope === 'watched' && created.watcherUserIds.includes(currentUserId)) ||
          (scope === 'user' && created.ownerUserId === targetUserId);
        if (belongsToCurrentScope) {
          setLeads((prev) => [created, ...prev]);
        }
        await loadColleagues();
        onToast(
          'success',
          `Added lead ${created.leadCode} · ${created.name}${
            created.ownerUserId !== currentUserId
              ? ` under ${created.ownerName}`
              : ''
          }.`
        );
      }
      setFormOpen(false);
      window.dispatchEvent(new Event('hg-leads-changed'));
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
      window.dispatchEvent(new Event('hg-leads-changed'));
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
      window.dispatchEvent(new Event('hg-leads-changed'));
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
      window.dispatchEvent(new Event('hg-leads-changed'));
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

  const handleExportLeads = (
    selection: LeadExportSelection,
    format: LeadExportFormat
  ) => {
    const exportRows =
      selection === 'selected'
        ? leads.filter((l) => selectedSet.has(l.id))
        : selection === 'filtered'
          ? filteredLeads
          : leads;

    if (exportRows.length === 0) {
      onToast(
        'error',
        selection === 'selected'
          ? 'Select at least one lead checkbox to export.'
          : 'No leads available to export.'
      );
      return;
    }

    const scopeLabel =
      scope === 'me'
        ? `Lead Owner: Me (${currentUserName})`
        : scope === 'any'
          ? 'Lead Owner: Any (Me + Unlocked Teammates)'
          : scope === 'other'
            ? 'Lead Owner: Other (Unlocked Teammates)'
            : scope === 'watched'
              ? `Watched by Me (${currentUserName})`
              : `Lead Owner: ${activeColleague?.displayName || 'Teammate'}`;

    exportLeadsFile({
      leads: exportRows,
      selection,
      format,
      scopeLabel,
      exportedBy: currentUserName,
      companyName: settings.companyName,
    });

    onToast(
      'success',
      `Exported ${exportRows.length} ${exportRows.length === 1 ? 'lead' : 'leads'} as ${
        format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'
      }.`
    );
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    followUpFilter !== 'all' ||
    Boolean(customFollowUpDate) ||
    sourceFilter !== 'all' ||
    newLeadDateFilterActive;

  const showOwnerColumn =
    isSuperAdmin || scope === 'any' || scope === 'other' || scope === 'watched';
  const showWatcherColumn = isSuperAdmin;

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      {/* Header & Workspace Action Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-xl font-semibold text-[#0F172A]">
                Lead Management
              </h2>
              <span className="text-xs font-mono-tabular text-[#64748B]">
                {filteredLeads.length} of {leads.length} leads
              </span>
              <span className="text-xs text-[#64748B]">
                ·{' '}
                {isSuperAdmin ? (
                  <span className="font-medium text-[#047857]">Super Admin</span>
                ) : (
                  'Admin'
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <IntervenedByDropdown
              scope={scope}
              targetUserId={targetUserId}
              myLeadCount={myLeadCount}
              watchedLeadCount={watchedLeadCount}
              currentCount={leads.length}
              colleagues={colleagues}
              onSelectScope={handleSelectScope}
              onRequestUnlock={(colleague) => setUnlockTargetColleague(colleague)}
              onLockColleague={handleLockColleague}
            />

            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Lead</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
              <span>Bulk Import</span>
            </button>

            <LeadExportMenu
              allCount={leads.length}
              filteredCount={filteredLeads.length}
              selectedCount={selectedIds.length}
              onExport={handleExportLeads}
            />

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => openTransferModal([])}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer Leads</span>
              </button>
            )}
          </div>

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

      {/* Active Owner / Watcher Scope Banner */}
      {scope !== 'me' && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#065F46]">
            <UserCheck className="w-4 h-4 text-[#059669] shrink-0" />
            {scope === 'user' && activeColleague ? (
              <span>
                Viewing <strong>{activeColleague.displayName}&rsquo;s</strong> owned leads ·
                Every view and update is recorded with a timestamp
              </span>
            ) : scope === 'watched' ? (
              <span>
                Showing leads where <strong>{currentUserName}</strong> is assigned as a Lead Watcher
              </span>
            ) : scope === 'any' ? (
              <span>
                Showing <strong>your leads</strong> combined with watched &amp; unlocked leads
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

      {/* Pipeline Metrics Strip & Status Filter Bar */}
      <div className="space-y-3">
        <div className="border border-[#E2E8F0] rounded-xl overflow-hidden grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E2E8F0]">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setFollowUpFilter('all');
              setCustomFollowUpDate('');
              setNewLeadDateFilterActive(false);
            }}
            className={`text-left px-4 py-3.5 transition-colors cursor-pointer ${
              statusFilter === 'all' &&
              followUpFilter === 'all' &&
              !newLeadDateFilterActive
                ? 'bg-[#F8FAFC]'
                : 'bg-white hover:bg-[#F8FAFC]'
            }`}
          >
            <div className="text-xs font-medium text-[#64748B] whitespace-nowrap">
              Total Leads
            </div>
            <div className="mt-1.5 text-xl font-bold font-mono-tabular leading-none text-[#0F172A]">
              {metrics.total}
            </div>
          </button>

          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setStatusFilter('all');
              setFollowUpFilter('all');
              setCustomFollowUpDate('');
              setNewLeadDateFilterActive((prev) => !prev);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStatusFilter('all');
                setFollowUpFilter('all');
                setCustomFollowUpDate('');
                setNewLeadDateFilterActive((prev) => !prev);
              }
            }}
            className={`text-left px-4 py-3.5 transition-colors cursor-pointer ${
              newLeadDateFilterActive
                ? 'bg-[#ECFDF5]'
                : 'bg-white hover:bg-[#F8FAFC]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#047857] min-w-0">
                <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">New Leads</span>
              </div>
              <input
                type="date"
                value={newLeadDate}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value || todayStr;
                  setNewLeadDate(val);
                  setNewLeadDateFilterActive(true);
                }}
                aria-label="Filter New Leads by date"
                className="px-1.5 py-0.5 text-[11px] font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#0F172A] focus:outline-none focus:border-[#17C964] shrink-0"
              />
            </div>
            <div className="mt-1.5 text-xl font-bold font-mono-tabular leading-none text-[#047857]">
              {metrics.newLeadsOnDate}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setCustomFollowUpDate('');
              setNewLeadDateFilterActive(false);
              setFollowUpFilter((prev) => (prev === 'today' ? 'all' : 'today'));
            }}
            className={`text-left px-4 py-3.5 transition-colors cursor-pointer ${
              followUpFilter === 'today'
                ? 'bg-[#FFFBEB]'
                : 'bg-white hover:bg-[#F8FAFC]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              <span>Follow-ups Due</span>
            </div>
            <div className="mt-1.5 text-xl font-bold font-mono-tabular leading-none text-[#B45309]">
              {metrics.todayFollowUps}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setCustomFollowUpDate('');
              setNewLeadDateFilterActive(false);
              setFollowUpFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'));
            }}
            className={`text-left px-4 py-3.5 transition-colors cursor-pointer ${
              followUpFilter === 'overdue'
                ? 'bg-[#FEF2F2]'
                : 'bg-white hover:bg-[#F8FAFC]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#B91C1C] whitespace-nowrap">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Overdue</span>
            </div>
            <div className="mt-1.5 text-xl font-bold font-mono-tabular leading-none text-[#B91C1C]">
              {metrics.overdueFollowUps}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {SUMMARY_STATUS_CARDS.map((st) => {
            const meta = LEAD_STATUS_META[st];
            const countValue = metrics.statusCounts[st] ?? 0;
            const active = statusFilter === st;

            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setFollowUpFilter('all');
                  setCustomFollowUpDate('');
                  setNewLeadDateFilterActive(false);
                  setStatusFilter((prev) => (prev === st ? 'all' : st));
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? `${meta.cardBgClass} ${meta.cardBorderClass} ${meta.textClass} font-semibold`
                    : 'bg-white border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]'
                }`}
              >
                <span>{meta.shortLabel}</span>
                <span
                  className={`font-mono-tabular font-semibold ${
                    active ? meta.textClass : 'text-[#0F172A]'
                  }`}
                >
                  {countValue}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 flex flex-col xl:flex-row xl:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Lead ID, contact name, number, email, remark, owner, or watcher..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:flex xl:items-center gap-2 w-full xl:w-auto min-w-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
            aria-label="Filter by lead status"
            className="w-full xl:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="all">Lead Status</option>
            {ALL_LEAD_STATUSES.map((st) => (
              <option key={st} value={st}>
                {LEAD_STATUS_META[st].label}
              </option>
            ))}
          </select>

          <FollowUpFilterPopover
            value={followUpFilter}
            customDate={customFollowUpDate}
            leads={leads}
            onChange={(nextFilter, nextDate) => {
              setFollowUpFilter(nextFilter);
              setCustomFollowUpDate(nextDate);
            }}
          />

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | LeadSource)}
            aria-label="Filter by lead source"
            className="w-full xl:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="all">Lead Source</option>
            {LEAD_FORM_SOURCES.map((src) => (
              <option key={src} value={src}>
                {LEAD_SOURCE_LABELS[src]}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort leads"
            className="w-full xl:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          >
            <option value="updated">Recent Update</option>
            <option value="follow_up">Follow-ups First</option>
            <option value="lead_date">Call Date Newest</option>
            <option value="lead_id_asc">Lead ID (A–Z)</option>
            <option value="lead_id_desc">Lead ID (Z–A)</option>
            <option value="name">Contact Name (A–Z)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setFollowUpFilter('all');
                setCustomFollowUpDate('');
                setSourceFilter('all');
                setNewLeadDateFilterActive(false);
              }}
              className="col-span-2 sm:col-span-4 xl:col-span-1 justify-self-start px-2.5 py-1.5 text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
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
              onClick={() => handleExportLeads('selected', 'xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportLeads('selected', 'csv')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#065F46] bg-white border border-[#A7F3D0] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() =>
                  openTransferModal(leads.filter((l) => selectedSet.has(l.id)))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#D1FAE5]/50 rounded-lg cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer ({selectedIds.length})</span>
              </button>
            )}

            {isSuperAdmin &&
              (!confirmBulkDelete ? (
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
              ))}
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
                ? 'Open the Lead Owner menu above and select a teammate to enter their security code.'
                : 'Add a lead manually from calls, WhatsApp, website, or referrals, or bulk import a CSV/Excel sheet.'
              : 'Try clearing the search query or switching status and follow-up filters.'}
          </p>
          {leads.length === 0 && scope !== 'other' && scope !== 'watched' && (
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
          <div className="hidden xl:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                    <th className="py-2.5 pl-3 pr-1 w-7">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all filtered leads"
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Lead ID</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Contact Name</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Contact Number</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Lead Status</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Latest Call Remark</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Call Date</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Follow-up Date</th>
                    {showOwnerColumn && (
                      <th className="py-2.5 px-2 whitespace-nowrap">Lead Owner</th>
                    )}
                    {showWatcherColumn && (
                      <th className="py-2.5 px-2 whitespace-nowrap">Lead Watcher</th>
                    )}
                    <th className="py-2.5 pl-1.5 pr-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredLeads.map((lead) => {
                    const meta = LEAD_STATUS_META[lead.status] || LEAD_STATUS_META.new_lead;
                    const urgency = getFollowUpUrgency(
                      lead.followUpDate,
                      lead.status,
                      todayStr
                    );
                    const isDeletingThis = confirmRowDeleteId === lead.id;
                    const isDuplicatePhone =
                      isSuperAdmin && (lead.duplicatePhoneCount ?? 0) > 1;

                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors ${meta.rowBgClass}`}
                      >
                        <td className="py-3 pl-3 pr-1 align-top">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            aria-label={`Select ${lead.name}`}
                            className="mt-0.5 w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                          />
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDrawerLeadId(lead.id)}
                            className="font-mono-tabular text-xs font-semibold text-[#0F172A] hover:text-[#059669] cursor-pointer"
                          >
                            {lead.leadCode}
                          </button>
                        </td>

                        <td className="py-3 px-2 align-top min-w-[130px] max-w-[185px]">
                          <button
                            type="button"
                            onClick={() => setDrawerLeadId(lead.id)}
                            className="text-left w-full group cursor-pointer"
                          >
                            <div className="font-semibold text-[#0F172A] truncate group-hover:text-[#059669] group-hover:underline">
                              {lead.name}
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-0.5 truncate">
                              {LEAD_TYPE_LABELS[lead.leadType]} · {LEAD_SOURCE_LABELS[lead.source]}
                              {lead.campaignName ? ` · ${lead.campaignName}` : ''}
                            </div>
                          </button>
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap">
                          <a
                            href={`tel:+${lead.normalizedPhone}`}
                            className={`inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold ${
                              isDuplicatePhone
                                ? 'text-[#B45309] hover:text-[#92400E]'
                                : 'text-[#0F172A] hover:text-[#059669]'
                            }`}
                          >
                            <Phone className="w-3 h-3 text-[#64748B] shrink-0" />
                            <span>{lead.phone}</span>
                          </a>
                          {isDuplicatePhone && (
                            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[#B45309]">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Duplicate ({lead.duplicatePhoneCount}x)</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap">
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              handleInlineStatusChange(
                                lead,
                                e.target.value as LeadStatus
                              )
                            }
                            aria-label={`Status for ${lead.name}`}
                            className={`px-2 py-1 text-xs font-semibold border rounded-lg cursor-pointer focus:outline-none ${meta.selectClass}`}
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

                        <td className="py-3 px-2 align-top min-w-[135px] max-w-[195px]">
                          <button
                            type="button"
                            onClick={() => setDrawerLeadId(lead.id)}
                            className="text-left w-full cursor-pointer group"
                          >
                            <div className="text-xs text-[#1E293B] line-clamp-2 group-hover:text-[#0F172A]">
                              {lead.latestRemark || (
                                <span className="text-[#94A3B8] italic">
                                  No remark yet — click to log
                                </span>
                              )}
                            </div>
                            {lead.remarksCount > 0 && (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#059669]">
                                <MessageSquareText className="w-3 h-3" />
                                <span>
                                  {lead.remarksCount}{' '}
                                  {lead.remarksCount === 1 ? 'log' : 'logs'}
                                </span>
                              </div>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap text-xs font-mono-tabular text-[#334155]">
                          {formatLeadDisplayDate(lead.leadDate)}
                        </td>

                        <td className="py-3 px-2 align-top whitespace-nowrap text-xs font-mono-tabular">
                          {lead.followUpDate ? (() => {
                            const timing = getReminderTimingStatus(lead, nowMs);
                            return (
                              <div className="space-y-0.5">
                                <div
                                  className={
                                    timing.state === 'due' || urgency === 'overdue'
                                      ? 'font-semibold text-[#B91C1C]'
                                      : timing.state === 'imminent' || urgency === 'today'
                                        ? 'font-semibold text-[#B45309]'
                                        : 'text-[#0F172A] font-medium'
                                  }
                                >
                                  {formatLeadDisplayDate(lead.followUpDate)}
                                </div>
                                {lead.followUpTime && (
                                  <div
                                    className={`flex items-center gap-1 text-[10px] font-mono-tabular font-semibold ${
                                      timing.state === 'due'
                                        ? 'text-[#DC2626]'
                                        : timing.state === 'imminent'
                                          ? 'text-[#D97706]'
                                          : timing.state === 'scheduled'
                                            ? 'text-[#059669]'
                                            : 'text-[#64748B]'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>
                                      {formatLeadDisplayTime(lead.followUpTime)}
                                      {timing.state !== 'none' && timing.label
                                        ? ` · ${timing.label}`
                                        : ''}
                                    </span>
                                  </div>
                                )}
                                {!lead.followUpTime && urgency === 'overdue' && (
                                  <div className="text-[10px] font-sans font-semibold text-[#DC2626]">
                                    Overdue
                                  </div>
                                )}
                                {!lead.followUpTime && urgency === 'today' && (
                                  <div className="text-[10px] font-sans font-semibold text-[#D97706]">
                                    Due Today
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>

                        {showOwnerColumn && (
                          <td className="py-3 px-2 align-top whitespace-nowrap text-xs font-medium text-[#334155]">
                            {lead.ownerUserId === currentUserId
                              ? `${lead.ownerName} (Me)`
                              : lead.ownerName}
                          </td>
                        )}

                        {showWatcherColumn && (
                          <td className="py-3 px-2 align-top text-xs text-[#475569] max-w-[150px]">
                            <span className="line-clamp-2">
                              {lead.watcherNames.length > 0
                                ? lead.watcherNames.join(', ')
                                : '—'}
                            </span>
                          </td>
                        )}

                        <td className="py-3 pl-1.5 pr-3 align-top text-right whitespace-nowrap">
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
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setWhatsAppLead(lead)}
                                title="Send WhatsApp or Plan Quote"
                                aria-label={`WhatsApp ${lead.name}`}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#ECFDF5] rounded-lg cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>WhatsApp</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDrawerLeadId(lead.id)}
                                title="Log call remark & history"
                                className="px-2 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
                              >
                                Call Log
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(lead)}
                                title={`Edit ${lead.name}`}
                                aria-label={`Edit ${lead.name}`}
                                className="p-1.5 text-[#475569] hover:text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {isSuperAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openTransferModal([lead])}
                                    title={`Transfer ${lead.name} to another user`}
                                    aria-label={`Transfer ${lead.name}`}
                                    className="p-1.5 text-[#047857] hover:bg-[#ECFDF5] bg-white border border-[#A7F3D0] rounded-lg cursor-pointer"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRowDeleteId(lead.id)}
                                    title={`Delete ${lead.name}`}
                                    aria-label={`Delete ${lead.name}`}
                                    className="p-1.5 text-[#B91C1C] hover:bg-[#FEF2F2] bg-white border border-[#FCA5A5] rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
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
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredLeads.map((lead) => {
              const meta = LEAD_STATUS_META[lead.status] || LEAD_STATUS_META.new_lead;
              const urgency = getFollowUpUrgency(
                lead.followUpDate,
                lead.status,
                todayStr
              );
              const isDeletingThis = confirmRowDeleteId === lead.id;
              const isDuplicatePhone =
                isSuperAdmin && (lead.duplicatePhoneCount ?? 0) > 1;

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
                          <span className="font-mono-tabular font-semibold text-[#0F172A]">
                            {lead.leadCode}
                          </span>{' '}
                          · {LEAD_TYPE_LABELS[lead.leadType]} · {LEAD_SOURCE_LABELS[lead.source]}
                          {lead.campaignName ? ` · ${lead.campaignName}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDrawerLeadId(lead.id)}
                          className="text-left text-base font-semibold text-[#0F172A] hover:underline truncate block cursor-pointer"
                        >
                          {lead.name}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <a
                            href={`tel:+${lead.normalizedPhone}`}
                            className={`inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold ${
                              isDuplicatePhone ? 'text-[#B45309]' : 'text-[#334155]'
                            }`}
                          >
                            <Phone className="w-3 h-3" />
                            <span>{lead.phone}</span>
                          </a>
                          {isDuplicatePhone && (
                            <span className="text-[10px] font-semibold text-[#B45309]">
                              Duplicate ({lead.duplicatePhoneCount}x)
                            </span>
                          )}
                        </div>
                        {(showOwnerColumn || (showWatcherColumn && lead.watcherNames.length > 0)) && (
                          <div className="text-[11px] text-[#475569] mt-1">
                            {showOwnerColumn && <span>Owner: {lead.ownerName}</span>}
                            {showOwnerColumn && showWatcherColumn && lead.watcherNames.length > 0 && ' · '}
                            {showWatcherColumn && lead.watcherNames.length > 0 && (
                              <span>Watchers: {lead.watcherNames.join(', ')}</span>
                            )}
                          </div>
                        )}
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
                      {(() => {
                        const timing = getReminderTimingStatus(lead, nowMs);
                        return (
                          <strong
                            className={
                              timing.state === 'due' || urgency === 'overdue'
                                ? 'text-[#B91C1C]'
                                : timing.state === 'imminent' || urgency === 'today'
                                  ? 'text-[#B45309]'
                                  : 'text-[#0F172A]'
                            }
                          >
                            {formatLeadDisplayDate(lead.followUpDate)}
                            {lead.followUpTime
                              ? ` · ${formatLeadDisplayTime(lead.followUpTime)}`
                              : ''}
                            {timing.state !== 'none' && timing.label
                              ? ` (${timing.label})`
                              : urgency === 'overdue'
                                ? ' (Overdue)'
                                : urgency === 'today'
                                  ? ' (Today)'
                                  : ''}
                          </strong>
                        );
                      })()}
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
                    {isSuperAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => openTransferModal([lead])}
                          aria-label={`Transfer ${lead.name}`}
                          className="p-2 text-[#047857] bg-white border border-[#A7F3D0] rounded-lg cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
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
                      </>
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
        isSuperAdmin={isSuperAdmin}
        saving={savingForm}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        defaultOwnerUserId={defaultOwnerForCreate}
        unlockedColleagues={unlockedColleagues}
        allColleagues={colleagues}
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

      <LeadDetailDrawer
        leadId={drawerLeadId}
        canTransfer={isSuperAdmin}
        canDelete={isSuperAdmin}
        onClose={() => setDrawerLeadId(null)}
        onEditLead={(lead) => {
          setDrawerLeadId(null);
          handleOpenEdit(lead);
        }}
        onTransferLead={(lead) => {
          setDrawerLeadId(null);
          openTransferModal([lead]);
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

      <UnlockColleagueModal
        colleague={unlockTargetColleague}
        onClose={() => setUnlockTargetColleague(null)}
        onUnlocked={handleColleagueUnlocked}
        onToast={onToast}
      />

      {isSuperAdmin && (
        <LeadTransferModal
          isOpen={transferModalOpen}
          initialSelectedLeads={transferLeadsSubset}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          myLeadCount={myLeadCount}
          colleagues={colleagues}
          onClose={() => setTransferModalOpen(false)}
          onTransferred={refreshWorkspace}
          onToast={onToast}
        />
      )}
    </div>
  );
}
