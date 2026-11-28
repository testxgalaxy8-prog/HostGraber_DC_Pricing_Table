import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
} from 'lucide-react';
import { formatLeadDisplayDate, getTodayIsoDate } from '../../shared/leads.ts';
import type { LeadItem } from '../../shared/types.ts';

export type FollowUpFilter =
  | 'all'
  | 'due_or_overdue'
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'custom_date';

const PRESET_OPTIONS: Array<{ value: Exclude<FollowUpFilter, 'custom_date'>; label: string }> = [
  { value: 'all', label: 'Follow Ups' },
  { value: 'due_or_overdue', label: 'Today & Overdue' },
  { value: 'overdue', label: 'Overdue Only' },
  { value: 'today', label: 'Follow-up Today' },
  { value: 'upcoming', label: 'Upcoming' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoYearMonth(isoDate: string | null | undefined): { year: number; month: number } {
  const fallback = getTodayIsoDate();
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec((isoDate || fallback).trim());
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function FollowUpFilterPopover({
  value,
  customDate,
  leads,
  onChange,
}: {
  value: FollowUpFilter;
  customDate: string;
  leads: LeadItem[];
  onChange: (nextFilter: FollowUpFilter, nextDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);

  const initialYm = parseIsoYearMonth(customDate || getTodayIsoDate());
  const [viewYear, setViewYear] = useState(initialYm.year);
  const [viewMonth, setViewMonth] = useState(initialYm.month);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const todayStr = getTodayIsoDate();

  const togglePopover = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setOpenUpward(spaceBelow < 310 && spaceAbove > spaceBelow);
        // Popover width is 432px on sm+; align right if there's more room to the left than right
        const spaceRight = window.innerWidth - rect.left;
        setAlignRight(spaceRight < 448 && rect.right >= 432);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const ym = parseIsoYearMonth(customDate || todayStr);
    setViewYear(ym.year);
    setViewMonth(ym.month);

    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, customDate, todayStr]);

  const dateLeadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.followUpDate) continue;
      counts.set(lead.followUpDate, (counts.get(lead.followUpDate) || 0) + 1);
    }
    return counts;
  }, [leads]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < firstDay; i += 1) {
      cells.push({ day: null, iso: null });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ day: d, iso: toIsoDate(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthTitle = useMemo(() => {
    const date = new Date(viewYear, viewMonth, 1);
    return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [viewYear, viewMonth]);

  const triggerLabel =
    value === 'custom_date' && customDate
      ? formatLeadDisplayDate(customDate)
      : PRESET_OPTIONS.find((opt) => opt.value === value)?.label || 'Follow Ups';

  const isFiltered = value !== 'all';

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        ref={triggerRef}
        type="button"
        onClick={togglePopover}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filter by follow-up schedule or date"
        className={`w-full sm:w-auto inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
          isFiltered
            ? 'bg-[#ECFDF5] border-[#17C964] text-[#065F46] font-medium'
            : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#0F172A] hover:bg-white'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          <Calendar
            className={`w-3.5 h-3.5 shrink-0 ${
              isFiltered ? 'text-[#059669]' : 'text-[#64748B]'
            }`}
          />
          <span className="truncate">{triggerLabel}</span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#64748B] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#64748B] shrink-0" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Follow-up schedule and calendar filter"
          className={`absolute z-40 w-[min(432px,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-y-auto bg-white border border-[#E2E8F0] rounded-xl shadow-xl ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${alignRight ? 'right-0' : 'left-0'}`}
        >
          <div className="flex flex-col sm:flex-row">
            {/* Left Column: Schedule Presets */}
            <div className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-[#E2E8F0] bg-[#F8FAFC]/70 p-2 flex flex-col justify-between">
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B]">
                  Schedule Filter
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {PRESET_OPTIONS.map((opt) => {
                    const active = value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.value, '');
                          setOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#ECFDF5] text-[#065F46] font-semibold'
                            : 'text-[#0F172A] hover:bg-white'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="w-3.5 h-3.5 text-[#059669] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 mt-2 border-t border-[#E2E8F0] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange('custom_date', todayStr);
                    setOpen(false);
                  }}
                  className="flex-1 px-2 py-1.5 text-[11px] font-semibold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Today
                </button>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('all', '');
                      setOpen(false);
                    }}
                    className="inline-flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Compact Calendar Grid + Direct Date Input */}
            <div className="flex-1 p-3 space-y-2.5 bg-white">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#334155]">
                  Specific Date
                </span>
                <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-lg px-1 py-0.5 bg-[#F8FAFC]">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="p-1 text-[#475569] hover:text-[#0F172A] hover:bg-white rounded cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 text-xs font-semibold text-[#0F172A] min-w-[74px] text-center whitespace-nowrap">
                    {monthTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="p-1 text-[#475569] hover:text-[#0F172A] hover:bg-white rounded cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="border border-[#E2E8F0] rounded-lg p-1.5 bg-white">
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-[#64748B] mb-1">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="py-0.5">
                      {wd}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarDays.map((cell, idx) => {
                    if (!cell.day || !cell.iso) {
                      return <div key={`empty-${idx}`} className="h-7" />;
                    }
                    const isSelected = value === 'custom_date' && customDate === cell.iso;
                    const isToday = cell.iso === todayStr;
                    const scheduledCount = dateLeadCounts.get(cell.iso) || 0;

                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        title={
                          scheduledCount > 0
                            ? `${scheduledCount} follow-up${scheduledCount === 1 ? '' : 's'} on ${formatLeadDisplayDate(cell.iso)}`
                            : formatLeadDisplayDate(cell.iso)
                        }
                        onClick={() => {
                          onChange('custom_date', cell.iso!);
                          setOpen(false);
                        }}
                        className={`relative h-7 rounded-md text-[11px] font-mono-tabular flex flex-col items-center justify-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#17C964] text-[#04120A] font-bold'
                            : isToday
                              ? 'bg-[#FFFBEB] text-[#B45309] font-semibold ring-1 ring-[#F59E0B]/50 hover:bg-[#FEF3C7]'
                              : scheduledCount > 0
                                ? 'text-[#0F172A] font-semibold hover:bg-[#ECFDF5]'
                                : 'text-[#475569] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        <span>{cell.day}</span>
                        {scheduledCount > 0 && (
                          <span
                            className={`w-1 h-1 rounded-full -mt-0.5 ${
                              isSelected ? 'bg-[#04120A]' : 'bg-[#10B981]'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                type="date"
                value={value === 'custom_date' ? customDate : ''}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) {
                    onChange('custom_date', next);
                    setOpen(false);
                  } else {
                    onChange('all', '');
                  }
                }}
                aria-label="Pick specific follow-up date"
                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
