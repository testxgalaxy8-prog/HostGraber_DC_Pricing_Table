import React, { useCallback, useEffect, useState } from 'react';
import {
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { apiDownloadBlob, apiFetch } from '../../lib/api.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  formatCurrencyValue,
  getPricingItem,
  hasPricingValue,
} from '../../shared/quotation.ts';
import type {
  CategoryItem,
  ColumnMappingEntry,
  ImportHistoryItem,
  ImportMode,
  ImportPreviewResult,
  ImportPreviewRow,
  PortalSettings,
  TargetFieldType,
  WorksheetSummary,
} from '../../shared/types.ts';

interface InspectResponse {
  uploadToken: string;
  filename: string;
  fileSize: number;
  worksheets: WorksheetSummary[];
  unrecognizedColumns: string[];
}

const TARGET_FIELD_OPTIONS: Array<{ value: TargetFieldType; label: string }> = [
  { value: 'plan_name', label: 'Plan Name' },
  { value: 'series', label: 'Series / Plan Group' },
  { value: 'category', label: 'Product Category' },
  { value: 'base_monthly_price', label: 'Base Monthly Price' },
  { value: 'price_monthly', label: 'Monthly Price (Rate/mo)' },
  { value: 'price_quarterly', label: 'Quarterly Price (Rate/mo)' },
  { value: 'price_semiannually', label: 'Semi-Annually Price (Rate/mo)' },
  { value: 'price_annually', label: 'Annually Price (Rate/mo)' },
  { value: 'price_biennially', label: 'Biennially Price (Rate/mo)' },
  { value: 'price_triennially', label: 'Triennially Price (Rate/mo)' },
  { value: 'total_monthly', label: 'Monthly WHMCS Feed (Total)' },
  { value: 'total_quarterly', label: 'Quarterly WHMCS Feed (Total)' },
  { value: 'total_semiannually', label: 'Semi-Annually WHMCS Feed (Total)' },
  { value: 'total_annually', label: 'Annually WHMCS Feed (Total)' },
  { value: 'total_biennially', label: 'Biennially WHMCS Feed (Total)' },
  { value: 'total_triennially', label: 'Triennially WHMCS Feed (Total)' },
  { value: 'short_description', label: 'Short Description' },
  { value: 'full_description', label: 'Full Description' },
  { value: 'original_price', label: 'Original Price' },
  { value: 'discounted_price', label: 'Discounted Price' },
  { value: 'discount_percentage', label: 'Discount %' },
  { value: 'special_offers', label: 'Special Offers' },
  { value: 'free_addons', label: 'Free Add-ons' },
  { value: 'additional_benefits', label: 'Additional Benefits' },
  { value: 'terms_and_conditions', label: 'Terms & Conditions' },
  { value: 'notes', label: 'Notes' },
  { value: 'status', label: 'Active Status' },
  { value: 'specification', label: 'Technical Specification' },
  { value: 'ignore', label: 'Ignore Column' },
];

export function ExcelUploadView({
  settings,
  categories,
  onImportCompleted,
  onToast,
}: {
  settings: PortalSettings;
  categories: CategoryItem[];
  onImportCompleted: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [uploading, setUploading] = useState(false);
  const [inspectData, setInspectData] = useState<InspectResponse | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [sheetMappings, setSheetMappings] = useState<
    Record<string, ColumnMappingEntry[]>
  >({});
  const [importMode, setImportMode] = useState<ImportMode>('update_existing');
  const [targetCategory, setTargetCategory] = useState<string>(
    categories[0]?.name || ''
  );

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ImportPreviewResult | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null);

  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const list = await apiFetch<ImportHistoryItem[]>('/api/imports');
      setHistory(list);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load import history.'
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFileSelect = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      onToast('error', 'Only XLSX, XLS, and CSV files are supported.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch<InspectResponse>('/api/excel/inspect', {
        method: 'POST',
        body: formData,
      });

      setInspectData(res);
      // Skip Summary (All) by default while keeping it selectable
      const defaultChecked = res.worksheets
        .filter((w) => w.defaultSelected !== false)
        .map((w) => w.sheetName);
      setSelectedSheets(
        defaultChecked.length > 0
          ? defaultChecked
          : res.worksheets.map((w) => w.sheetName)
      );

      const initialMappings: Record<string, ColumnMappingEntry[]> = {};
      for (const ws of res.worksheets) {
        initialMappings[ws.sheetName] = ws.suggestedMappings;
      }
      setSheetMappings(initialMappings);
      setStep('mapping');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to parse uploaded workbook.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!inspectData) return;
    if (selectedSheets.length === 0) {
      onToast('error', 'Select at least one worksheet to preview.');
      return;
    }
    if (importMode === 'replace_category' && !targetCategory.trim()) {
      onToast('error', 'Select a target category for Replace Selected Category mode.');
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await apiFetch<ImportPreviewResult>('/api/excel/preview', {
        method: 'POST',
        body: JSON.stringify({
          uploadToken: inspectData.uploadToken,
          selectedSheets,
          sheetMappings,
          importMode,
          targetCategory:
            importMode === 'replace_category' ? targetCategory.trim() : null,
        }),
      });
      setPreviewData(result);
      setPreviewRows(result.rows);
      setStep('preview');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to generate preview.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!inspectData || !previewData) return;
    const selectedCount = previewRows.filter(
      (r) => r.selected && r.action !== 'error' && r.action !== 'skip'
    ).length;

    if (selectedCount === 0) {
      onToast('error', 'Select at least one valid row to import.');
      return;
    }

    setCommitting(true);
    try {
      const result = await apiFetch<{
        importRecordId: number;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
      }>('/api/excel/commit', {
        method: 'POST',
        body: JSON.stringify({
          uploadToken: inspectData.uploadToken,
          filename: previewData.filename,
          worksheetNames: previewData.selectedSheets,
          importMode: previewData.importMode,
          targetCategory: previewData.targetCategory,
          rows: previewRows,
        }),
      });

      onToast(
        'success',
        `Import complete: ${result.createdCount} added, ${result.updatedCount} updated.`
      );
      setStep('upload');
      setInspectData(null);
      setPreviewData(null);
      setPreviewRows([]);
      await Promise.all([loadHistory(), onImportCompleted()]);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to commit Excel import.'
      );
      await loadHistory();
    } finally {
      setCommitting(false);
    }
  };

  const resetWizard = () => {
    setStep('upload');
    setInspectData(null);
    setPreviewData(null);
    setPreviewRows([]);
  };

  const activeUnrecognizedColumns = React.useMemo(() => {
    if (!inspectData) return [];
    const set = new Set<string>();
    for (const ws of inspectData.worksheets) {
      if (!selectedSheets.includes(ws.sheetName)) continue;
      const mappings = sheetMappings[ws.sheetName] || ws.suggestedMappings;
      for (const m of mappings) {
        if (!m.recognized) {
          set.add(m.excelColumn);
        }
      }
    }
    return Array.from(set);
  }, [inspectData, selectedSheets, sheetMappings]);

  const activeSheetWarnings = React.useMemo(() => {
    if (!inspectData) return [];
    const list: string[] = [];
    for (const ws of inspectData.worksheets) {
      if (!selectedSheets.includes(ws.sheetName)) continue;
      for (const w of ws.sheetWarnings || []) {
        list.push(w);
      }
    }
    return list;
  }, [inspectData, selectedSheets]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Upload Excel Workbook
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            XLSX, XLS, or CSV pricing sheets with auto-mapping and preview
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            apiDownloadBlob('/api/excel/template', 'hostgraber-pricing-template.xlsx')
              .then(() => onToast('success', 'Sample Excel template downloaded.'))
              .catch((err) =>
                onToast(
                  'error',
                  err instanceof Error ? err.message : 'Download failed.'
                )
              )
          }
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-[#059669]" />
          <span>Sample Excel</span>
        </button>
      </div>

      {/* Step 1: Upload Dropzone */}
      {step === 'upload' && (
        <section className="bg-white border border-[#E2E8F0] rounded-lg p-6">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className="flex flex-col items-center justify-center border-2 border-dashed border-[#CBD5E1] hover:border-[#17C964] rounded-lg p-12 bg-[#F8FAFC] hover:bg-[#ECFDF5]/40 cursor-pointer transition-colors"
          >
            <Upload className="w-8 h-8 text-[#059669] mb-3" />
            <div className="text-sm font-semibold text-[#0F172A]">
              {uploading
                ? 'Reading worksheets and analyzing columns...'
                : 'Click to upload or drag and drop your pricing spreadsheet'}
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Supports multi-sheet .xlsx, .xls, and .csv files up to 10 MB
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </label>
        </section>
      )}

      {/* Step 2: Worksheet Selection & Column Mapping */}
      {step === 'mapping' && inspectData && (
        <section className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Step 2: Configure Import &amp; Column Mapping
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5 font-mono-tabular">
                File: {inspectData.filename} ({(inspectData.fileSize / 1024).toFixed(1)} KB) ·{' '}
                {selectedSheets.length}/{inspectData.worksheets.length} worksheet(s) selected
              </p>
            </div>
            <button
              type="button"
              onClick={resetWizard}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Upload Different File</span>
            </button>
          </div>

          {activeUnrecognizedColumns.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Unrecognized columns detected:</span>{' '}
                {activeUnrecognizedColumns.join(', ')}. They have been mapped as dynamic Technical Specifications so no data is lost—verify or remap below if needed.
              </div>
            </div>
          )}

          {activeSheetWarnings.length > 0 && (
            <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-[#0F172A] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-[#0F172A]">
                  Positional Header Recovery Notices
                </div>
                {activeSheetWarnings.map((w, i) => (
                  <div key={i} className="text-[#334155]">
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Import Mode
              </label>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as ImportMode)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
              >
                <option value="update_existing">
                  Add New Plans &amp; Update Existing Plans (Recommended)
                </option>
                <option value="add_new">Add New Plans Only (Skip Existing)</option>
                <option value="review_changes">
                  Review Every Change Manually Before Import
                </option>
                <option value="replace_category">
                  Replace Selected Category (Deactivate unlisted in category)
                </option>
              </select>
            </div>

            {importMode === 'replace_category' ? (
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Target Category to Replace
                </label>
                <input
                  list="import-target-cats"
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                />
                <datalist id="import-target-cats">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Duplicate Matching Rule
                </label>
                <div className="px-3 py-2 text-xs text-[#475569] bg-white border border-[#E2E8F0] rounded-lg">
                  Matches existing plans by normalized{' '}
                  <strong className="text-[#0F172A]">Plan Name + Category</strong>. Unlisted plans are never deleted automatically.
                </div>
              </div>
            )}
          </div>

          {/* Per-Worksheet Column Mapping */}
          <div className="space-y-4">
            {inspectData.worksheets.map((ws) => {
              const isSelected = selectedSheets.includes(ws.sheetName);
              const mappings = sheetMappings[ws.sheetName] || [];

              return (
                <div
                  key={ws.sheetName}
                  className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
                    <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#0F172A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSheets((prev) => [...prev, ws.sheetName]);
                          } else {
                            setSelectedSheets((prev) =>
                              prev.filter((s) => s !== ws.sheetName)
                            );
                          }
                        }}
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                      />
                      <span>Worksheet: {ws.sheetName}</span>
                      {ws.isSummarySheet && (
                        <span className="text-xs font-normal text-[#D97706]">
                          (Derived overview — unchecked by default to avoid duplicates)
                        </span>
                      )}
                    </label>
                    <span className="text-xs text-[#64748B] font-mono-tabular">
                      Header row {ws.headerRowIndex} · {ws.rowCount} data rows · {ws.headers.length} columns
                    </span>
                  </div>

                  {isSelected && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] bg-[#F8FAFC]">
                            <th className="py-2.5 px-4">Excel Column</th>
                            <th className="py-2.5 px-4">Sample Value</th>
                            <th className="py-2.5 px-4">Application Field</th>
                            <th className="py-2.5 px-4">Spec Key / Label</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {mappings.map((m, idx) => {
                            const sampleVal =
                              ws.sampleRows[0]?.[`col_${m.columnIndex}`] ||
                              ws.sampleRows[0]?.[m.excelColumn] ||
                              '—';

                            return (
                              <tr
                                key={`${ws.sheetName}-${m.columnIndex}-${idx}`}
                                className="hover:bg-[#F8FAFC]"
                              >
                                <td className="py-2.5 px-4 font-medium text-[#0F172A]">
                                  <span>{m.excelColumn}</span>
                                  {!m.recognized && (
                                    <span className="ml-2 text-xs font-semibold text-[#D97706]">
                                      (Unrecognized)
                                    </span>
                                  )}
                                  {m.warning && (
                                    <div className="text-[11px] text-[#D97706] font-normal mt-0.5">
                                      Auto-mapped by position
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-xs text-[#64748B] max-w-[220px] truncate font-mono-tabular">
                                  {sampleVal}
                                </td>
                                <td className="py-2.5 px-4">
                                  <select
                                    value={m.targetField}
                                    onChange={(e) => {
                                      const nextField = e.target
                                        .value as TargetFieldType;
                                      setSheetMappings((prev) => ({
                                        ...prev,
                                        [ws.sheetName]: prev[ws.sheetName].map(
                                          (item, i) =>
                                            i === idx
                                              ? {
                                                  ...item,
                                                  targetField: nextField,
                                                  recognized: true,
                                                  specLabel:
                                                    nextField === 'specification'
                                                      ? item.specLabel || item.excelColumn
                                                      : undefined,
                                                }
                                              : item
                                        ),
                                      }));
                                    }}
                                    className="px-2.5 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                                  >
                                    {TARGET_FIELD_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2.5 px-4">
                                  {m.targetField === 'specification' ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={m.specLabel || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setSheetMappings((prev) => ({
                                            ...prev,
                                            [ws.sheetName]: prev[ws.sheetName].map(
                                              (item, i) =>
                                                i === idx
                                                  ? { ...item, specLabel: val }
                                                  : item
                                            ),
                                          }));
                                        }}
                                        className="w-full px-2.5 py-1 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                                      />
                                      {m.specKey && (
                                        <span className="text-[11px] font-mono-tabular text-[#059669] shrink-0">
                                          {m.specKey}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-[#94A3B8]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={resetWizard}
              className="px-4 py-2 text-sm font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:border-[#94A3B8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={previewLoading}
              onClick={handleGeneratePreview}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <span>
                {previewLoading ? 'Analyzing Rows...' : 'Generate Import Preview'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Import Preview */}
      {step === 'preview' && previewData && (
        <section className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Step 3: Review Import Preview
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Verified real plans only (banner rows &amp; trailing GST rows excluded from row count; GST-inclusive totals attached automatically)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
            >
              Back to Column Mapping
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-xs text-[#64748B]">Real Plans</div>
              <div className="font-mono-tabular text-lg font-bold text-[#0F172A]">
                {previewData.totalDetected}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-xs text-[#059669]">New Plans</div>
              <div className="font-mono-tabular text-lg font-bold text-[#059669]">
                {previewData.createCount}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-xs text-[#2563EB]">Updates</div>
              <div className="font-mono-tabular text-lg font-bold text-[#2563EB]">
                {previewData.updateCount}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-xs text-[#64748B]">Skipped</div>
              <div className="font-mono-tabular text-lg font-bold text-[#475569]">
                {previewData.skipCount}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-xs text-[#D97706]">Warnings</div>
              <div className="font-mono-tabular text-lg font-bold text-[#D97706]">
                {previewData.warningCount}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <div className="text-xs text-[#DC2626]">Errors</div>
              <div className="font-mono-tabular text-lg font-bold text-[#DC2626]">
                {previewData.errorCount}
              </div>
            </div>
          </div>

          {previewData.warnings && previewData.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              {previewData.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          {previewData.unmappedColumns.length > 0 && (
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475569]">
              <strong className="text-[#0F172A]">Ignored columns:</strong>{' '}
              {previewData.unmappedColumns.join(', ')}
            </div>
          )}

          <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-2.5 px-3">Import</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-4">Plan &amp; Category</th>
                  <th className="py-2.5 px-4">6-Tenure Pricing (Rate/mo · Total · GST)</th>
                  <th className="py-2.5 px-4">Specs / Offers</th>
                  <th className="py-2.5 px-4">Validation &amp; Diffs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {previewRows.map((row, idx) => {
                  const isExpanded = expandedRowIdx === idx;
                  return (
                    <React.Fragment key={`${row.sheetName}-${row.rowIndex}-${idx}`}>
                      <tr className="align-top hover:bg-[#F8FAFC]/80">
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={row.action === 'error' || row.action === 'skip'}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPreviewRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, selected: checked } : r
                                )
                              );
                            }}
                            className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                          />
                        </td>
                        <td className="py-3 px-3 text-xs font-semibold uppercase">
                          <span
                            className={
                              row.action === 'create'
                                ? 'text-[#059669]'
                                : row.action === 'update'
                                  ? 'text-[#2563EB]'
                                  : row.action === 'error'
                                    ? 'text-[#DC2626]'
                                    : 'text-[#64748B]'
                            }
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F172A]">
                            {row.planName || '—'}
                          </div>
                          {row.series && (
                            <div className="text-xs font-medium text-[#059669]">
                              Series: {row.series}
                            </div>
                          )}
                          <div className="text-xs text-[#64748B]">
                            {row.categoryName} · Sheet: {row.sheetName} (Row {row.rowIndex})
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs space-y-0.5">
                          {row.pricing.filter((p) => hasPricingValue(p)).length === 0 ? (
                            <span className="text-[#94A3B8]">No pricing</span>
                          ) : (
                            ALL_BILLING_CYCLES.map((cycle) => {
                              const p = getPricingItem(row.pricing, cycle);
                              const meta = CYCLE_META[cycle];
                              const rate = p?.currentPrice ?? null;
                              const total = p?.totalPrice ?? null;
                              const gst = p?.gstInclusiveTotal ?? null;

                              return (
                                <div key={cycle} className="whitespace-nowrap">
                                  <span className="text-[#64748B]">{meta.shortTitle}: </span>
                                  {rate === null && total === null ? (
                                    <span className="text-[#94A3B8]">—</span>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-[#0F172A]">
                                        {rate !== null
                                          ? `${formatCurrencyValue(rate, settings.currencySymbol, settings.currencyCode)}/mo`
                                          : '—'}
                                      </span>
                                      {total !== null && (
                                        <span className="text-[#475569]">
                                          {' '}
                                          · {formatCurrencyValue(total, settings.currencySymbol, settings.currencyCode)}
                                        </span>
                                      )}
                                      {gst !== null && (
                                        <span className="text-[#059669]">
                                          {' '}
                                          (GST: {formatCurrencyValue(gst, settings.currencySymbol, settings.currencyCode)})
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569]">
                          <div>{row.specifications.length} specs</div>
                          <div>{row.offers.length} offers</div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRowIdx(isExpanded ? null : idx)
                            }
                            className="font-semibold text-[#059669] hover:underline mt-1 cursor-pointer"
                          >
                            {isExpanded ? 'Hide Details' : 'Inspect Row'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-xs space-y-1">
                          {row.errors.map((errMsg, eIdx) => (
                            <div key={eIdx} className="text-[#DC2626] font-semibold">
                              Error: {errMsg}
                            </div>
                          ))}
                          {row.warnings.map((warnMsg, wIdx) => (
                            <div key={wIdx} className="text-[#D97706]">
                              Warning: {warnMsg}
                            </div>
                          ))}
                          {row.priceChanges.map((pc) => (
                            <div
                              key={pc.billingCycle}
                              className="text-[#059669] font-mono-tabular"
                            >
                              {CYCLE_META[pc.billingCycle].title}:{' '}
                              {pc.previousPrice !== null
                                ? formatCurrencyValue(
                                    pc.previousPrice,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )
                                : 'New'}{' '}
                              →{' '}
                              {pc.newPrice !== null
                                ? formatCurrencyValue(
                                    pc.newPrice,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )
                                : '—'}
                            </div>
                          ))}
                          {row.errors.length === 0 &&
                            row.warnings.length === 0 &&
                            row.priceChanges.length === 0 && (
                              <span className="font-semibold text-[#059669]">Ready</span>
                            )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#F8FAFC]">
                          <td colSpan={6} className="p-4 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="font-semibold text-[#0F172A] mb-1.5">
                                  Extracted Specifications
                                </div>
                                <div className="space-y-1">
                                  {row.specifications.map((s, sIdx) => (
                                    <div key={sIdx}>
                                      <span className="text-[#64748B]">{s.label}:</span>{' '}
                                      <span className="text-[#0F172A] font-medium">
                                        {s.value}
                                      </span>
                                      {s.specKey && (
                                        <span className="ml-2 text-[11px] font-mono-tabular text-[#64748B]">
                                          [{s.specKey}]
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-[#0F172A] mb-1.5">
                                  Extracted Special Offers
                                </div>
                                {row.offers.length === 0 ? (
                                  <div className="text-[#64748B]">None</div>
                                ) : (
                                  <div className="space-y-1">
                                    {row.offers.map((o, oIdx) => (
                                      <div key={oIdx} className="text-[#334155]">
                                        {o.title}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={resetWizard}
              className="px-4 py-2 text-sm font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:border-[#94A3B8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={committing}
              onClick={handleCommitImport}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {committing ? 'Importing to Database...' : 'Confirm & Import'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Import History */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Import History</h2>
        </div>

        {loadingHistory ? (
          <div className="p-6 text-sm text-[#64748B]">Loading import history...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#64748B]">
            No Excel files have been imported yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Filename</th>
                  <th className="py-3 px-4">Upload Date</th>
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4 text-right">Detected</th>
                  <th className="py-3 px-4 text-right">Added</th>
                  <th className="py-3 px-4 text-right">Updated</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {history.map((item) => {
                  const open = expandedHistoryId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-5 font-semibold text-[#0F172A]">
                          {item.originalFilename}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#64748B] font-mono-tabular whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569]">
                          {item.uploadedBy}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                          {item.totalPlansDetected}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#059669]">
                          {item.newPlansImported}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#2563EB]">
                          {item.existingPlansUpdated}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-semibold capitalize ${
                              item.status === 'completed'
                                ? 'text-[#059669]'
                                : 'text-[#DC2626]'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedHistoryId(open ? null : item.id)
                            }
                            className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                          >
                            {open ? 'Hide' : 'Review'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-[#F8FAFC]">
                          <td colSpan={8} className="px-5 py-3 text-xs text-[#475569] space-y-1">
                            <div>
                              <strong className="text-[#0F172A]">Worksheets:</strong>{' '}
                              {(item.worksheetNames || []).join(', ') || '—'}
                            </div>
                            <div>
                              <strong className="text-[#0F172A]">Import Mode:</strong>{' '}
                              {item.importMode} ·{' '}
                              <strong className="text-[#0F172A]">Uploader Email:</strong>{' '}
                              {item.uploadedByEmail}
                            </div>
                            {item.errorInfo && (
                              <div className="text-[#DC2626]">
                                <strong>Error:</strong> {item.errorInfo}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
