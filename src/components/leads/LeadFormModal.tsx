import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';
import {
  ALL_LEAD_STATUSES,
  LEAD_FORM_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  LEAD_TYPE_LABELS,
  addDaysIso,
  getTodayIsoDate,
} from '../../shared/leads.ts';
import type {
  LeadColleagueOption,
  LeadItem,
  LeadSource,
  LeadStatus,
  LeadType,
} from '../../shared/types.ts';
import { CallReminderPicker } from './CallReminderPicker.tsx';

export interface LeadFormSubmitPayload {
  leadCode?: string | null;
  ownerUserId?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  leadType: LeadType;
  dealValue?: number | null;
  source: LeadSource;
  campaignName: string | null;
  status: LeadStatus;
  latestRemark: string;
  leadDate: string;
  followUpDate: string | null;
  followUpTime: string | null;
  watcherUserIds: number[];
}

export function LeadFormModal({
  isOpen,
  editingLead,
  isSuperAdmin = false,
  saving,
  currentUserId,
  currentUserName,
  defaultOwnerUserId,
  unlockedColleagues,
  allColleagues = [],
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  editingLead: LeadItem | null;
  isSuperAdmin?: boolean;
  saving: boolean;
  currentUserId: number;
  currentUserName: string;
  defaultOwnerUserId: number;
  unlockedColleagues: LeadColleagueOption[];
  allColleagues?: LeadColleagueOption[];
  onClose: () => void;
  onSubmit: (payload: LeadFormSubmitPayload) => Promise<void>;
}) {
  const [ownerUserId, setOwnerUserId] = useState<number>(defaultOwnerUserId);
  const [leadCode, setLeadCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState<LeadType>('retail');
  const [dealValue, setDealValue] = useState('');
  const [source, setSource] = useState<LeadSource>('aisensy_organic');
  const [campaignName, setCampaignName] = useState('');
  const [status, setStatus] = useState<LeadStatus>('new_lead');
  const [leadDate, setLeadDate] = useState(getTodayIsoDate());
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [watcherUserIds, setWatcherUserIds] = useState<number[]>([]);
  const [latestRemark, setLatestRemark] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingLead) {
      setOwnerUserId(editingLead.ownerUserId || currentUserId);
      setLeadCode(editingLead.leadCode || '');
      setName(editingLead.name);
      setPhone(editingLead.phone);
      setEmail(editingLead.email || '');
      setLeadType(editingLead.leadType || 'retail');
      setDealValue(
        editingLead.dealValue !== null && editingLead.dealValue !== undefined
          ? String(editingLead.dealValue)
          : ''
      );
      setSource(editingLead.source);
      setCampaignName(editingLead.campaignName || '');
      setStatus(editingLead.status);
      setLeadDate(editingLead.leadDate || getTodayIsoDate());
      setFollowUpDate(editingLead.followUpDate || '');
      setFollowUpTime(editingLead.followUpTime || '');
      setWatcherUserIds(editingLead.watcherUserIds || []);
      setLatestRemark(editingLead.latestRemark || '');
    } else {
      setOwnerUserId(defaultOwnerUserId || currentUserId);
      setLeadCode('');
      setName('');
      setPhone('');
      setEmail('');
      setLeadType('retail');
      setDealValue('');
      setSource('aisensy_organic');
      setCampaignName('');
      setStatus('new_lead');
      setLeadDate(getTodayIsoDate());
      setFollowUpDate(getTodayIsoDate());
      setFollowUpTime('');
      setWatcherUserIds([]);
      setLatestRemark('');
    }
  }, [isOpen, editingLead, currentUserId, defaultOwnerUserId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const statusMeta = LEAD_STATUS_META[status] || LEAD_STATUS_META.new_lead;

  const handleFollowUpDateChange = (nextDate: string) => {
    setFollowUpDate(nextDate);
    if (!nextDate) {
      setFollowUpTime('');
    }
  };

  const toggleWatcher = (userId: number) => {
    setWatcherUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const watcherCandidates = allColleagues.length > 0 ? allColleagues : unlockedColleagues;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      setError('Enter a valid contact number (10-digit or +country code).');
      return;
    }

    const parsedDeal =
      dealValue.trim() !== '' && Number.isFinite(Number(dealValue.trim()))
        ? Math.max(0, Number(dealValue.trim()))
        : null;

    const cleanFollowUpDate = followUpDate.trim() || null;
    const cleanFollowUpTime =
      cleanFollowUpDate && followUpTime.trim() ? followUpTime.trim() : null;

    try {
      await onSubmit({
        leadCode:
          editingLead && isSuperAdmin && leadCode.trim()
            ? leadCode.trim().toUpperCase()
            : null,
        ownerUserId: editingLead ? editingLead.ownerUserId : ownerUserId,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        leadType,
        dealValue: parsedDeal,
        source,
        campaignName: campaignName.trim() || null,
        status,
        latestRemark: latestRemark.trim(),
        leadDate: leadDate || getTodayIsoDate(),
        followUpDate: cleanFollowUpDate,
        followUpTime: cleanFollowUpTime,
        watcherUserIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save lead.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-form-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3
                id="lead-form-modal-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                {editingLead
                  ? `Edit Lead · ${editingLead.leadCode} · ${editingLead.name}`
                  : 'Add New Lead'}
              </h3>
              <p className="text-xs text-[#64748B]">
                {editingLead
                  ? 'Update contact details, status, watchers, and follow-up schedule'
                  : 'Contact details, status, watchers, and follow-up schedule'}
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {editingLead && isSuperAdmin && (
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Lead ID
                </label>
                <input
                  type="text"
                  value={leadCode}
                  onChange={(e) => setLeadCode(e.target.value)}
                  placeholder="HG-0001"
                  className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Lead Type
              </label>
              <select
                value={leadType}
                onChange={(e) => setLeadType(e.target.value as LeadType)}
                className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] cursor-pointer focus:outline-none focus:bg-white focus:border-[#17C964]"
              >
                {(Object.keys(LEAD_TYPE_LABELS) as LeadType[]).map((t) => (
                  <option key={t} value={t}>
                    {LEAD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {!editingLead && unlockedColleagues.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Lead Owner
                </label>
                <select
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                >
                  <option value={currentUserId}>{currentUserName} (Me)</option>
                  {unlockedColleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} (Unlocked)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Deal Value (Optional)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="e.g. 12500"
                className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Contact Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Contact Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210 or +91..."
                className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahul@company.com"
                className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Lead Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                className={`w-full h-10 px-3 text-sm font-semibold border rounded-lg cursor-pointer focus:outline-none ${statusMeta.selectClass}`}
              >
                {ALL_LEAD_STATUSES.map((st) => (
                  <option key={st} value={st} className="bg-white text-[#0F172A]">
                    {LEAD_STATUS_META[st].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Lead Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] cursor-pointer focus:outline-none focus:bg-white focus:border-[#17C964]"
              >
                {LEAD_FORM_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {LEAD_SOURCE_LABELS[src]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Campaign / Tag
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Cloud VPS Inquiry"
                className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <div className="min-h-[20px] flex items-center mb-1.5">
                <label className="text-xs font-semibold text-[#334155]">
                  Lead / Call Date
                </label>
              </div>
              <input
                type="date"
                value={leadDate}
                onChange={(e) => setLeadDate(e.target.value)}
                className="w-full h-10 px-2.5 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <div>
              <div className="min-h-[20px] flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#334155]">
                  Follow-up Date
                </label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleFollowUpDateChange(addDaysIso(1))}
                    className="text-[#059669] hover:underline cursor-pointer"
                  >
                    +1d
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFollowUpDateChange(addDaysIso(3))}
                    className="text-[#059669] hover:underline cursor-pointer"
                  >
                    +3d
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFollowUpDateChange(addDaysIso(7))}
                    className="text-[#059669] hover:underline cursor-pointer"
                  >
                    +7d
                  </button>
                  {followUpDate && (
                    <button
                      type="button"
                      onClick={() => handleFollowUpDateChange('')}
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
                onChange={(e) => handleFollowUpDateChange(e.target.value)}
                className="w-full h-10 px-2.5 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <CallReminderPicker
              size="md"
              surface="muted"
              label="Call Reminder"
              followUpDate={followUpDate}
              followUpTime={followUpTime}
              onChange={(nextDate, nextTime) => {
                setFollowUpDate(nextDate);
                setFollowUpTime(nextTime);
              }}
            />
          </div>

          {watcherCandidates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#334155]">
                  Lead Watchers (Team members with view access)
                </label>
                {watcherUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setWatcherUserIds([])}
                    className="text-[11px] text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                  >
                    Clear ({watcherUserIds.length})
                  </button>
                )}
              </div>
              <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap gap-2">
                {watcherCandidates.map((colleague) => {
                  const checked = watcherUserIds.includes(colleague.id);
                  return (
                    <label
                      key={colleague.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46] font-semibold'
                          : 'bg-white border-[#CBD5E1] text-[#334155] hover:border-[#94A3B8]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWatcher(colleague.id)}
                        className="w-3.5 h-3.5 rounded accent-[#17C964] cursor-pointer"
                      />
                      <span>{colleague.displayName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Call Remark
            </label>
            <textarea
              rows={3}
              value={latestRemark}
              onChange={(e) => setLatestRemark(e.target.value)}
              placeholder="Summary of client call or requirement..."
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving
                ? 'Saving...'
                : editingLead
                  ? 'Save Changes'
                  : 'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
