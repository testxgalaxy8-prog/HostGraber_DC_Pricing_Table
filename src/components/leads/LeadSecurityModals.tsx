import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import type {
  LeadAccessLogItem,
  LeadColleagueOption,
} from '../../shared/types.ts';

export function MySecurityCodeModal({
  isOpen,
  hasExistingCode,
  onClose,
  onSaved,
  onToast,
}: {
  isOpen: boolean;
  hasExistingCode: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setConfirmCode('');
    setShowCode(false);
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (trimmed.length < 4 || trimmed.length > 32) {
      setError('Security code must be between 4 and 32 characters.');
      return;
    }
    if (trimmed !== confirmCode.trim()) {
      setError('Security codes do not match.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/leads/security-code', {
        method: 'POST',
        body: JSON.stringify({ securityCode: trimmed }),
      });
      await onSaved();
      onToast(
        'success',
        hasExistingCode
          ? 'Your Lead Security Code has been updated.'
          : 'Your Lead Security Code is now set.'
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save security code.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-security-code-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3
                id="my-security-code-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                {hasExistingCode ? 'Update My Security Code' : 'Set My Lead Security Code'}
              </h3>
              <p className="text-xs text-[#64748B]">
                Share this code only with teammates you allow to intervene in your leads
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] leading-relaxed">
            Your leads stay private to your account by default. If a colleague selects{' '}
            <strong className="text-[#0F172A]">Lead Owner: Your Name</strong>, they must enter
            this code, and every access is logged with an exact timestamp.
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-[#334155]">
                {hasExistingCode ? 'New Security Code *' : 'Security Code *'}
              </label>
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="inline-flex items-center gap-1 text-[#059669] hover:underline cursor-pointer"
              >
                {showCode ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show</span>
                  </>
                )}
              </button>
            </div>
            <input
              type={showCode ? 'text' : 'password'}
              required
              autoFocus
              minLength={4}
              maxLength={32}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="4–32 characters (e.g. 4829 or team-pass)"
              className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#334155] mb-1">
              Confirm Security Code *
            </label>
            <input
              type={showCode ? 'text' : 'password'}
              required
              minLength={4}
              maxLength={32}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Re-enter security code"
              className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : hasExistingCode ? 'Update Code' : 'Save Security Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UnlockColleagueModal({
  colleague,
  onClose,
  onUnlocked,
  onToast,
}: {
  colleague: LeadColleagueOption | null;
  onClose: () => void;
  onUnlocked: (colleague: LeadColleagueOption) => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [securityCode, setSecurityCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!colleague) return;
    setSecurityCode('');
    setShowCode(false);
    setError(null);
  }, [colleague]);

  useEffect(() => {
    if (!colleague) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !unlocking) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [colleague, unlocking, onClose]);

  if (!colleague) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!securityCode.trim()) {
      setError(`Enter ${colleague.displayName}'s security code.`);
      return;
    }

    setUnlocking(true);
    try {
      await apiFetch('/api/leads/unlock', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: colleague.id,
          securityCode: securityCode.trim(),
        }),
      });
      onToast(
        'success',
        `Unlocked ${colleague.displayName}'s leads for this session. Access logged.`
      );
      await onUnlocked(colleague);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Security code verification failed.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-colleague-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !unlocking) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FFFBEB] border border-[#FCD34D] flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#B45309]" />
            </div>
            <div>
              <h3
                id="unlock-colleague-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                Intervene in {colleague.displayName}&rsquo;s Leads
              </h3>
              <p className="text-xs text-[#64748B]">
                Security code verification required · Timestamped in Access Logs
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={unlocking}
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {!colleague.hasSecurityCode ? (
            <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FCD34D] text-[#92400E] leading-relaxed">
              <strong>{colleague.displayName}</strong> has not configured a Lead Security Code yet.
              Ask them to sign in and set their code using <strong>My Security Code</strong> before
              sharing lead access.
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] leading-relaxed">
              Enter the security code set by{' '}
              <strong className="text-[#0F172A]">{colleague.displayName}</strong> to view and manage
              their{' '}
              <span className="font-mono-tabular font-semibold text-[#0F172A]">
                {colleague.leadCount}
              </span>{' '}
              {colleague.leadCount === 1 ? 'lead' : 'leads'}.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          )}

          {colleague.hasSecurityCode && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-[#334155]">
                  {colleague.displayName}&rsquo;s Security Code *
                </label>
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  className="inline-flex items-center gap-1 text-[#059669] hover:underline cursor-pointer"
                >
                  {showCode ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type={showCode ? 'text' : 'password'}
                required
                autoFocus
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                placeholder={`Ask ${colleague.displayName} for their security code`}
                className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          )}

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={unlocking}
              onClick={onClose}
              className="px-4 py-2 font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            {colleague.hasSecurityCode && (
              <button
                type="submit"
                disabled={unlocking}
                className="inline-flex items-center gap-1.5 px-5 py-2 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{unlocking ? 'Verifying...' : 'Unlock & View Leads'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, { label: string; toneClass: string }> = {
  unlock_success: {
    label: 'Unlocked Leads',
    toneClass: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  },
  unlock_failed: {
    label: 'Failed Code',
    toneClass: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]',
  },
  view_leads: {
    label: 'Viewed Leads',
    toneClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  },
  create_lead: {
    label: 'Added Lead',
    toneClass: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
  },
  update_lead: {
    label: 'Edited Lead',
    toneClass: 'bg-[#FFFBEB] text-[#B45309] border-[#FCD34D]',
  },
  add_remark: {
    label: 'Logged Call',
    toneClass: 'bg-[#F0FDF4] text-[#15803D] border-[#86EFAC]',
  },
  delete_lead: {
    label: 'Deleted Lead',
    toneClass: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]',
  },
  bulk_import: {
    label: 'Bulk Import',
    toneClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  },
  bulk_delete: {
    label: 'Bulk Delete',
    toneClass: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]',
  },
  transfer_lead: {
    label: 'Transferred Lead',
    toneClass: 'bg-[#ECFDF5] text-[#047857] border-[#6EE7B7]',
  },
};

function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function LeadAccessLogsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LeadAccessLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const fetchLogs = () => {
    setLoading(true);
    setError(null);
    apiFetch<LeadAccessLogItem[]>('/api/leads/access-logs')
      .then(setLogs)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to load access logs.')
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setActionFilter('all');
    fetchLogs();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (actionFilter === 'unlocks') {
        if (
          entry.action !== 'unlock_success' &&
          entry.action !== 'unlock_failed' &&
          entry.action !== 'view_leads'
        ) {
          return false;
        }
      } else if (actionFilter === 'changes') {
        if (
          entry.action === 'unlock_success' ||
          entry.action === 'unlock_failed' ||
          entry.action === 'view_leads'
        ) {
          return false;
        }
      }

      if (!q) return true;
      const haystack = [
        entry.viewerName,
        entry.targetName,
        entry.action,
        entry.details || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search, actionFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-access-logs-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <History className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3
                id="lead-access-logs-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                Intervention &amp; Access Timestamp Logs
              </h3>
              <p className="text-xs text-[#64748B]">
                Audit trail whenever a team member unlocks, views, or edits another teammate&rsquo;s leads
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3 border-b border-[#F1F5F9] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by employee name, lead owner, or details..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filter log events"
              className="flex-1 sm:flex-none px-3 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
            >
              <option value="all">All Events</option>
              <option value="unlocks">Unlocks &amp; View Switches</option>
              <option value="changes">Edits, Calls &amp; Deletes</option>
            </select>

            <button
              type="button"
              onClick={fetchLogs}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-lg cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#059669]" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#64748B]">
              Loading timestamp logs...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center space-y-1.5">
              <p className="text-sm font-medium text-[#0F172A]">
                No cross-user intervention logs yet
              </p>
              <p className="text-xs text-[#64748B]">
                When a user unlocks or updates a teammate&rsquo;s leads, the exact timestamp appears here.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Timestamp</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Accessed By</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Lead Owner</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Action</th>
                        <th className="py-2.5 px-3.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filteredLogs.map((entry) => {
                        const meta = ACTION_LABELS[entry.action] || {
                          label: entry.action,
                          toneClass: 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]',
                        };
                        return (
                          <tr key={entry.id} className="hover:bg-[#F8FAFC]/80">
                            <td className="py-2.5 px-3.5 whitespace-nowrap font-mono-tabular text-[11px] text-[#334155]">
                              {formatAuditTimestamp(entry.createdAt)}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-[#0F172A]">
                              {entry.viewerName}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-[#334155]">
                              {entry.targetName}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded-md ${meta.toneClass}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-[#475569]">
                              {entry.details || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="md:hidden space-y-2.5">
                {filteredLogs.map((entry) => {
                  const meta = ACTION_LABELS[entry.action] || {
                    label: entry.action,
                    toneClass: 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]',
                  };
                  return (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded-md ${meta.toneClass}`}
                        >
                          {meta.label}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[#64748B]">
                          {formatAuditTimestamp(entry.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-[#0F172A]">
                        <strong>{entry.viewerName}</strong> →{' '}
                        <span className="text-[#334155]">{entry.targetName}</span>
                      </div>
                      {entry.details && (
                        <div className="text-xs text-[#475569]">{entry.details}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <span>Showing {filteredLogs.length} audit events</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
