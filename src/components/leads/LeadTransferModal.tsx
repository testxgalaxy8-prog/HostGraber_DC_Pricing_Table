import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRightLeft, ShieldCheck, Users, X } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import type { LeadColleagueOption, LeadItem } from '../../shared/types.ts';

interface TransferUserOption {
  id: number;
  name: string;
  role: string;
  leadCount: number;
  isMe: boolean;
}

export function LeadTransferModal({
  isOpen,
  initialSelectedLeads,
  currentUserId,
  currentUserName,
  myLeadCount,
  colleagues,
  onClose,
  onTransferred,
  onToast,
}: {
  isOpen: boolean;
  initialSelectedLeads: LeadItem[];
  currentUserId: number;
  currentUserName: string;
  myLeadCount: number;
  colleagues: LeadColleagueOption[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isSpecificLeadsMode = initialSelectedLeads.length > 0;

  const userOptions = useMemo<TransferUserOption[]>(() => {
    const me: TransferUserOption = {
      id: currentUserId,
      name: `${currentUserName} (Me)`,
      role: 'super_admin',
      leadCount: myLeadCount,
      isMe: true,
    };
    const others: TransferUserOption[] = colleagues.map((c) => ({
      id: c.id,
      name: c.displayName,
      role: c.role,
      leadCount: c.leadCount,
      isMe: false,
    }));
    return [me, ...others];
  }, [currentUserId, currentUserName, myLeadCount, colleagues]);

  const [fromUserId, setFromUserId] = useState<number>(0);
  const [targetUserId, setTargetUserId] = useState<number>(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNote('');

    if (isSpecificLeadsMode) {
      const currentOwnerIds = new Set(
        initialSelectedLeads
          .map((l) => l.ownerUserId)
          .filter((id): id is number => Boolean(id))
      );
      const firstDifferentUser = userOptions.find(
        (u) => !currentOwnerIds.has(u.id)
      );
      setFromUserId(0);
      setTargetUserId(firstDifferentUser?.id ?? userOptions[0]?.id ?? 0);
    } else {
      const defaultFrom =
        userOptions.find((u) => !u.isMe && u.leadCount > 0) ??
        userOptions.find((u) => u.leadCount > 0) ??
        userOptions[0];
      const defaultTo =
        userOptions.find((u) => u.id !== defaultFrom?.id) ?? userOptions[0];
      setFromUserId(defaultFrom?.id ?? 0);
      setTargetUserId(defaultTo?.id ?? 0);
    }
  }, [isOpen, isSpecificLeadsMode, initialSelectedLeads, userOptions]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const sourceUser = userOptions.find((u) => u.id === fromUserId);
  const targetUser = userOptions.find((u) => u.id === targetUserId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetUserId) {
      setError('Select the destination team member.');
      return;
    }

    if (!isSpecificLeadsMode) {
      if (!fromUserId) {
        setError('Select the team member whose leads should be transferred.');
        return;
      }
      if (fromUserId === targetUserId) {
        setError('Source and destination users must be different.');
        return;
      }
      if ((sourceUser?.leadCount ?? 0) === 0) {
        setError(`${sourceUser?.name || 'This user'} currently has 0 leads to transfer.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        transferredCount: number;
        targetOwnerName: string;
      }>('/api/leads/transfer', {
        method: 'POST',
        body: JSON.stringify(
          isSpecificLeadsMode
            ? {
                leadIds: initialSelectedLeads.map((l) => l.id),
                targetUserId,
                note: note.trim() || null,
              }
            : {
                fromUserId,
                targetUserId,
                note: note.trim() || null,
              }
        ),
      });

      onToast(
        'success',
        `Transferred ${res.transferredCount} ${
          res.transferredCount === 1 ? 'lead' : 'leads'
        } to ${res.targetOwnerName}.`
      );
      await onTransferred();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to transfer leads.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-transfer-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3
                id="lead-transfer-modal-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                {isSpecificLeadsMode
                  ? `Transfer ${initialSelectedLeads.length} ${
                      initialSelectedLeads.length === 1 ? 'Lead' : 'Leads'
                    }`
                  : 'Transfer Team Leads'}
              </h3>
              <p className="text-xs text-[#64748B]">
                Super Admin Only · Reassign lead ownership with audit log
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
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

          {isSpecificLeadsMode ? (
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <div className="font-semibold text-[#0F172A]">
                Selected Leads ({initialSelectedLeads.length})
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 text-[#475569]">
                {initialSelectedLeads.slice(0, 6).map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium text-[#0F172A]">
                      <span className="font-mono-tabular text-[11px] text-[#64748B] mr-1.5">
                        {lead.leadCode}
                      </span>
                      {lead.name}
                    </span>
                    <span className="text-[11px] text-[#64748B] shrink-0">
                      Owner: {lead.ownerName}
                    </span>
                  </div>
                ))}
                {initialSelectedLeads.length > 6 && (
                  <div className="text-[11px] text-[#64748B]">
                    +{initialSelectedLeads.length - 6} more leads
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-[#334155] mb-1">
                Transfer All Leads From User *
              </label>
              <select
                value={fromUserId}
                onChange={(e) => setFromUserId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              >
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.leadCount} {u.leadCount === 1 ? 'lead' : 'leads'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[#334155] mb-1">
              Transfer To New Owner *
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
            >
              {userOptions
                .filter((u) => isSpecificLeadsMode || u.id !== fromUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.role === 'super_admin' ? 'Super Admin' : 'Admin'} ({u.leadCount} leads)
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#334155] mb-1">
              Transfer Reason / Note (Optional)
            </label>
            <input
              type="text"
              maxLength={160}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Shift handover, workload balance, client follow-up..."
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div className="p-3 rounded-xl bg-[#ECFDF5]/60 border border-[#A7F3D0] text-[#065F46] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
            <span>
              {isSpecificLeadsMode ? (
                <>
                  <strong>{initialSelectedLeads.length}</strong> selected{' '}
                  {initialSelectedLeads.length === 1 ? 'lead' : 'leads'} will be moved to{' '}
                  <strong>{targetUser?.name || 'selected user'}</strong>.
                </>
              ) : (
                <>
                  All{' '}
                  <strong className="font-mono-tabular">
                    {sourceUser?.leadCount ?? 0}
                  </strong>{' '}
                  leads owned by <strong>{sourceUser?.name || 'source user'}</strong> will be
                  reassigned to <strong>{targetUser?.name || 'selected user'}</strong>.
                </>
              )}
            </span>
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (!isSpecificLeadsMode && (sourceUser?.leadCount ?? 0) === 0)}
              className="inline-flex items-center gap-1.5 px-5 py-2 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-55 rounded-lg cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{submitting ? 'Transferring...' : 'Confirm Transfer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
