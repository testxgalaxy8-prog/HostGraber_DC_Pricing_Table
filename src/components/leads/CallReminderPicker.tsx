import { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  Bell,
  BellRing,
  ChevronDown,
  Clock,
  Timer,
  X,
} from 'lucide-react';
import {
  addMinutesToNow,
  formatLeadDisplayTime,
  getTodayIsoDate,
  normalizeFollowUpTimeInput,
} from '../../shared/leads.ts';

const QUICK_TIMERS = [
  { label: '15 min', short: '+15m', minutes: 15 },
  { label: '30 min', short: '+30m', minutes: 30 },
  { label: '1 hour', short: '+1h', minutes: 60 },
  { label: '2 hours', short: '+2h', minutes: 120 },
];

const QUICK_SLOTS = [
  { label: '10:00 AM', value: '10:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '02:00 PM', value: '14:00' },
  { label: '04:00 PM', value: '16:00' },
  { label: '06:00 PM', value: '18:00' },
  { label: '08:00 PM', value: '20:00' },
];

function splitTimeParts(time24: string): {
  hour12: string;
  minute: string;
  period: 'AM' | 'PM';
} {
  const normalized = normalizeFollowUpTimeInput(time24);
  if (!normalized) {
    const fallback = new Date(Date.now() + 30 * 60_000);
    const h = fallback.getHours();
    const m = fallback.getMinutes();
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return {
      hour12: String(h12).padStart(2, '0'),
      minute: String(m).padStart(2, '0'),
      period,
    };
  }
  const [hh, mm] = normalized.split(':').map(Number);
  const period: 'AM' | 'PM' = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return {
    hour12: String(h12).padStart(2, '0'),
    minute: String(mm).padStart(2, '0'),
    period,
  };
}

function joinTimeParts(hour12: string, minute: string, period: 'AM' | 'PM'): string {
  let h = Number(hour12);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  let m = Number(minute);
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (m > 59) m = 59;

  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function CallReminderPicker({
  followUpDate,
  followUpTime,
  onChange,
  size = 'md',
  surface = 'muted',
  label = 'Call Reminder',
}: {
  followUpDate: string;
  followUpTime: string;
  onChange: (nextDate: string, nextTime: string) => void;
  size?: 'sm' | 'md';
  surface?: 'muted' | 'white';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [hour12, setHour12] = useState('10');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasTime = Boolean(normalizeFollowUpTimeInput(followUpTime));
  const displayTime = formatLeadDisplayTime(followUpTime);

  const openPopover = () => {
    const parts = splitTimeParts(followUpTime);
    setHour12(parts.hour12);
    setMinute(parts.minute);
    setPeriod(parts.period);

    if (triggerWrapRef.current) {
      const rect = triggerWrapRef.current.getBoundingClientRect();
      const popWidth = 308;
      const popHeight = 310;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < popHeight && rect.top > popHeight
          ? Math.max(12, rect.top - popHeight - 6)
          : Math.min(window.innerHeight - popHeight - 12, rect.bottom + 6);
      const left = Math.max(
        12,
        Math.min(window.innerWidth - popWidth - 12, rect.right - popWidth)
      );
      setCoords({ top, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerWrapRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const applyQuickMinutes = (minutes: number) => {
    const next = addMinutesToNow(minutes);
    onChange(next.date, next.time);
    setOpen(false);
  };

  const applySlot = (time24: string) => {
    onChange(followUpDate || getTodayIsoDate(), time24);
    setOpen(false);
  };

  const applyCustomTime = () => {
    const time24 = joinTimeParts(hour12, minute, period);
    onChange(followUpDate || getTodayIsoDate(), time24);
    setOpen(false);
  };

  const heightClass = size === 'sm' ? 'h-9 text-xs' : 'h-10 text-sm';
  const labelRowMinH = size === 'sm' ? 'min-h-[18px] mb-1' : 'min-h-[20px] mb-1.5';
  const labelTextClass =
    size === 'sm'
      ? 'text-[11px] font-medium text-[#475569]'
      : 'text-xs font-semibold text-[#334155]';

  return (
    <div className="min-w-0">
      <div className={`${labelRowMinH} flex items-center justify-between gap-2`}>
        <label className={`${labelTextClass} truncate`}>{label}</label>
        <div className="flex items-center gap-1.5 text-[10px] shrink-0">
          {QUICK_TIMERS.slice(0, 3).map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              onClick={() => applyQuickMinutes(preset.minutes)}
              className="text-[#059669] hover:underline font-medium cursor-pointer"
            >
              {preset.short}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={triggerWrapRef}
        className={`relative flex items-center rounded-lg border transition-colors ${heightClass} ${
          hasTime
            ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
            : surface === 'white'
              ? 'bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#94A3B8]'
              : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:bg-white hover:border-[#94A3B8]'
        }`}
      >
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPopover())}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex-1 min-w-0 h-full px-2.5 flex items-center gap-2 text-left cursor-pointer focus:outline-none"
        >
          {hasTime ? (
            <BellRing className="w-3.5 h-3.5 text-[#059669] shrink-0" />
          ) : (
            <Bell className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
          )}
          <span
            className={`truncate ${
              hasTime
                ? 'font-mono-tabular font-semibold text-[#065F46]'
                : 'text-[#94A3B8]'
            }`}
          >
            {hasTime ? displayTime : 'Set time'}
          </span>
        </button>

        {hasTime ? (
          <button
            type="button"
            onClick={() => onChange(followUpDate, '')}
            aria-label="Clear reminder time"
            title="Clear reminder time"
            className="mr-1.5 p-1 rounded-md text-[#047857] hover:bg-[#D1FAE5] cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openPopover())}
            aria-label="Choose reminder time"
            className="mr-1.5 p-1 rounded-md text-[#94A3B8] hover:text-[#334155] cursor-pointer shrink-0"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Select call reminder time"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="fixed z-[70] w-[308px] bg-white border border-[#E2E8F0] rounded-xl shadow-2xl p-3 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#059669]">
                <AlarmClock className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#0F172A]">
                Call Reminder Timer
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close time picker"
              className="p-1 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Countdown Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B]">
              <Timer className="w-3 h-3 text-[#059669]" />
              <span>Remind me in</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_TIMERS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  onClick={() => applyQuickMinutes(preset.minutes)}
                  className="py-1.5 px-1 text-[11px] font-semibold text-[#047857] bg-[#F8FAFC] border border-[#E2E8F0] hover:bg-[#ECFDF5] hover:border-[#A7F3D0] rounded-lg transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Common Clock Slots */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B]">
              <Clock className="w-3 h-3 text-[#059669]" />
              <span>Quick Time Slots</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_SLOTS.map((slot) => {
                const active = followUpTime === slot.value;
                return (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => applySlot(slot.value)}
                    className={`py-1.5 px-1 text-[11px] font-mono-tabular font-semibold border rounded-lg transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#17C964] border-[#17C964] text-[#04120A]'
                        : 'bg-white border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]'
                    }`}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Exact Time */}
          <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5">
            <div className="text-[11px] font-semibold text-[#64748B]">
              Custom Time
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={hour12}
                onChange={(e) => setHour12(e.target.value)}
                aria-label="Reminder hour"
                className="h-8 px-1.5 text-xs font-mono-tabular font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
              >
                {Array.from({ length: 12 }, (_, idx) =>
                  String(idx + 1).padStart(2, '0')
                ).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-xs font-bold text-[#64748B]">:</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={minute}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setMinute(digits);
                }}
                onBlur={() => {
                  const n = Math.min(59, Math.max(0, Number(minute || '0')));
                  setMinute(String(n).padStart(2, '0'));
                }}
                aria-label="Reminder minute"
                className="w-11 h-8 px-1.5 text-center text-xs font-mono-tabular font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
              />
              <div className="inline-flex rounded-lg border border-[#CBD5E1] overflow-hidden shrink-0">
                {(['AM', 'PM'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-2 h-8 text-[11px] font-semibold cursor-pointer transition-colors ${
                      period === p
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-white text-[#475569] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={applyCustomTime}
                className="ml-auto px-3 h-8 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer shrink-0"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
