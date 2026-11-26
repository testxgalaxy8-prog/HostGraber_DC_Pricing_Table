import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  Edit3,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  ALL_LEAD_STATUSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  formatLeadDisplayDate,
  getFollowUpUrgency,
  getTodayIsoDate,
} from '../../shared/leads.ts';
import type { LeadItem, LeadStatus } from '../../shared/types.ts';

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function LeadDetailDrawer({
  leadId,
  canTransfer = false,
  onClose,
  onEditLead,
  onTransferLead,
  onOpenWhatsApp,
  onLeadUpdated,
  onLeadDeleted,
  onToast,
}: {
  leadId: number | null;
  canTransfer?: boolean;
  onClose: () => void;
  onEditLead: (lead: LeadItem) => void;
  onTransferLead?: (lead: LeadItem) => void;
  onOpenWhatsApp: (lead: LeadItem) => void;
  onLeadUpdated: (lead: LeadItem) => void;
  onLeadDeleted: (leadId: number) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [lead, setLead] = useState<LeadItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [remark, setRemark] = useState('');
  const [statusAtCall, setStatusAtCall] = useState<LeadStatus>('call_needed');
  const [callDate, setCallDate] = useState(getTodayIsoDate());
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      return;
    }
    setConfirmDelete(false);
    setLoading(true);
    apiFetch<LeadItem>(`/api/leads/${leadId}`)
      .then((detail) => {
        setLead(detail);
        setStatusAtCall(detail.status);
        setCallDate(getTodayIsoDate());
        setFollowUpDate(detail.followUpDate || '');
        setRemark('');
      })
      .catch((err) => {
        onToast(
          'error',
          err instanceof Error ? err.message : 'Failed to load lead details.'
        );
        onClose();
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leadId, onClose]);

  if (!leadId) return null;

  const handleAddRemark = async (e: FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    if (!remark.trim()) {
      onToast('error', 'Enter what update you got from the client call.');
      return;
    }
    setSavingRemark(true);
    try {
      const updated = await apiFetch<LeadItem>(`/api/leads/${lead.id}/remarks`, {
        method: 'POST',
        body: JSON.stringify({
          remark: remark.trim(),
          statusAtCall,
          callDate: callDate || getTodayIsoDate(),
          followUpDate: followUpDate.trim() || null,
        }),
      });
      setLead(updated);
      setRemark('');
      onLeadUpdated(updated);
      onToast('success', 'Call remark logged and lead updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to log call remark.'
      );
    } finally {
      setSavingRemark(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      onLeadDeleted(lead.id);
      onToast('success', `Deleted lead ${lead.name}.`);
      onClose();
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete lead.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const meta = lead ? LEAD_STATUS_META[lead.status] : LEAD_STATUS_META.call_needed;
  const urgency = lead
    ? getFollowUpUrgency(lead.followUpDate, lead.status)
    : 'none';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0F172A]/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Lead details and call history"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-[#E2E8F0] flex flex-col overflow-hidden">
        {loading || !lead ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[#64748B]">
            Loading lead history...
          </div>
        ) : (
          <>
            {/* Status-Tinted Header */}
            <div className={`px-5 py-4 border-b ${meta.cardBgClass} ${meta.cardBorderClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${meta.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${meta.indicatorClass}`} />
                      {meta.label}
                    </span>
                    <span aria-hidden="true" className="text-[#94A3B8]">·</span>
                    <span className="text-[#475569]">
                      {LEAD_SOURCE_LABELS[lead.source]}
                    </span>
                    <span aria-hidden="true" className="text-[#94A3B8]">·</span>
                    <span className="text-[#475569]">
                      Owner: <strong className="font-semibold text-[#0F172A]">{lead.ownerName}</strong>
                    </span>
                    {lead.campaignName && (
                      <>
                        <span aria-hidden="true" className="text-[#94A3B8]">·</span>
                        <span className="text-[#475569] truncate">
                          {lead.campaignName}
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="mt-1 text-lg font-bold text-[#0F172A] truncate">
                    {lead.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#334155] font-mono-tabular">
                    <a
                      href={`tel:+${lead.normalizedPhone}`}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#059669]"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{lead.phone}</span>
                    </a>
                    <span aria-hidden="true" className="text-[#CBD5E1]">|</span>
                    <span>
                      Follow-up:{' '}
                      <strong
                        className={
                          urgency === 'overdue'
                            ? 'text-[#DC2626]'
                            : urgency === 'today'
                              ? 'text-[#D97706]'
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
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="p-1.5 rounded-lg text-[#475569] hover:text-[#0F172A] hover:bg-white/70 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenWhatsApp(lead)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp / Send Quote</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEditLead(lead)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </button>
                {canTransfer && onTransferLead && (
                  <button
                    type="button"
                    onClick={() => onTransferLead(lead)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#ECFDF5] rounded-lg cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transfer</span>
                  </button>
                )}

                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B91C1C] bg-white border border-[#FCA5A5] hover:bg-[#FEF2F2] rounded-lg cursor-pointer ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 ml-auto bg-white border border-[#FCA5A5] rounded-lg px-2.5 py-1">
                    <span className="text-[11px] font-medium text-[#B91C1C]">
                      Delete lead?
                    </span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDelete}
                      className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                    >
                      {deleting ? '...' : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-1.5 py-0.5 text-[11px] text-[#475569] cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Body: Log Call Form + Call History Timeline */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <form
                onSubmit={handleAddRemark}
                className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#0F172A]">
                    Log Call Update & Remark
                  </h4>
                  <span className="text-[11px] text-[#64748B]">
                    Updates lead status & color automatically
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Write what the client said on this call..."
                  className="w-full p-2.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <div className="min-h-[18px] flex items-center mb-1">
                      <label className="text-[11px] font-medium text-[#475569]">
                        Outcome / Status
                      </label>
                    </div>
                    <select
                      value={statusAtCall}
                      onChange={(e) => setStatusAtCall(e.target.value as LeadStatus)}
                      className={`w-full h-9 px-2.5 text-xs font-semibold border rounded-lg cursor-pointer ${LEAD_STATUS_META[statusAtCall].selectClass}`}
                    >
                      {ALL_LEAD_STATUSES.map((st) => (
                        <option key={st} value={st} className="bg-white text-[#0F172A]">
                          {LEAD_STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="min-h-[18px] flex items-center mb-1">
                      <label className="text-[11px] font-medium text-[#475569]">
                        Call Date
                      </label>
                    </div>
                    <input
                      type="date"
                      value={callDate}
                      onChange={(e) => setCallDate(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>

                  <div>
                    <div className="min-h-[18px] flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-[#475569]">
                        Next Follow-up
                      </label>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setFollowUpDate(addDaysIso(1))}
                          className="text-[#059669] hover:underline cursor-pointer"
                        >
                          +1d
                        </button>
                        <button
                          type="button"
                          onClick={() => setFollowUpDate(addDaysIso(3))}
                          className="text-[#059669] hover:underline cursor-pointer"
                        >
                          +3d
                        </button>
                        {followUpDate && (
                          <button
                            type="button"
                            onClick={() => setFollowUpDate('')}
                            className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingRemark}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{savingRemark ? 'Logging...' : 'Save Call Update'}</span>
                  </button>
                </div>
              </form>

              <div>
                <h4 className="text-xs font-semibold text-[#0F172A] mb-3">
                  Call Remark History ({lead.remarks?.length ?? 0})
                </h4>

                {!lead.remarks || lead.remarks.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-[#CBD5E1] text-xs text-[#64748B]">
                    No call remarks logged yet. Add your first call update above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lead.remarks.map((entry) => {
                      const stMeta = LEAD_STATUS_META[entry.statusAtCall];
                      return (
                        <div
                          key={entry.id}
                          className={`p-3.5 rounded-xl border ${stMeta.cardBgClass} ${stMeta.cardBorderClass}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 font-semibold ${stMeta.textClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stMeta.indicatorClass}`} />
                                {stMeta.label}
                              </span>
                              <span aria-hidden="true" className="text-[#94A3B8]">·</span>
                              <span className="font-mono-tabular text-[#475569]">
                                {formatLeadDisplayDate(entry.callDate)}
                              </span>
                            </div>
                            <span className="text-[#64748B]">
                              by {entry.loggedBy}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-[#0F172A] whitespace-pre-line">
                            {entry.remark}
                          </p>
                          {entry.followUpDate && (
                            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[#475569]">
                              <CalendarClock className="w-3 h-3" />
                              <span>
                                Next Follow-up: {formatLeadDisplayDate(entry.followUpDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
