import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  FileText,
} from 'lucide-react';
import type {
  HostingPlanFull,
  PortalSettings,
} from '../shared/types.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  formatCurrencyValue,
  formatTenureSelectionLabel,
  generateQuotationText,
  getPricingItem,
  hasPricingValue,
  resolveCycleDiscount,
  resolvePricingBreakdown,
  type QuotationCopyMode,
} from '../shared/quotation.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import { exportPlansToCsv, exportPlansToPdf } from '../lib/exportQuote.ts';
import {
  TenureSelectDropdown,
  type TenureFilterValue,
} from './TenureSelectDropdown.tsx';

export function PlanDetailsView({
  plan,
  settings,
  canEdit,
  initialTenureFilter = 'all',
  onBack,
  onEdit,
  onToast,
}: {
  plan: HostingPlanFull;
  settings: PortalSettings;
  canEdit: boolean;
  initialTenureFilter?: TenureFilterValue;
  onBack: () => void;
  onEdit?: (plan: HostingPlanFull) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [tenureFilter, setTenureFilter] =
    useState<TenureFilterValue>(initialTenureFilter);
  const [copiedMode, setCopiedMode] = useState<QuotationCopyMode | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    setTenureFilter(initialTenureFilter);
  }, [initialTenureFilter, plan.id]);

  const quotationPreview = useMemo(
    () => generateQuotationText(plan, settings, 'complete', tenureFilter),
    [plan, settings, tenureFilter]
  );

  const tenureLabel = formatTenureSelectionLabel(tenureFilter);

  const handleCopy = async (mode: QuotationCopyMode) => {
    const text = generateQuotationText(plan, settings, mode, tenureFilter);
    const ok = await copyTextToClipboard(text);
    setShowCopyMenu(false);
    if (ok) {
      setCopiedMode(mode);
      onToast(
        'success',
        mode === 'complete'
          ? `Copied ${plan.name} (${tenureLabel}) to clipboard.`
          : mode === 'specs'
            ? 'Specifications copied.'
            : `Copied ${tenureLabel} pricing.`
      );
      setTimeout(() => setCopiedMode(null), 2000);
    } else {
      onToast('error', 'Failed to copy to clipboard.');
    }
  };

  const handleExportCsv = () => {
    exportPlansToCsv([plan], settings, tenureFilter, plan.name);
    onToast('success', `Exported ${plan.name} (${tenureLabel}) as CSV.`);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportPlansToPdf([plan], settings, tenureFilter, plan.name);
      onToast('success', `Exported ${plan.name} (${tenureLabel}) as PDF.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to generate PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const trimmedSeries = plan.series?.trim() || '';
  const orderedSpecs = [...plan.specifications]
    .filter((s) => {
      if (!s.label.trim() || !s.value.trim()) return false;
      if (
        trimmedSeries &&
        (s.specKey === 'series' || s.label.trim().toLowerCase() === 'series')
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const activeOffers = [...plan.offers]
    .filter((o) => o.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-[#64748B] truncate">
            <span className="text-[#059669] font-semibold">{plan.categoryName}</span>
            {plan.series && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#0F172A] font-medium">{plan.series}</span>
              </>
            )}
            {!plan.isActive && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#DC2626] font-semibold">Inactive</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto min-w-0">
          <TenureSelectDropdown
            value={tenureFilter}
            onChange={setTenureFilter}
            variant="toolbar"
          />

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#059669]" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] hover:text-[#0F172A] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-[#059669]" />
            <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
          </button>

          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(plan)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Plan</span>
            </button>
          )}

          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => handleCopy('complete')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-l-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedMode === 'complete' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedMode === 'complete' ? 'Copied' : 'Copy Plan'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCopyMenu((v) => !v)}
              aria-label="Additional copy options"
              className="inline-flex items-center px-2.5 py-2 text-[#04120A] bg-[#10B981] hover:bg-[#0EA472] border-l border-[#04120A]/15 rounded-r-lg transition-colors cursor-pointer shrink-0"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showCopyMenu && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] bg-white border border-[#E2E8F0] rounded-lg shadow-lg py-1 z-30">
                <button
                  type="button"
                  onClick={() => handleCopy('complete')}
                  className="w-full text-left px-3.5 py-2 text-xs text-[#0F172A] hover:bg-[#F8FAFC] font-medium cursor-pointer"
                >
                  Copy Complete Plan
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy('specs')}
                  className="w-full text-left px-3.5 py-2 text-xs text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
                >
                  Copy Specifications
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy('pricing')}
                  className="w-full text-left px-3.5 py-2 text-xs text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
                >
                  Copy Pricing
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
            <h2 className="text-2xl font-bold text-[#0F172A]">{plan.name}</h2>
            {plan.baseMonthlyPrice !== null && plan.baseMonthlyPrice > 0 && (
              <div className="mt-1.5 text-sm font-mono-tabular text-[#475569]">
                Base:{' '}
                <span className="font-semibold text-[#0F172A]">
                  {formatCurrencyValue(
                    plan.baseMonthlyPrice,
                    settings.currencySymbol,
                    settings.currencyCode
                  )}
                  /mo
                </span>
              </div>
            )}
            {plan.shortDescription && (
              <p className="text-sm text-[#475569] mt-2">{plan.shortDescription}</p>
            )}
            {plan.fullDescription && (
              <div className="mt-4 pt-4 border-t border-[#E2E8F0] text-sm text-[#334155] leading-relaxed whitespace-pre-line">
                {plan.fullDescription}
              </div>
            )}
          </section>

          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#0F172A]">
                Specifications
              </h3>
              <button
                type="button"
                onClick={() => handleCopy('specs')}
                className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
              >
                Copy Specs
              </button>
            </div>

            {orderedSpecs.length === 0 ? (
              <p className="text-sm text-[#64748B]">No specifications recorded.</p>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {orderedSpecs.map((spec, idx) => (
                  <div
                    key={`${spec.label}-${idx}`}
                    className="py-2.5 flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="text-[#64748B]">{spec.label}</span>
                    <span className="text-[#0F172A] font-medium text-right">
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#0F172A]">
                Billing Tenures
              </h3>
              <button
                type="button"
                onClick={() => handleCopy('pricing')}
                className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
              >
                Copy Pricing
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ALL_BILLING_CYCLES.map((cycle) => {
                const p = getPricingItem(plan.pricing, cycle);
                const meta = CYCLE_META[cycle];
                const isSelectedTenure =
                  tenureFilter !== 'all' && tenureFilter.includes(cycle);
                if (!hasPricingValue(p) || !p) {
                  return (
                    <div
                      key={cycle}
                      className={`p-4 rounded-lg border border-dashed bg-[#F8FAFC] ${
                        isSelectedTenure ? 'border-[#10B981]' : 'border-[#CBD5E1]'
                      }`}
                    >
                      <div className="text-xs font-medium text-[#64748B]">
                        {meta.title}
                      </div>
                      <div className="text-xs text-[#94A3B8] mt-2">Unavailable</div>
                    </div>
                  );
                }

                const breakdown = resolvePricingBreakdown(p, cycle, plan, settings);
                const discount = resolveCycleDiscount(p, cycle, plan, settings, breakdown);

                return (
                  <div
                    key={cycle}
                    className={`p-4 rounded-lg border space-y-1.5 ${
                      isSelectedTenure
                        ? 'border-[#10B981] bg-[#ECFDF5]/60'
                        : 'border-[#E2E8F0] bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span>{meta.title}</span>
                      <span>{meta.durationLabel}</span>
                    </div>
                    <div className="font-mono-tabular text-lg font-bold text-[#0F172A]">
                      {breakdown.monthlyRate !== null && breakdown.monthlyRate > 0
                        ? `${formatCurrencyValue(
                            breakdown.monthlyRate,
                            settings.currencySymbol,
                            settings.currencyCode
                          )}/mo`
                        : '—'}
                    </div>
                    {breakdown.termTotal !== null && breakdown.termTotal > 0 && (
                      <div className="text-xs font-mono-tabular text-[#475569]">
                        Total{' '}
                        <span className="font-semibold text-[#0F172A]">
                          {formatCurrencyValue(
                            breakdown.termTotal,
                            settings.currencySymbol,
                            settings.currencyCode
                          )}
                        </span>
                      </div>
                    )}
                    {breakdown.gstTotal !== null && breakdown.gstTotal > 0 && (
                      <div className="text-xs font-mono-tabular text-[#059669]">
                        Incl. GST{' '}
                        <span className="font-semibold">
                          {formatCurrencyValue(
                            breakdown.gstTotal,
                            settings.currencySymbol,
                            settings.currencyCode
                          )}
                        </span>
                      </div>
                    )}
                    {discount.hasDiscount && discount.regularPrice !== null && (
                      <div className="pt-1.5 mt-1 border-t border-[#E2E8F0] text-xs font-mono-tabular text-[#64748B] space-y-0.5">
                        <div>
                          <span className="line-through">
                            {formatCurrencyValue(
                              discount.regularPrice,
                              settings.currencySymbol,
                              settings.currencyCode
                            )}
                            {discount.isMonthlyUnit ? '/mo' : ''}
                          </span>
                          {discount.discountPercentage !== null &&
                            discount.discountPercentage > 0 && (
                              <span className="ml-2 text-[#059669] font-semibold">
                                -{discount.discountPercentage}%
                              </span>
                            )}
                        </div>
                        {discount.discountedPrice !== null && (
                          <div className="text-[#059669] font-semibold">
                            Offer:{' '}
                            {formatCurrencyValue(
                              discount.discountedPrice,
                              settings.currencySymbol,
                              settings.currencyCode
                            )}
                            {discount.isMonthlyUnit ? '/mo' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {activeOffers.length > 0 && (
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
              <h3 className="text-base font-semibold text-[#0F172A] mb-3">
                Included Offers
              </h3>
              <div className="divide-y divide-[#F1F5F9]">
                {activeOffers.map((offer, idx) => (
                  <div key={`${offer.title}-${idx}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-[#0F172A]">
                        {offer.title}
                      </span>
                      {offer.marketValue !== null && offer.marketValue > 0 && (
                        <span className="text-xs font-mono-tabular font-semibold text-[#059669] shrink-0">
                          {formatCurrencyValue(
                            offer.marketValue,
                            settings.currencySymbol,
                            settings.currencyCode
                          )}
                        </span>
                      )}
                    </div>
                    {offer.description && (
                      <p className="text-xs text-[#64748B] mt-1">{offer.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(plan.notes || plan.termsAndConditions) && (
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
              {plan.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-[#0F172A]">Notes</h3>
                  <p className="text-sm text-[#475569] mt-1 whitespace-pre-line">
                    {plan.notes}
                  </p>
                </div>
              )}
              {plan.termsAndConditions && (
                <div className={plan.notes ? 'pt-4 border-t border-[#E2E8F0]' : ''}>
                  <h3 className="text-sm font-semibold text-[#0F172A]">Terms</h3>
                  <p className="text-sm text-[#475569] mt-1 whitespace-pre-line">
                    {plan.termsAndConditions}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="lg:col-span-5 lg:sticky lg:top-24">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-[#0F172A]">
                Quotation Text
              </h3>
              <button
                type="button"
                onClick={() => handleCopy('complete')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>

            <pre className="mt-4 p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs leading-relaxed text-[#1E293B] font-mono whitespace-pre-wrap break-words max-h-[540px] overflow-y-auto">
              {quotationPreview}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
