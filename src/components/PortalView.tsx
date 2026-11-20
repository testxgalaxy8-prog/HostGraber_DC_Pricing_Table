import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Copy,
  Check,
  Eye,
  X,
  LayoutGrid,
  Table2,
  Rows3,
  RefreshCw,
  Download,
  FileText,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import { exportPlansToCsv, exportPlansToPdf } from '../lib/exportQuote.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  formatCurrencyValue,
  formatTenureSelectionLabel,
  generateMultiPlanQuotationText,
  generateQuotationText,
  getPricingItem,
  hasPricingValue,
  normalizeBillingCycle,
  resolvePricingBreakdown,
} from '../shared/quotation.ts';
import type {
  BillingCycle,
  CategoryItem,
  HostingPlanFull,
  PortalSettings,
} from '../shared/types.ts';
import { PlanDetailsView } from './PlanDetailsView.tsx';
import {
  TenureSelectDropdown,
  type TenureFilterValue,
} from './TenureSelectDropdown.tsx';

type LayoutMode = 'cards' | 'list' | 'table';

export function PortalView({
  settings,
  categories,
  selectedCategory,
  onSelectCategory,
  selectedPlan,
  onSelectPlan,
  onToast,
}: {
  settings: PortalSettings;
  categories: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  selectedPlan: HostingPlanFull | null;
  onSelectPlan: (plan: HostingPlanFull | null) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [plans, setPlans] = useState<HostingPlanFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [billingFilter, setBillingFilter] = useState<TenureFilterValue>('all');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [discountOnly, setDiscountOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'price_asc' | 'name'>('recent');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('cards');
  const [copiedPlanId, setCopiedPlanId] = useState<number | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<number[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<HostingPlanFull[]>('/api/public/plans');
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hosting plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : null;

    const list = plans.filter((plan) => {
      if (
        selectedCategory !== 'all' &&
        plan.categoryName.toLowerCase() !== selectedCategory.toLowerCase()
      ) {
        return false;
      }

      if (billingFilter !== 'all' && billingFilter.length > 0) {
        const hasAnySelectedTenure = billingFilter.some((cycle) =>
          hasPricingValue(getPricingItem(plan.pricing, cycle))
        );
        if (!hasAnySelectedTenure) return false;
      }

      if (discountOnly) {
        const hasDiscount = plan.pricing.some(
          (p) =>
            (p.discountPercentage !== null && p.discountPercentage > 0) ||
            (p.discountedPrice !== null &&
              p.currentPrice !== null &&
              p.discountedPrice < (p.originalPrice ?? p.currentPrice))
        );
        if (!hasDiscount) return false;
      }

      if (maxPriceNum !== null && !Number.isNaN(maxPriceNum) && maxPriceNum > 0) {
        const cyclesToCheck: BillingCycle[] =
          billingFilter !== 'all' && billingFilter.length > 0
            ? billingFilter
            : ['monthly'];
        const matchingCycle =
          cyclesToCheck.find((cycle) =>
            hasPricingValue(getPricingItem(plan.pricing, cycle))
          ) ?? plan.pricing.find((p) => hasPricingValue(p))?.billingCycle;
        if (!matchingCycle) return false;
        const normalizedCycle = normalizeBillingCycle(matchingCycle);
        const breakdown = resolvePricingBreakdown(
          getPricingItem(plan.pricing, normalizedCycle),
          normalizedCycle,
          plan,
          settings
        );
        const effective = breakdown.monthlyRate ?? breakdown.termTotal ?? 0;
        if (effective > maxPriceNum) return false;
      }

      if (q) {
        const haystack = [
          plan.name,
          plan.series || '',
          plan.categoryName,
          plan.shortDescription || '',
          plan.fullDescription || '',
          ...plan.specifications.map((s) => `${s.label} ${s.value}`),
          ...plan.offers.map((o) => `${o.title} ${o.description || ''}`),
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...list];
    if (sortBy === 'recent') {
      sorted.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'price_asc') {
      const getSortPrice = (p: HostingPlanFull): number => {
        const preferredCycle =
          billingFilter !== 'all' && billingFilter.length > 0
            ? billingFilter.find((c) => hasPricingValue(getPricingItem(p.pricing, c)))
            : hasPricingValue(getPricingItem(p.pricing, 'monthly'))
              ? ('monthly' as BillingCycle)
              : undefined;
        const targetCycle =
          preferredCycle ?? p.pricing.find((item) => hasPricingValue(item))?.billingCycle;
        if (!targetCycle) return Number.MAX_SAFE_INTEGER;
        const normalized = normalizeBillingCycle(targetCycle);
        const breakdown = resolvePricingBreakdown(
          getPricingItem(p.pricing, normalized),
          normalized,
          p,
          settings
        );
        return breakdown.monthlyRate ?? breakdown.termTotal ?? Number.MAX_SAFE_INTEGER;
      };
      sorted.sort((a, b) => getSortPrice(a) - getSortPrice(b));
    }

    return sorted;
  }, [plans, selectedCategory, searchQuery, billingFilter, maxPrice, discountOnly, sortBy, settings]);

  const selectedSet = useMemo(() => new Set(selectedPlanIds), [selectedPlanIds]);

  const selectedPlans = useMemo(
    () => plans.filter((p) => selectedSet.has(p.id)),
    [plans, selectedSet]
  );

  const exportTargetPlans =
    selectedPlans.length > 0 ? selectedPlans : filteredPlans;

  const tenureLabel = formatTenureSelectionLabel(billingFilter);
  const selectedCycleSet = useMemo(
    () =>
      billingFilter === 'all' ? new Set<BillingCycle>() : new Set(billingFilter),
    [billingFilter]
  );

  const exportContextLabel =
    selectedPlans.length > 0
      ? 'Selected Plans Quote'
      : selectedCategory === 'all'
        ? 'Hosting Plans Quote'
        : `${selectedCategory} Quote`;

  const toggleSelectPlan = (planId: number) => {
    setSelectedPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
    );
  };

  const allFilteredSelected =
    filteredPlans.length > 0 &&
    filteredPlans.every((p) => selectedSet.has(p.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredPlans.map((p) => p.id));
      setSelectedPlanIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      setSelectedPlanIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredPlans) next.add(p.id);
        return Array.from(next);
      });
    }
  };

  const handleQuickCopy = async (
    plan: HostingPlanFull,
    mode: 'complete' | 'specs' | 'pricing' = 'complete'
  ) => {
    const text = generateQuotationText(plan, settings, mode, billingFilter);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedPlanId(plan.id);
      onToast(
        'success',
        mode === 'complete'
          ? `Copied ${plan.name} (${tenureLabel}) to clipboard.`
          : mode === 'specs'
            ? 'Specifications copied.'
            : `Copied ${tenureLabel} pricing.`
      );
      setTimeout(() => setCopiedPlanId(null), 1800);
    } else {
      onToast('error', 'Unable to write to clipboard.');
    }
  };

  const handleCopySelectedQuote = async () => {
    if (selectedPlans.length === 0) return;
    const text = generateMultiPlanQuotationText(
      selectedPlans,
      settings,
      'complete',
      billingFilter
    );
    const ok = await copyTextToClipboard(text);
    if (ok) {
      onToast(
        'success',
        `Copied ${selectedPlans.length} ${selectedPlans.length === 1 ? 'plan' : 'plans'} (${tenureLabel}) to clipboard.`
      );
    } else {
      onToast('error', 'Unable to write to clipboard.');
    }
  };

  const handleExportCsv = () => {
    if (exportTargetPlans.length === 0) {
      onToast('error', 'No plans available to export.');
      return;
    }
    exportPlansToCsv(
      exportTargetPlans,
      settings,
      billingFilter,
      exportContextLabel
    );
    onToast(
      'success',
      `Exported ${exportTargetPlans.length} ${exportTargetPlans.length === 1 ? 'plan' : 'plans'} (${tenureLabel}) as CSV.`
    );
  };

  const handleExportPdf = async () => {
    if (exportTargetPlans.length === 0) {
      onToast('error', 'No plans available to export.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportPlansToPdf(
        exportTargetPlans,
        settings,
        billingFilter,
        exportContextLabel
      );
      onToast(
        'success',
        `Exported ${exportTargetPlans.length} ${exportTargetPlans.length === 1 ? 'plan' : 'plans'} (${tenureLabel}) as PDF.`
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to generate PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (selectedPlan) {
    return (
      <PlanDetailsView
        plan={selectedPlan}
        settings={settings}
        canEdit={false}
        initialTenureFilter={billingFilter}
        onBack={() => onSelectPlan(null)}
        onToast={onToast}
      />
    );
  }

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    searchQuery.trim().length > 0 ||
    billingFilter !== 'all' ||
    maxPrice.trim().length > 0 ||
    discountOnly;

  const getHeadlineCycle = (plan: HostingPlanFull): BillingCycle | null => {
    if (billingFilter !== 'all' && billingFilter.length > 0) {
      for (const cycle of billingFilter) {
        const chosen = getPricingItem(plan.pricing, cycle);
        if (hasPricingValue(chosen)) return cycle;
      }
    }
    for (const c of ALL_BILLING_CYCLES) {
      const p = getPricingItem(plan.pricing, c);
      if (hasPricingValue(p)) return c;
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Streamlined Header + Layout Switcher + Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#0F172A]">
            {selectedCategory === 'all' ? 'Hosting Plans' : selectedCategory}
          </h2>
          <span className="text-xs font-mono-tabular text-[#64748B]">
            {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'plans'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto min-w-0">
          {/* Labeled Layout Option Switcher */}
          <div
            role="group"
            aria-label="Layout option"
            className="grid grid-cols-3 sm:inline-flex items-center p-1 bg-white border border-[#E2E8F0] rounded-lg w-full sm:w-auto"
          >
            <button
              type="button"
              onClick={() => setLayoutMode('cards')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                layoutMode === 'cards'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('list')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                layoutMode === 'list'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('table')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                layoutMode === 'table'
                  ? 'bg-[#17C964] text-[#04120A] font-semibold'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exportTargetPlans.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] hover:text-[#0F172A] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#059669]" />
              <span>
                {selectedPlans.length > 0
                  ? `Export CSV (${selectedPlans.length})`
                  : 'Export CSV'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf || exportTargetPlans.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] hover:text-[#0F172A] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-[#059669]" />
              <span>
                {exportingPdf
                  ? 'Exporting...'
                  : selectedPlans.length > 0
                    ? `Export PDF (${selectedPlans.length})`
                    : 'Export PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={loadPlans}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#059669]" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Single-Row Category Underline Tabs */}
      <div className="border-b border-[#E2E8F0] flex items-center gap-5 overflow-x-auto no-scrollbar max-w-full min-w-0">
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`pb-3 text-sm whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
            selectedCategory === 'all'
              ? 'border-[#17C964] text-[#0F172A] font-semibold'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          All Plans
        </button>
        {categories.map((cat) => {
          const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.name)}
              className={`pb-3 text-sm whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                active
                  ? 'border-[#17C964] text-[#0F172A] font-semibold'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Compact Single Filter Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plans, CPU, RAM, or storage..."
            className="w-full pl-10 pr-9 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2.5 w-full lg:w-auto min-w-0">
          <TenureSelectDropdown
            value={billingFilter}
            onChange={setBillingFilter}
            variant="filter"
          />

          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder={`Max ${settings.currencySymbol}`}
            aria-label="Maximum price"
            className="w-full sm:w-28 px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] font-mono-tabular focus:outline-none focus:bg-white focus:border-[#17C964]"
          />

          <button
            type="button"
            onClick={() => setDiscountOnly((v) => !v)}
            className={`w-full sm:w-auto px-3 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap text-center ${
              discountOnly
                ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Discounts
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'price_asc' | 'name')}
            aria-label="Sort plans"
            className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
          >
            <option value="recent">Recent</option>
            <option value="price_asc">Lowest Price</option>
            <option value="name">Name (A–Z)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                onSelectCategory('all');
                setSearchQuery('');
                setBillingFilter('all');
                setMaxPrice('');
                setDiscountOnly(false);
              }}
              className="col-span-2 sm:col-span-1 justify-self-start px-2.5 py-1.5 sm:py-2 text-xs font-semibold text-[#059669] hover:underline cursor-pointer whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Quote Selection Bar (appears when 1+ plans are checked) */}
      {selectedPlans.length > 0 && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#065F46] min-w-0">
            <span className="font-semibold text-[#047857]">
              {selectedPlans.length}{' '}
              {selectedPlans.length === 1 ? 'plan selected' : 'plans selected'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Tenure: {tenureLabel}</span>
            {filteredPlans.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="font-semibold text-[#059669] hover:underline cursor-pointer"
                >
                  {allFilteredSelected
                    ? 'Unselect filtered'
                    : `Select all filtered (${filteredPlans.length})`}
                </button>
              </>
            )}
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setSelectedPlanIds([])}
              className="text-[#475569] hover:text-[#0F172A] hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
            <button
              type="button"
              onClick={handleCopySelectedQuote}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Quote</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#065F46] bg-white border border-[#A7F3D0] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#065F46] bg-white border border-[#A7F3D0] hover:bg-[#F8FAFC] disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* States */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4 animate-pulse"
            >
              <div className="h-3 w-28 bg-[#E2E8F0] rounded" />
              <div className="h-5 w-44 bg-[#CBD5E1] rounded" />
              <div className="h-7 w-24 bg-[#E2E8F0] rounded" />
              <div className="space-y-2 pt-2">
                <div className="h-3.5 w-full bg-[#F1F5F9] rounded" />
                <div className="h-3.5 w-5/6 bg-[#F1F5F9] rounded" />
                <div className="h-3.5 w-4/6 bg-[#F1F5F9] rounded" />
              </div>
              <div className="h-10 w-full bg-[#F1F5F9] rounded-lg mt-4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            type="button"
            onClick={loadPlans}
            className="mt-4 px-4 py-2 text-sm font-semibold bg-[#17C964] text-[#04120A] rounded-lg hover:bg-[#10B981] cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
          <h3 className="text-base font-semibold text-[#0F172A]">
            {plans.length === 0
              ? 'No active hosting plans yet'
              : 'No matching plans'}
          </h3>
          <p className="text-sm text-[#64748B] mt-1">
            {plans.length === 0
              ? 'Import a pricing sheet or add plans from the Admin Panel.'
              : 'Try clearing a filter or adjusting your search query.'}
          </p>
        </div>
      ) : layoutMode === 'table' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3.5 pl-4 pr-2 w-9">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      aria-label="Select all filtered plans"
                      className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">Plan</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('monthly') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    Monthly
                  </th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('quarterly') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    3 Mo
                  </th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('semiannually') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    6 Mo
                  </th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('annually') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    1 Yr
                  </th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('biennially') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    2 Yr
                  </th>
                  <th
                    className={`py-3.5 px-3 text-right ${
                      selectedCycleSet.has('triennially') ? 'text-[#047857] bg-[#ECFDF5]/70' : ''
                    }`}
                  >
                    3 Yr
                  </th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredPlans.map((plan) => (
                  <tr
                    key={plan.id}
                    className={`transition-colors ${
                      selectedSet.has(plan.id)
                        ? 'bg-[#ECFDF5]/40'
                        : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="py-3.5 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(plan.id)}
                        onChange={() => toggleSelectPlan(plan.id)}
                        aria-label={`Select ${plan.name}`}
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#0F172A]">{plan.name}</div>
                      {plan.series && (
                        <div className="text-xs text-[#64748B] mt-0.5">{plan.series}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#475569] whitespace-nowrap">
                      {plan.categoryName}
                    </td>
                    {ALL_BILLING_CYCLES.map((cycle) => {
                      const item = getPricingItem(plan.pricing, cycle);
                      const breakdown = resolvePricingBreakdown(
                        item,
                        cycle,
                        plan,
                        settings
                      );
                      const rate = breakdown.monthlyRate;
                      const total = breakdown.termTotal;
                      const gst = breakdown.gstTotal;
                      return (
                        <td
                          key={cycle}
                          className={`py-3.5 px-3 text-right font-mono-tabular whitespace-nowrap ${
                            selectedCycleSet.has(cycle) ? 'bg-[#ECFDF5]/50' : ''
                          }`}
                        >
                          {rate !== null && rate > 0 ? (
                            <div>
                              <div className="text-xs font-semibold text-[#0F172A]">
                                {formatCurrencyValue(
                                  rate,
                                  settings.currencySymbol,
                                  settings.currencyCode
                                )}
                                <span className="font-normal text-[#64748B]">/mo</span>
                              </div>
                              {total !== null && total > 0 && (
                                <div className="text-[11px] text-[#64748B]">
                                  {formatCurrencyValue(
                                    total,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )}
                                </div>
                              )}
                              {gst !== null && gst > 0 && (
                                <div className="text-[10px] text-[#059669]">
                                  GST{' '}
                                  {formatCurrencyValue(
                                    gst,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[#CBD5E1]">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-3">
                      <button
                        type="button"
                        onClick={() => handleQuickCopy(plan, 'complete')}
                        className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
                      >
                        {copiedPlanId === plan.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectPlan(plan)}
                        className="text-xs font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : layoutMode === 'list' ? (
        <div className="space-y-3.5">
          {filteredPlans.map((plan) => {
            const topSpecs = [...plan.specifications]
              .filter((s) => s.specKey !== 'series')
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .slice(0, 4);

            return (
              <article
                key={plan.id}
                className={`bg-white rounded-xl p-5 min-w-0 flex flex-col xl:flex-row xl:items-center justify-between gap-5 transition-colors border ${
                  selectedSet.has(plan.id)
                    ? 'border-[#17C964] ring-1 ring-[#17C964]/30'
                    : 'border-[#E2E8F0] hover:border-[#17C964]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 w-full xl:w-72 xl:shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(plan.id)}
                    onChange={() => toggleSelectPlan(plan.id)}
                    aria-label={`Select ${plan.name}`}
                    className="mt-1 w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-medium text-[#059669] truncate">
                      {plan.categoryName}
                      {plan.series ? ` · ${plan.series}` : ''}
                    </div>
                    <h3 className="text-base font-semibold text-[#0F172A] truncate">
                      {plan.name}
                    </h3>
                    {topSpecs.length > 0 && (
                      <div className="text-xs text-[#64748B] truncate pt-0.5">
                        {topSpecs.map((s) => `${s.label}: ${s.value}`).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {ALL_BILLING_CYCLES.map((cycle) => {
                    const item = getPricingItem(plan.pricing, cycle);
                    const meta = CYCLE_META[cycle];
                    const breakdown = resolvePricingBreakdown(
                      item,
                      cycle,
                      plan,
                      settings
                    );
                    const rate = breakdown.monthlyRate;
                    const total = breakdown.termTotal;
                    const gst = breakdown.gstTotal;
                    const highlighted = selectedCycleSet.has(cycle);

                    return (
                      <div
                        key={cycle}
                        className={`px-3 py-2 rounded-lg border ${
                          highlighted
                            ? 'bg-[#ECFDF5] border-[#10B981]/50'
                            : 'bg-[#F8FAFC] border-[#E2E8F0]'
                        }`}
                      >
                        <div className="text-[11px] text-[#64748B]">
                          {meta.shortTitle}
                        </div>
                        <div className="font-mono-tabular text-xs font-semibold text-[#0F172A] mt-0.5">
                          {rate !== null && rate > 0
                            ? `${formatCurrencyValue(
                                rate,
                                settings.currencySymbol,
                                settings.currencyCode
                              )}/mo`
                            : '—'}
                        </div>
                        {total !== null && total > 0 && (
                          <div className="text-[11px] font-mono-tabular text-[#64748B]">
                            {formatCurrencyValue(
                              total,
                              settings.currencySymbol,
                              settings.currencyCode
                            )}
                          </div>
                        )}
                        {gst !== null && gst > 0 && (
                          <div className="text-[10px] font-mono-tabular text-[#059669]">
                            GST{' '}
                            {formatCurrencyValue(
                              gst,
                              settings.currencySymbol,
                              settings.currencyCode
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickCopy(plan, 'complete')}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedPlanId === plan.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Plan</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPlan(plan)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => {
            const topSpecs = [...plan.specifications]
              .filter((s) => s.specKey !== 'series')
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .slice(0, 4);

            const headlineCycle = getHeadlineCycle(plan);
            const headlineEntry = headlineCycle
              ? getPricingItem(plan.pricing, headlineCycle)
              : undefined;
            const headlineBreakdown = headlineCycle
              ? resolvePricingBreakdown(headlineEntry, headlineCycle, plan, settings)
              : null;
            const headlineRate = headlineBreakdown?.monthlyRate ?? null;
            const headlineTotal = headlineBreakdown?.termTotal ?? null;

            return (
              <article
                key={plan.id}
                className={`bg-white rounded-xl p-5 sm:p-6 min-w-0 flex flex-col justify-between transition-colors border ${
                  selectedSet.has(plan.id)
                    ? 'border-[#17C964] ring-1 ring-[#17C964]/30'
                    : 'border-[#E2E8F0] hover:border-[#17C964]'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-medium text-[#059669] truncate">
                        {plan.categoryName}
                        {plan.series ? ` · ${plan.series}` : ''}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(plan.id)}
                        onChange={() => toggleSelectPlan(plan.id)}
                        aria-label={`Select ${plan.name}`}
                        title="Select for quote export"
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer shrink-0"
                      />
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-[#0F172A] leading-snug">
                      {plan.name}
                    </h3>
                    {headlineCycle && (headlineRate || headlineTotal) && (
                      <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="font-mono-tabular text-2xl font-bold text-[#0F172A]">
                          {headlineRate !== null && headlineRate > 0
                            ? formatCurrencyValue(
                                headlineRate,
                                settings.currencySymbol,
                                settings.currencyCode
                              )
                            : formatCurrencyValue(
                                headlineTotal!,
                                settings.currencySymbol,
                                settings.currencyCode
                              )}
                        </span>
                        <span className="text-xs text-[#64748B]">
                          {headlineRate !== null && headlineRate > 0
                            ? `/mo · ${CYCLE_META[headlineCycle].title}`
                            : CYCLE_META[headlineCycle].title}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Clean Top Specifications */}
                  {topSpecs.length > 0 && (
                    <div className="pt-3 border-t border-[#F1F5F9] space-y-2">
                      {topSpecs.map((spec, idx) => (
                        <div
                          key={`${spec.label}-${idx}`}
                          className="flex items-baseline justify-between gap-3 text-[13px]"
                        >
                          <span className="text-[#64748B] shrink-0">{spec.label}</span>
                          <span className="text-[#0F172A] font-medium text-right truncate">
                            {spec.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Clean 2x3 6-Tenure Pricing Matrix */}
                  <div className="pt-3 border-t border-[#F1F5F9]">
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_BILLING_CYCLES.map((cycle) => {
                        const item = getPricingItem(plan.pricing, cycle);
                        const meta = CYCLE_META[cycle];
                        const breakdown = resolvePricingBreakdown(
                          item,
                          cycle,
                          plan,
                          settings
                        );
                        const rate = breakdown.monthlyRate;
                        const total = breakdown.termTotal;
                        const gst = breakdown.gstTotal;
                        const highlighted = selectedCycleSet.has(cycle);

                        return (
                          <div
                            key={cycle}
                            className={`px-2.5 sm:px-3 py-2 rounded-lg min-w-0 ${
                              highlighted
                                ? 'bg-[#ECFDF5] border border-[#10B981]/50'
                                : 'bg-[#F8FAFC]'
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-[#64748B]">
                                {meta.shortTitle}
                              </span>
                              <span className="font-mono-tabular text-xs font-semibold text-[#0F172A]">
                                {rate !== null && rate > 0
                                  ? `${formatCurrencyValue(
                                      rate,
                                      settings.currencySymbol,
                                      settings.currencyCode
                                    )}/mo`
                                  : '—'}
                              </span>
                            </div>
                            {total !== null && total > 0 && (
                              <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono-tabular text-[#64748B] mt-0.5">
                                <span className="text-[10px]">Total</span>
                                <span>
                                  {formatCurrencyValue(
                                    total,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )}
                                </span>
                              </div>
                            )}
                            {gst !== null && gst > 0 && (
                              <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono-tabular text-[#059669] mt-0.5">
                                <span>GST</span>
                                <span>
                                  {formatCurrencyValue(
                                    gst,
                                    settings.currencySymbol,
                                    settings.currencyCode
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-4 border-t border-[#F1F5F9] flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleQuickCopy(plan, 'complete')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedPlanId === plan.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Plan</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPlan(plan)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
