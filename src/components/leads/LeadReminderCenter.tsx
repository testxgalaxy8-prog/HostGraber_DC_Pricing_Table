import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Clock,
  ExternalLink,
  Phone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  canUseBrowserNotifications,
  getBrowserNotificationPermission,
  playReminderChime,
  requestBrowserNotificationPermission,
  showBrowserReminderNotification,
} from '../../lib/reminderAudio.ts';
import {
  LEAD_STATUS_META,
  addMinutesToNow,
  formatLeadDisplayDate,
  formatLeadDisplayTime,
  getFollowUpUrgency,
  getReminderTimingStatus,
  getTodayIsoDate,
  type ReminderTimingInfo,
} from '../../shared/leads.ts';
import type { LeadItem } from '../../shared/types.ts';

interface LeadWithTiming {
  lead: LeadItem;
  timing: ReminderTimingInfo;
}

const SOUND_PREF_KEY = 'hg_crm_reminder_sound';

export function LeadReminderCenter({
  onOpenLead,
  onToast,
}: {
  onOpenLead: (leadId: number) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(SOUND_PREF_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());
  const [floatingQueue, setFloatingQueue] = useState<LeadItem[]>([]);
  const [busyLeadId, setBusyLeadId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const firedScheduleKeysRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const fetchReminders = useCallback(async () => {
    try {
      const items = await apiFetch<LeadItem[]>('/api/leads/reminders');
      setLeads(items);
    } catch {
      // Ignore transient background poll errors
    }
  }, []);

  useEffect(() => {
    void fetchReminders();
    const pollId = window.setInterval(() => {
      void fetchReminders();
    }, 20_000);

    const onLeadsChanged = () => {
      void fetchReminders();
    };
    window.addEventListener('hg-leads-changed', onLeadsChanged);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('hg-leads-changed', onLeadsChanged);
    };
  }, [fetchReminders]);

  // 1-second tick for live timers & exact-time alert firing
  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const todayStr = getTodayIsoDate();

  const { dueTimed, upcomingTimed, dateOnlyDue } = useMemo(() => {
    const dueList: LeadWithTiming[] = [];
    const upcomingList: LeadWithTiming[] = [];
    const dateOnlyList: LeadItem[] = [];

    for (const lead of leads) {
      const timing = getReminderTimingStatus(lead, nowMs);
      if (lead.followUpTime && timing.state !== 'none') {
        if (timing.state === 'due') {
          dueList.push({ lead, timing });
        } else if (timing.state === 'imminent' || timing.state === 'scheduled') {
          upcomingList.push({ lead, timing });
        }
      } else {
        const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, todayStr);
        if (urgency === 'overdue' || urgency === 'today') {
          dateOnlyList.push(lead);
        }
      }
    }

    dueList.sort((a, b) => (a.timing.targetMs ?? 0) - (b.timing.targetMs ?? 0));
    upcomingList.sort(
      (a, b) => (a.timing.targetMs ?? 0) - (b.timing.targetMs ?? 0)
    );

    return {
      dueTimed: dueList,
      upcomingTimed: upcomingList,
      dateOnlyDue: dateOnlyList,
    };
  }, [leads, nowMs, todayStr]);

  // Fire floating alert + chime + optional browser notification when a timed reminder becomes due
  useEffect(() => {
    if (dueTimed.length === 0) return;

    const newlyDue: LeadItem[] = [];
    for (const { lead } of dueTimed) {
      const key = `${lead.id}|${lead.followUpDate || ''}|${lead.followUpTime || ''}`;
      if (!firedScheduleKeysRef.current.has(key)) {
        firedScheduleKeysRef.current.add(key);
        newlyDue.push(lead);
      }
    }

    if (newlyDue.length === 0) return;

    setFloatingQueue((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const merged = [...prev];
      for (const item of newlyDue) {
        if (!existingIds.has(item.id)) {
          merged.push(item);
        }
      }
      return merged;
    });

    if (soundEnabledRef.current) {
      playReminderChime();
    }

    const first = newlyDue[0];
    showBrowserReminderNotification({
      title:
        newlyDue.length === 1
          ? `Call Reminder: ${first.name}`
          : `${newlyDue.length} Call Reminders Due`,
      body: `${first.phone} · ${formatLeadDisplayTime(first.followUpTime)}${
        first.latestRemark ? ` — ${first.latestRemark}` : ''
      }`,
      tag: `lead-reminder-${first.id}-${first.followUpDate}-${first.followUpTime}`,
      onClick: () => onOpenLead(first.id),
    });
  }, [dueTimed, onOpenLead]);

  // Keep floating alerts synced or prune alerts that were resolved/rescheduled
  useEffect(() => {
    setFloatingQueue((prev) => {
      if (prev.length === 0) return prev;
      const dueMap = new Map(dueTimed.map((d) => [d.lead.id, d.lead]));
      return prev
        .filter((item) => dueMap.has(item.id))
        .map((item) => dueMap.get(item.id)!);
    });
  }, [dueTimed]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      if (next) {
        playReminderChime();
      }
      return next;
    });
  };

  const handleEnableBrowserAlerts = async () => {
    const result = await requestBrowserNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      onToast('success', 'Desktop call reminder notifications enabled.');
    } else if (result === 'denied') {
      onToast(
        'error',
        'Browser notifications are blocked. In-app alerts and sound chime still work.'
      );
    }
  };

  const handleDismissReminder = async (lead: LeadItem) => {
    setBusyLeadId(lead.id);
    try {
      const updated = await apiFetch<LeadItem>(`/api/leads/${lead.id}/reminder`, {
        method: 'POST',
        body: JSON.stringify({ action: 'dismiss' }),
      });
      setFloatingQueue((prev) => prev.filter((item) => item.id !== lead.id));
      await fetchReminders();
      window.dispatchEvent(
        new CustomEvent<LeadItem>('hg-reminder-updated', { detail: updated })
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to dismiss reminder.'
      );
    } finally {
      setBusyLeadId(null);
    }
  };

  const handleSnoozeReminder = async (lead: LeadItem, minutes: number) => {
    setBusyLeadId(lead.id);
    try {
      const next = addMinutesToNow(minutes);
      const updated = await apiFetch<LeadItem>(`/api/leads/${lead.id}/reminder`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'snooze',
          followUpDate: next.date,
          followUpTime: next.time,
        }),
      });
      setFloatingQueue((prev) => prev.filter((item) => item.id !== lead.id));
      await fetchReminders();
      window.dispatchEvent(
        new CustomEvent<LeadItem>('hg-reminder-updated', { detail: updated })
      );
      onToast(
        'success',
        `Snoozed ${lead.name} to ${formatLeadDisplayTime(next.time)}.`
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to snooze reminder.'
      );
    } finally {
      setBusyLeadId(null);
    }
  };

  const handleTestAlert = () => {
    if (soundEnabled) {
      playReminderChime();
    }
    onToast('success', 'Reminder sound & notification system is active.');
  };

  const nextUpcoming = upcomingTimed[0] ?? null;
  const totalAlertBadge = dueTimed.length + dateOnlyDue.length;
  const showNextTimerPill =
    dueTimed.length > 0 ||
    (nextUpcoming !== null &&
      (nextUpcoming.timing.diffMs ?? Infinity) <= 12 * 3600 * 1000);

  return (
    <>
      <div ref={containerRef} className="relative flex items-center gap-2 shrink-0">
        {showNextTimerPill && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title="View active call timers and reminders"
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              dueTimed.length > 0
                ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C] hover:bg-[#FEE2E2]'
                : nextUpcoming?.timing.state === 'imminent'
                  ? 'bg-[#FFFBEB] border-[#FCD34D] text-[#B45309] hover:bg-[#FEF3C7]'
                  : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857] hover:bg-[#D1FAE5]'
            }`}
          >
            {dueTimed.length > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-ping" />
                <span>
                  {dueTimed.length === 1
                    ? `Call Due: ${dueTimed[0].lead.name.split(' ')[0]}`
                    : `${dueTimed.length} Calls Due`}
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono-tabular">
                  {nextUpcoming!.lead.name.split(' ')[0]} · {nextUpcoming!.timing.label}
                </span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Call timers and reminder notifications"
          title="Call Timers & Notifications"
          className={`relative inline-flex items-center justify-center p-2 rounded-lg border transition-colors cursor-pointer ${
            dueTimed.length > 0
              ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C] hover:bg-[#FEE2E2]'
              : open
                ? 'bg-[#ECFDF5] border-[#17C964] text-[#065F46]'
                : 'bg-white border-[#CBD5E1] text-[#334155] hover:bg-[#F8FAFC]'
          }`}
        >
          {dueTimed.length > 0 ? (
            <BellRing className="w-4 h-4" />
          ) : (
            <Bell className="w-4 h-4" />
          )}
          {totalAlertBadge > 0 && (
            <span
              className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold font-mono-tabular flex items-center justify-center text-white ${
                dueTimed.length > 0 ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'
              }`}
            >
              {totalAlertBadge > 99 ? '99+' : totalAlertBadge}
            </span>
          )}
        </button>

        {/* Notification Center Popover */}
        {open && (
          <div
            role="dialog"
            aria-label="Call timers and reminder notifications"
            className="absolute right-0 top-full mt-2 w-[min(410px,calc(100vw-1.5rem))] bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#0F172A] truncate">
                  Call Timers &amp; Reminders
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  {dueTimed.length} due now · {upcomingTimed.length} timed upcoming
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundEnabled ? 'Mute reminder chime' : 'Enable reminder chime'}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border cursor-pointer ${
                    soundEnabled
                      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
                      : 'bg-white border-[#CBD5E1] text-[#64748B]'
                  }`}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTestAlert}
                  className="px-2 py-1 text-[11px] font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-lg cursor-pointer"
                >
                  Test
                </button>
              </div>
            </div>

            {canUseBrowserNotifications() && notifPermission === 'default' && (
              <div className="px-4 py-2 bg-[#FFFBEB] border-b border-[#FDE68A] flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#92400E] font-medium">
                  Enable desktop alerts even when tab is minimized
                </span>
                <button
                  type="button"
                  onClick={handleEnableBrowserAlerts}
                  className="px-2.5 py-1 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-md cursor-pointer shrink-0"
                >
                  Allow
                </button>
              </div>
            )}

            <div className="max-h-[420px] overflow-y-auto divide-y divide-[#E2E8F0]">
              {dueTimed.length === 0 &&
              upcomingTimed.length === 0 &&
              dateOnlyDue.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <BellOff className="w-6 h-6 text-[#94A3B8] mx-auto" />
                  <p className="text-xs font-semibold text-[#334155]">
                    No active call reminders
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    Set a callback timer when adding a lead or logging a call update.
                  </p>
                </div>
              ) : (
                <>
                  {/* Due Now Timed Reminders */}
                  {dueTimed.length > 0 && (
                    <div className="p-3 space-y-2 bg-[#FEF2F2]/40">
                      <div className="text-[11px] font-semibold text-[#B91C1C] flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Due Now ({dueTimed.length})</span>
                      </div>
                      {dueTimed.map(({ lead, timing }) => (
                        <div
                          key={lead.id}
                          className="p-2.5 rounded-xl bg-white border border-[#FCA5A5] space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#0F172A] truncate">
                                {lead.name}
                              </div>
                              <div className="text-[11px] font-mono-tabular text-[#475569]">
                                {lead.phone} · {formatLeadDisplayTime(lead.followUpTime)}
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold font-mono-tabular text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] rounded shrink-0">
                              {timing.label}
                            </span>
                          </div>
                          {lead.latestRemark && (
                            <p className="text-[11px] text-[#475569] line-clamp-2">
                              {lead.latestRemark}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={`tel:+${lead.normalizedPhone}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-md"
                            >
                              <Phone className="w-3 h-3" />
                              <span>Call</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onOpenLead(lead.id);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#334155] bg-[#F8FAFC] border border-[#CBD5E1] hover:bg-white rounded-md cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Open</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyLeadId === lead.id}
                              onClick={() => handleSnoozeReminder(lead, 10)}
                              className="px-2 py-1 text-[11px] font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FCD34D] hover:bg-[#FEF3C7] rounded-md cursor-pointer"
                            >
                              +10m
                            </button>
                            <button
                              type="button"
                              disabled={busyLeadId === lead.id}
                              onClick={() => handleSnoozeReminder(lead, 30)}
                              className="px-2 py-1 text-[11px] font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FCD34D] hover:bg-[#FEF3C7] rounded-md cursor-pointer"
                            >
                              +30m
                            </button>
                            <button
                              type="button"
                              disabled={busyLeadId === lead.id}
                              onClick={() => handleDismissReminder(lead)}
                              title="Dismiss alert"
                              className="ml-auto inline-flex items-center gap-0.5 px-2 py-1 text-[11px] text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Done</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upcoming Timed Reminders */}
                  {upcomingTimed.length > 0 && (
                    <div className="p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-[#047857] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Upcoming Call Timers ({upcomingTimed.length})</span>
                      </div>
                      {upcomingTimed.map(({ lead, timing }) => (
                        <div
                          key={lead.id}
                          className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onOpenLead(lead.id);
                              }}
                              className="text-xs font-semibold text-[#0F172A] hover:text-[#059669] hover:underline truncate block text-left cursor-pointer"
                            >
                              {lead.name}
                            </button>
                            <div className="text-[11px] font-mono-tabular text-[#64748B]">
                              {formatLeadDisplayDate(lead.followUpDate)} ·{' '}
                              {formatLeadDisplayTime(lead.followUpTime)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold font-mono-tabular rounded-md border ${
                                timing.state === 'imminent'
                                  ? 'bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]'
                                  : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
                              }`}
                            >
                              {timing.label}
                            </span>
                            <a
                              href={`tel:+${lead.normalizedPhone}`}
                              title={`Call ${lead.phone}`}
                              className="p-1.5 text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#ECFDF5] rounded-md"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Date-only Due Today / Overdue Follow-ups */}
                  {dateOnlyDue.length > 0 && (
                    <div className="p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-[#475569]">
                        Today &amp; Overdue Follow-ups (No Timer Set · {dateOnlyDue.length})
                      </div>
                      {dateOnlyDue.slice(0, 6).map((lead) => {
                        const urgency = getFollowUpUrgency(
                          lead.followUpDate,
                          lead.status,
                          todayStr
                        );
                        return (
                          <div
                            key={lead.id}
                            className="px-2.5 py-2 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpen(false);
                                  onOpenLead(lead.id);
                                }}
                                className="text-xs font-medium text-[#0F172A] hover:text-[#059669] hover:underline truncate block text-left cursor-pointer"
                              >
                                {lead.name}
                              </button>
                              <div className="text-[10px] font-mono-tabular text-[#64748B]">
                                {lead.phone} · {formatLeadDisplayDate(lead.followUpDate)}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-semibold shrink-0 ${
                                urgency === 'overdue'
                                  ? 'text-[#DC2626]'
                                  : 'text-[#D97706]'
                              }`}
                            >
                              {urgency === 'overdue' ? 'Overdue' : 'Today'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Call Reminder Alert Pop-up Stack (Top-Right below header) */}
      {floatingQueue.length > 0 && (
        <div
          className="fixed top-20 right-4 sm:right-6 z-40 w-[min(380px,calc(100vw-2rem))] space-y-2.5"
          role="alert"
          aria-live="assertive"
        >
          {floatingQueue.slice(0, 3).map((lead) => {
            const meta = LEAD_STATUS_META[lead.status];
            const timing = getReminderTimingStatus(lead, nowMs);
            return (
              <div
                key={`alert-${lead.id}-${lead.followUpDate}-${lead.followUpTime}`}
                className="bg-white border-2 border-[#17C964] rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="px-3.5 py-2.5 bg-[#ECFDF5] border-b border-[#A7F3D0] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-[#17C964] text-[#04120A] flex items-center justify-center shrink-0">
                      <BellRing className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#065F46] truncate">
                        Call Reminder Due
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[#047857]">
                        {formatLeadDisplayTime(lead.followUpTime)} · {timing.label}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFloatingQueue((prev) =>
                        prev.filter((item) => item.id !== lead.id)
                      )
                    }
                    aria-label="Close reminder popup"
                    className="p-1 text-[#047857] hover:bg-white/70 rounded-md cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#0F172A] truncate">
                        {lead.name}
                      </div>
                      <div className="text-xs font-mono-tabular font-semibold text-[#334155]">
                        {lead.phone}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md shrink-0 ${meta.selectClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {lead.latestRemark && (
                    <p className="text-xs text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-2 line-clamp-2">
                      {lead.latestRemark}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setFloatingQueue((prev) =>
                          prev.filter((item) => item.id !== lead.id)
                        );
                        onOpenLead(lead.id);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open &amp; Log Call</span>
                    </button>
                    <a
                      href={`tel:+${lead.normalizedPhone}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#047857] bg-white border border-[#A7F3D0] hover:bg-[#ECFDF5] rounded-lg"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                    <button
                      type="button"
                      disabled={busyLeadId === lead.id}
                      onClick={() => handleSnoozeReminder(lead, 10)}
                      className="px-2 py-1.5 text-[11px] font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#FCD34D] hover:bg-[#FEF3C7] rounded-lg cursor-pointer"
                    >
                      +10m
                    </button>
                    <button
                      type="button"
                      disabled={busyLeadId === lead.id}
                      onClick={() => handleSnoozeReminder(lead, 30)}
                      className="px-2 py-1.5 text-[11px] font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#FCD34D] hover:bg-[#FEF3C7] rounded-lg cursor-pointer"
                    >
                      +30m
                    </button>
                    <button
                      type="button"
                      disabled={busyLeadId === lead.id}
                      onClick={() => handleDismissReminder(lead)}
                      className="ml-auto px-2 py-1.5 text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
