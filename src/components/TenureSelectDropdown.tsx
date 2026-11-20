import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  formatTenureButtonLabel,
} from '../shared/quotation.ts';
import type { BillingCycle } from '../shared/types.ts';

export type TenureFilterValue = 'all' | BillingCycle[];

export function TenureSelectDropdown({
  value,
  onChange,
  variant = 'filter',
}: {
  value: TenureFilterValue;
  onChange: (next: TenureFilterValue) => void;
  variant?: 'filter' | 'toolbar';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const isAll = value === 'all' || value.length === 0;
  const selectedCycles = isAll ? [] : value;
  const label = formatTenureButtonLabel(value);

  const toggleCycle = (cycle: BillingCycle) => {
    if (isAll) {
      onChange([cycle]);
      return;
    }

    const exists = selectedCycles.includes(cycle);
    const next = exists
      ? selectedCycles.filter((c) => c !== cycle)
      : ALL_BILLING_CYCLES.filter(
          (c) => c === cycle || selectedCycles.includes(c)
        );

    if (next.length === 0 || next.length === ALL_BILLING_CYCLES.length) {
      onChange('all');
    } else {
      onChange(next);
    }
  };

  const alignClass =
    variant === 'toolbar'
      ? 'left-0 sm:right-0 sm:left-auto'
      : 'left-0 right-auto';

  return (
    <div
      ref={containerRef}
      className={`relative ${variant === 'filter' ? 'w-full sm:w-auto' : 'inline-block'}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter and select billing tenures"
        className={`inline-flex items-center justify-between gap-2 rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none ${
          variant === 'toolbar'
            ? 'px-3 py-2 text-xs font-medium bg-white border-[#CBD5E1] text-[#0F172A] hover:border-[#94A3B8]'
            : 'w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border-[#CBD5E1] text-[#0F172A] hover:bg-white'
        } ${
          open || !isAll ? 'border-[#17C964]' : ''
        }`}
      >
        <span className="truncate max-w-[180px]">{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#64748B] shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className={`absolute ${alignClass} top-full mt-1.5 w-60 max-w-[calc(100vw-2.5rem)] bg-white border border-[#E2E8F0] rounded-xl shadow-lg py-1.5 z-40`}
        >
          <button
            type="button"
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
            className={`w-full px-3.5 py-2 flex items-center justify-between text-xs transition-colors cursor-pointer ${
              isAll
                ? 'bg-[#ECFDF5] text-[#047857] font-semibold'
                : 'text-[#0F172A] hover:bg-[#F8FAFC] font-medium'
            }`}
          >
            <span>All Tenures</span>
            {isAll && <Check className="w-3.5 h-3.5 text-[#059669]" />}
          </button>

          <div className="my-1 border-t border-[#E2E8F0]" />

          <div className="px-3.5 py-1 text-[11px] font-medium text-[#64748B]">
            Select one or more tenures
          </div>

          {ALL_BILLING_CYCLES.map((cycle) => {
            const meta = CYCLE_META[cycle];
            const checked = !isAll && selectedCycles.includes(cycle);
            return (
              <button
                key={cycle}
                type="button"
                onClick={() => toggleCycle(cycle)}
                className={`w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                  checked
                    ? 'bg-[#ECFDF5]/60 text-[#0F172A] font-medium'
                    : 'text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked
                        ? 'bg-[#17C964] border-[#17C964] text-[#04120A]'
                        : 'bg-white border-[#CBD5E1]'
                    }`}
                  >
                    {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </span>
                  <span className="truncate">{meta.title}</span>
                </span>
                <span className="text-[11px] font-mono-tabular text-[#64748B] shrink-0">
                  {meta.shortTitle}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
