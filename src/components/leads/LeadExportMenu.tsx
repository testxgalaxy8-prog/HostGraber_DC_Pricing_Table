import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileSpreadsheet } from 'lucide-react';
import type {
  LeadExportFormat,
  LeadExportSelection,
} from '../../lib/leadExport.ts';

export function LeadExportMenu({
  allCount,
  filteredCount,
  selectedCount,
  onExport,
}: {
  allCount: number;
  filteredCount: number;
  selectedCount: number;
  onExport: (selection: LeadExportSelection, format: LeadExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const showFilteredOption = filteredCount > 0 && filteredCount !== allCount;
  const disabled = allCount === 0;

  const triggerExport = (
    selection: LeadExportSelection,
    format: LeadExportFormat
  ) => {
    setOpen(false);
    onExport(selection, format);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 h-9 text-xs font-medium text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
        <span>
          {selectedCount > 0
            ? `Export Excel (${selectedCount})`
            : 'Export Excel'}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-[#059669]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#059669]" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-40 overflow-hidden py-1.5"
        >
          <div className="px-3.5 py-1.5 text-[11px] font-semibold text-[#64748B]">
            Excel Workbook (.xlsx)
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => triggerExport('all', 'xlsx')}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 font-medium">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669] shrink-0" />
              <span>Export All Leads</span>
            </span>
            <span className="font-mono-tabular text-[11px] font-semibold text-[#475569]">
              {allCount}
            </span>
          </button>

          {showFilteredOption && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerExport('filtered', 'xlsx')}
              className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                <span>Export Filtered Leads</span>
              </span>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#475569]">
                {filteredCount}
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            disabled={selectedCount === 0}
            onClick={() => triggerExport('selected', 'xlsx')}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#0F172A] hover:bg-[#ECFDF5] disabled:opacity-45 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                <span>Export Selected Leads</span>
              </span>
              {selectedCount === 0 && (
                <span className="block pl-5.5 text-[10px] text-[#64748B]">
                  Select checkboxes in table to enable
                </span>
              )}
            </span>
            <span className="font-mono-tabular text-[11px] font-semibold text-[#059669] shrink-0">
              {selectedCount}
            </span>
          </button>

          <div className="my-1.5 border-t border-[#F1F5F9]" />

          <div className="px-3.5 py-1 text-[11px] font-semibold text-[#64748B]">
            CSV Spreadsheet (.csv)
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => triggerExport('all', 'csv')}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 font-medium">
              <Download className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
              <span>Export All as CSV</span>
            </span>
            <span className="font-mono-tabular text-[11px] text-[#64748B]">
              {allCount}
            </span>
          </button>

          {showFilteredOption && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerExport('filtered', 'csv')}
              className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium">
                <Download className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span>Export Filtered as CSV</span>
              </span>
              <span className="font-mono-tabular text-[11px] text-[#64748B]">
                {filteredCount}
              </span>
            </button>
          )}

          {selectedCount > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerExport('selected', 'csv')}
              className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium">
                <Download className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span>Export Selected as CSV</span>
              </span>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#059669]">
                {selectedCount}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
