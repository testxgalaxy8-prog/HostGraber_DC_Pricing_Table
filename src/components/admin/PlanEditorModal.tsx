import { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  getPricingItem,
  hasPricingValue,
} from '../../shared/quotation.ts';
import type {
  BillingCycle,
  CategoryItem,
  HostingPlanFull,
  PlanOfferItem,
  PlanPricingItem,
  PlanSpecItem,
  PortalSettings,
  TaxDisplayMode,
} from '../../shared/types.ts';

interface BillingFormState {
  enabled: boolean;
  originalPrice: string;
  currentPrice: string;
  totalPrice: string;
  gstInclusiveTotal: string;
  discountPercentage: string;
  discountedPrice: string;
  specialOfferPrice: string;
  taxMode: TaxDisplayMode;
}

function buildInitialBilling(
  plan: HostingPlanFull | null,
  cycle: BillingCycle
): BillingFormState {
  const found = plan ? getPricingItem(plan.pricing, cycle) : undefined;
  if (!found || !hasPricingValue(found)) {
    return {
      enabled: false,
      originalPrice: '',
      currentPrice: '',
      totalPrice: '',
      gstInclusiveTotal: '',
      discountPercentage: '',
      discountedPrice: '',
      specialOfferPrice: '',
      taxMode: 'default',
    };
  }
  return {
    enabled: true,
    originalPrice: found.originalPrice !== null ? String(found.originalPrice) : '',
    currentPrice: found.currentPrice !== null ? String(found.currentPrice) : '',
    totalPrice:
      found.totalPrice !== null && found.totalPrice !== undefined
        ? String(found.totalPrice)
        : '',
    gstInclusiveTotal:
      found.gstInclusiveTotal !== null && found.gstInclusiveTotal !== undefined
        ? String(found.gstInclusiveTotal)
        : '',
    discountPercentage:
      found.discountPercentage !== null ? String(found.discountPercentage) : '',
    discountedPrice:
      found.discountedPrice !== null ? String(found.discountedPrice) : '',
    specialOfferPrice:
      found.specialOfferPrice !== null ? String(found.specialOfferPrice) : '',
    taxMode: found.taxMode || 'default',
  };
}

export function PlanEditorModal({
  plan,
  categories,
  settings,
  onClose,
  onSaved,
}: {
  plan: HostingPlanFull | null;
  categories: CategoryItem[];
  settings: PortalSettings;
  onClose: () => void;
  onSaved: (saved: HostingPlanFull) => void;
}) {
  const isEditing = Boolean(plan);

  const [name, setName] = useState(plan?.name || '');
  const [series, setSeries] = useState(plan?.series || '');
  const [categoryName, setCategoryName] = useState(
    plan?.categoryName || categories[0]?.name || 'VPS Hosting'
  );
  const [baseMonthlyPrice, setBaseMonthlyPrice] = useState(
    plan?.baseMonthlyPrice !== null && plan?.baseMonthlyPrice !== undefined
      ? String(plan.baseMonthlyPrice)
      : ''
  );
  const [shortDescription, setShortDescription] = useState(
    plan?.shortDescription || ''
  );
  const [fullDescription, setFullDescription] = useState(
    plan?.fullDescription || ''
  );
  const [notes, setNotes] = useState(plan?.notes || '');
  const [termsAndConditions, setTermsAndConditions] = useState(
    plan?.termsAndConditions || ''
  );
  const [taxDisplayOverride, setTaxDisplayOverride] = useState<TaxDisplayMode>(
    plan?.taxDisplayOverride || 'default'
  );
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);

  const [specs, setSpecs] = useState<PlanSpecItem[]>(
    plan?.specifications.length
      ? [...plan.specifications].sort((a, b) => a.sortOrder - b.sortOrder)
      : [{ label: '', value: '', sortOrder: 0 }]
  );

  const [billing, setBilling] = useState<Record<BillingCycle, BillingFormState>>({
    monthly: buildInitialBilling(plan, 'monthly'),
    quarterly: buildInitialBilling(plan, 'quarterly'),
    semiannually: buildInitialBilling(plan, 'semiannually'),
    annually: buildInitialBilling(plan, 'annually'),
    biennially: buildInitialBilling(plan, 'biennially'),
    triennially: buildInitialBilling(plan, 'triennially'),
  });

  const [offers, setOffers] = useState<PlanOfferItem[]>(
    plan?.offers.length
      ? [...plan.offers].sort((a, b) => a.sortOrder - b.sortOrder)
      : []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveSpec = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= specs.length) return;
    const next = [...specs];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setSpecs(next.map((s, i) => ({ ...s, sortOrder: i })));
  };

  const moveOffer = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= offers.length) return;
    const next = [...offers];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setOffers(next.map((o, i) => ({ ...o, sortOrder: i })));
  };

  const calculateDiscountedForCycle = (cycle: BillingCycle) => {
    const state = billing[cycle];
    const base = Number(state.originalPrice || state.currentPrice);
    const pct = Number(state.discountPercentage);
    if (!Number.isNaN(base) && base > 0 && !Number.isNaN(pct) && pct > 0) {
      const result = Number((base * (1 - pct / 100)).toFixed(2));
      setBilling((prev) => ({
        ...prev,
        [cycle]: {
          ...prev[cycle],
          discountedPrice: String(result),
        },
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !categoryName.trim()) {
      setError('Plan Name and Category are required.');
      return;
    }

    const pricingPayload: PlanPricingItem[] = [];

    for (const cycle of ALL_BILLING_CYCLES) {
      const b = billing[cycle];
      if (!b.enabled) {
        pricingPayload.push({
          billingCycle: cycle,
          originalPrice: null,
          currentPrice: null,
          totalPrice: null,
          gstInclusiveTotal: null,
          discountPercentage: null,
          discountedPrice: null,
          specialOfferPrice: null,
          taxMode: 'default',
        });
        continue;
      }

      const currentVal = b.currentPrice.trim() ? Number(b.currentPrice) : null;
      const totalVal = b.totalPrice.trim() ? Number(b.totalPrice) : null;
      const gstVal = b.gstInclusiveTotal.trim()
        ? Number(b.gstInclusiveTotal)
        : null;

      if (
        (currentVal === null || Number.isNaN(currentVal) || currentVal <= 0) &&
        (totalVal === null || Number.isNaN(totalVal) || totalVal <= 0)
      ) {
        setError(
          `Enter a valid monthly rate or term total for ${CYCLE_META[cycle].title} billing.`
        );
        return;
      }

      const origVal = b.originalPrice.trim() ? Number(b.originalPrice) : null;
      const pctVal = b.discountPercentage.trim()
        ? Number(b.discountPercentage)
        : null;
      const discVal = b.discountedPrice.trim() ? Number(b.discountedPrice) : null;
      const offerVal = b.specialOfferPrice.trim()
        ? Number(b.specialOfferPrice)
        : null;

      pricingPayload.push({
        billingCycle: cycle,
        originalPrice: origVal !== null && !Number.isNaN(origVal) ? origVal : null,
        currentPrice:
          currentVal !== null && !Number.isNaN(currentVal) ? currentVal : null,
        totalPrice: totalVal !== null && !Number.isNaN(totalVal) ? totalVal : null,
        gstInclusiveTotal:
          gstVal !== null && !Number.isNaN(gstVal) ? gstVal : null,
        discountPercentage:
          pctVal !== null && !Number.isNaN(pctVal) ? pctVal : null,
        discountedPrice:
          discVal !== null && !Number.isNaN(discVal) ? discVal : null,
        specialOfferPrice:
          offerVal !== null && !Number.isNaN(offerVal) ? offerVal : null,
        taxMode: b.taxMode,
      });
    }

    const baseMonthlyNum = baseMonthlyPrice.trim()
      ? Number(baseMonthlyPrice)
      : null;

    const payload = {
      name: name.trim(),
      series: series.trim() || null,
      categoryName: categoryName.trim(),
      baseMonthlyPrice:
        baseMonthlyNum !== null && !Number.isNaN(baseMonthlyNum)
          ? baseMonthlyNum
          : null,
      shortDescription: shortDescription.trim() || null,
      fullDescription: fullDescription.trim() || null,
      notes: notes.trim() || null,
      termsAndConditions: termsAndConditions.trim() || null,
      taxDisplayOverride,
      isActive,
      specifications: specs
        .filter((s) => s.label.trim() && s.value.trim())
        .map((s, idx) => ({ ...s, sortOrder: idx })),
      pricing: pricingPayload,
      offers: offers
        .filter((o) => o.title.trim())
        .map((o, idx) => ({ ...o, sortOrder: idx })),
    };

    setSaving(true);
    try {
      const saved =
        isEditing && plan
          ? await apiFetch<HostingPlanFull>(`/api/plans/${plan.id}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            })
          : await apiFetch<HostingPlanFull>('/api/plans', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">
              {isEditing ? `Edit Plan: ${plan?.name}` : 'Add New Hosting Plan'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Configure dynamic specifications, 6-tenure pricing (monthly rate, WHMCS total, GST total), and special offers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Section 1: Basic Information */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[#0F172A] border-b border-[#E2E8F0] pb-2">
              Basic Plan Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Plan Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Starter Core"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Category *
                </label>
                <input
                  list="hostgraber-categories"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Select or enter category"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
                <datalist id="hostgraber-categories">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Series / Plan Group (optional)
                </label>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder="e.g. Starter Server, Business Email"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Base Monthly Price ({settings.currencySymbol}, optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={baseMonthlyPrice}
                  onChange={(e) => setBaseMonthlyPrice(e.target.value)}
                  placeholder="e.g. 1969"
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Short Description
              </label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Brief one-line summary shown on catalog cards"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Full Description
              </label>
              <textarea
                rows={2}
                value={fullDescription}
                onChange={(e) => setFullDescription(e.target.value)}
                placeholder="Detailed internal overview for sales & support reference"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Tax Display Override
                </label>
                <select
                  value={taxDisplayOverride}
                  onChange={(e) =>
                    setTaxDisplayOverride(e.target.value as TaxDisplayMode)
                  }
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                >
                  <option value="default">
                    Use Global Default (
                    {settings.defaultTaxDisplay === 'inclusive_of_tax'
                      ? 'Inclusive of Tax'
                      : 'Before Tax'}
                    )
                  </option>
                  <option value="before_tax">Before Tax</option>
                  <option value="inclusive_of_tax">Inclusive of Tax</option>
                </select>
              </div>

              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                  />
                  <span>Active Plan (visible in Public Catalog)</span>
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: Dynamic Technical Specifications */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
              <div>
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Technical Specifications (Unlimited Custom Fields)
                </h3>
                <p className="text-xs text-[#64748B]">
                  Displayed in order as Label: Value inside quotations
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSpecs((prev) => [
                    ...prev,
                    { label: '', value: '', sortOrder: prev.length },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] hover:border-[#10B981] rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Specification</span>
              </button>
            </div>

            <div className="space-y-2">
              {specs.map((spec, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={spec.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSpecs((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, label: val } : item
                        )
                      );
                    }}
                    placeholder="Label (e.g. vCPU Cores, RAM (GB))"
                    className="w-1/3 px-3 py-1.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                  />
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSpecs((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, value: val } : item
                        )
                      );
                    }}
                    placeholder="Value (e.g. 8 vCPU, 32 GB)"
                    className="flex-1 px-3 py-1.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                  />
                  <button
                    type="button"
                    onClick={() => moveSpec(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 cursor-pointer"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSpec(idx, 1)}
                    disabled={idx === specs.length - 1}
                    className="p-1.5 text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 cursor-pointer"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSpecs((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    title="Remove specification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: 6-Tenure Billing Durations */}
          <section className="space-y-3">
            <div className="border-b border-[#E2E8F0] pb-2">
              <h3 className="text-sm font-semibold text-[#0F172A]">
                6-Tenure Billing &amp; GST-Inclusive Pricing
              </h3>
              <p className="text-xs text-[#64748B]">
                Enable the tenures available for this plan ({settings.currencySymbol})
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ALL_BILLING_CYCLES.map((cycle) => {
                const state = billing[cycle];
                const meta = CYCLE_META[cycle];
                return (
                  <div
                    key={cycle}
                    className={`p-4 rounded-lg border ${
                      state.enabled
                        ? 'border-[#10B981] bg-[#ECFDF5]/60'
                        : 'border-[#CBD5E1] bg-[#F8FAFC]'
                    } space-y-3`}
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={(e) =>
                          setBilling((prev) => ({
                            ...prev,
                            [cycle]: { ...prev[cycle], enabled: e.target.checked },
                          }))
                        }
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                      />
                      <span>
                        {meta.title} ({meta.durationLabel})
                      </span>
                    </label>

                    {state.enabled && (
                      <div className="space-y-2.5 text-xs">
                        <div>
                          <label className="block text-[#475569] mb-1">
                            Monthly Rate ({settings.currencySymbol}/mo)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={state.currentPrice}
                            onChange={(e) =>
                              setBilling((prev) => ({
                                ...prev,
                                [cycle]: {
                                  ...prev[cycle],
                                  currentPrice: e.target.value,
                                },
                              }))
                            }
                            placeholder="e.g. 1969"
                            className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[#475569] mb-1">
                              Term Total (WHMCS)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={state.totalPrice}
                              onChange={(e) =>
                                setBilling((prev) => ({
                                  ...prev,
                                  [cycle]: {
                                    ...prev[cycle],
                                    totalPrice: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Before tax"
                              className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                            />
                          </div>
                          <div>
                            <label className="block text-[#475569] mb-1">
                              GST Inclusive
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={state.gstInclusiveTotal}
                              onChange={(e) =>
                                setBilling((prev) => ({
                                  ...prev,
                                  [cycle]: {
                                    ...prev[cycle],
                                    gstInclusiveTotal: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Incl. GST"
                              className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[#475569] mb-1">
                            Original Price (optional)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={state.originalPrice}
                            onChange={(e) =>
                              setBilling((prev) => ({
                                ...prev,
                                [cycle]: {
                                  ...prev[cycle],
                                  originalPrice: e.target.value,
                                },
                              }))
                            }
                            placeholder="Regular price before discount"
                            className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[#475569] mb-1">
                              Discount %
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={state.discountPercentage}
                              onChange={(e) =>
                                setBilling((prev) => ({
                                  ...prev,
                                  [cycle]: {
                                    ...prev[cycle],
                                    discountPercentage: e.target.value,
                                  },
                                }))
                              }
                              placeholder="20"
                              className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[#475569]">Discounted</label>
                              <button
                                type="button"
                                onClick={() => calculateDiscountedForCycle(cycle)}
                                className="font-semibold text-[#059669] hover:underline cursor-pointer"
                              >
                                Calc
                              </button>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={state.discountedPrice}
                              onChange={(e) =>
                                setBilling((prev) => ({
                                  ...prev,
                                  [cycle]: {
                                    ...prev[cycle],
                                    discountedPrice: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Final"
                              className="w-full px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[#475569] mb-1">
                            Tax Mode
                          </label>
                          <select
                            value={state.taxMode}
                            onChange={(e) =>
                              setBilling((prev) => ({
                                ...prev,
                                [cycle]: {
                                  ...prev[cycle],
                                  taxMode: e.target.value as TaxDisplayMode,
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                          >
                            <option value="default">Plan / Global Default</option>
                            <option value="before_tax">Before Tax</option>
                            <option value="inclusive_of_tax">Inclusive of Tax</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 4: Special Offers & Free Add-ons */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
              <div>
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Special Offers &amp; Free Add-ons
                </h3>
                <p className="text-xs text-[#64748B]">
                  Informational value only — never added automatically to plan price
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setOffers((prev) => [
                    ...prev,
                    {
                      title: '',
                      description: '',
                      marketValue: null,
                      offerPrice: 0,
                      isActive: true,
                      sortOrder: prev.length,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] hover:border-[#10B981] rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Special Offer</span>
              </button>
            </div>

            {offers.length === 0 ? (
              <p className="text-xs text-[#64748B]">
                No special offers attached to this plan yet.
              </p>
            ) : (
              <div className="space-y-3">
                {offers.map((offer, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={offer.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOffers((prev) =>
                            prev.map((o, i) =>
                              i === idx ? { ...o, title: val } : o
                            )
                          );
                        }}
                        placeholder="Offer Title (e.g. Virtualizer License Free)"
                        className="flex-1 min-w-[220px] px-3 py-1.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={offer.marketValue ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.trim()
                            ? Number(e.target.value)
                            : null;
                          setOffers((prev) =>
                            prev.map((o, i) =>
                              i === idx ? { ...o, marketValue: val } : o
                            )
                          );
                        }}
                        placeholder={`Value (${settings.currencySymbol})`}
                        className="w-32 px-3 py-1.5 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-[#334155] cursor-pointer px-2">
                        <input
                          type="checkbox"
                          checked={offer.isActive}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setOffers((prev) =>
                              prev.map((o, i) =>
                                i === idx ? { ...o, isActive: checked } : o
                              )
                            );
                          }}
                          className="accent-[#17C964]"
                        />
                        <span>Active</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => moveOffer(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOffer(idx, 1)}
                        disabled={idx === offers.length - 1}
                        className="p-1 text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOffers((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={offer.description || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOffers((prev) =>
                          prev.map((o, i) =>
                            i === idx ? { ...o, description: val } : o
                          )
                        );
                      }}
                      placeholder="Optional description"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 5: Notes & Terms */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Internal / Sales Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional internal notes"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={2}
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                placeholder="Optional plan terms"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
            </div>
          </section>
        </form>

        <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-end gap-3 bg-[#F8FAFC] rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:border-[#94A3B8] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Plan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
