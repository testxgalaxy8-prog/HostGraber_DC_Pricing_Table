import type {
  BillingCycle,
  HostingPlanFull,
  PlanPricingItem,
  PortalSettings,
} from './types.ts';

export type QuotationCopyMode = 'complete' | 'specs' | 'pricing';

export const ALL_BILLING_CYCLES: BillingCycle[] = [
  'monthly',
  'quarterly',
  'semiannually',
  'annually',
  'biennially',
  'triennially',
];

export const CYCLE_META: Record<
  BillingCycle,
  { title: string; shortTitle: string; durationLabel: string; months: number }
> = {
  monthly: { title: 'Monthly', shortTitle: '1 Mo', durationLabel: '1 month', months: 1 },
  quarterly: {
    title: 'Quarterly',
    shortTitle: '3 Mo',
    durationLabel: '3 months',
    months: 3,
  },
  semiannually: {
    title: 'Semi-Annually',
    shortTitle: '6 Mo',
    durationLabel: '6 months',
    months: 6,
  },
  annually: {
    title: 'Annually',
    shortTitle: '12 Mo',
    durationLabel: '12 months',
    months: 12,
  },
  biennially: {
    title: 'Biennially',
    shortTitle: '24 Mo',
    durationLabel: '24 months',
    months: 24,
  },
  triennially: {
    title: 'Triennially',
    shortTitle: '36 Mo',
    durationLabel: '36 months',
    months: 36,
  },
};

export function normalizeBillingCycle(raw: string): BillingCycle {
  const cleaned = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (cleaned === 'yearly' || cleaned === 'annual' || cleaned === 'annually') {
    return 'annually';
  }
  if (cleaned === 'biennial' || cleaned === 'biennially') {
    return 'biennially';
  }
  if (cleaned === 'triennial' || cleaned === 'triennially') {
    return 'triennially';
  }
  if (cleaned === 'semiannual' || cleaned === 'semiannually') {
    return 'semiannually';
  }
  if (cleaned === 'quarterly' || cleaned === 'quarter') {
    return 'quarterly';
  }
  return 'monthly';
}

export function formatCurrencyValue(
  amount: number | null | undefined,
  currencySymbol = '₹',
  currencyCode = 'INR'
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '';
  }
  const hasDecimals = Math.abs(amount - Math.round(amount)) > 0.001;
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
  return `${currencySymbol}${formatted}`;
}

export function getPricingItem(
  pricing: PlanPricingItem[],
  cycle: BillingCycle
): PlanPricingItem | undefined {
  return pricing.find((p) => normalizeBillingCycle(p.billingCycle) === cycle);
}

export function hasPricingValue(item: PlanPricingItem | undefined): boolean {
  if (!item) return false;
  return (
    (item.currentPrice !== null && item.currentPrice > 0) ||
    (item.totalPrice !== null && item.totalPrice !== undefined && item.totalPrice > 0) ||
    (item.gstInclusiveTotal !== null &&
      item.gstInclusiveTotal !== undefined &&
      item.gstInclusiveTotal > 0)
  );
}

function resolveTaxModeValue(
  pricing: PlanPricingItem | undefined,
  plan: HostingPlanFull,
  settings: PortalSettings
): 'before_tax' | 'inclusive_of_tax' {
  const effective =
    pricing && pricing.taxMode !== 'default'
      ? pricing.taxMode
      : plan.taxDisplayOverride !== 'default'
        ? plan.taxDisplayOverride
        : settings.defaultTaxDisplay;

  return effective === 'inclusive_of_tax' ? 'inclusive_of_tax' : 'before_tax';
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ResolvedPricingBreakdown {
  monthlyRate: number | null;
  termTotal: number | null;
  gstTotal: number | null;
  taxMode: 'before_tax' | 'inclusive_of_tax';
  taxText: string;
  taxRate: number;
}

export function resolvePricingBreakdown(
  item: PlanPricingItem | undefined,
  cycle: BillingCycle,
  plan: HostingPlanFull,
  settings: PortalSettings
): ResolvedPricingBreakdown {
  const taxMode = resolveTaxModeValue(item, plan, settings);
  const taxText = taxMode === 'inclusive_of_tax' ? 'inclusive of tax' : 'before tax';
  const taxRate = settings.defaultTaxRate > 0 ? settings.defaultTaxRate : 18;
  const taxMultiplier = 1 + taxRate / 100;
  const months = CYCLE_META[cycle].months;

  if (!item) {
    return {
      monthlyRate: null,
      termTotal: null,
      gstTotal: null,
      taxMode,
      taxText,
      taxRate,
    };
  }

  let monthlyRate =
    item.discountedPrice !== null && item.discountedPrice !== undefined && item.discountedPrice > 0
      ? item.discountedPrice
      : item.currentPrice !== null && item.currentPrice !== undefined && item.currentPrice > 0
        ? item.currentPrice
        : null;

  let termTotal =
    item.totalPrice !== null && item.totalPrice !== undefined && item.totalPrice > 0
      ? item.totalPrice
      : null;

  let gstTotal =
    item.gstInclusiveTotal !== null &&
    item.gstInclusiveTotal !== undefined &&
    item.gstInclusiveTotal > 0
      ? item.gstInclusiveTotal
      : null;

  // If monthlyRate is absent and both termTotal & gstTotal are present in before_tax mode,
  // guard against a shifted/corrupted totalPrice that disagrees with gstTotal (e.g. >5% off).
  if (
    monthlyRate === null &&
    termTotal !== null &&
    gstTotal !== null &&
    taxMode === 'before_tax'
  ) {
    const expectedBeforeTax = roundCurrency(gstTotal / taxMultiplier);
    if (
      expectedBeforeTax > 0 &&
      Math.abs(termTotal - expectedBeforeTax) / expectedBeforeTax > 0.05
    ) {
      termTotal = expectedBeforeTax;
    }
  }

  // Similarly, if monthlyRate IS present and matches gstTotal/taxMultiplier while termTotal disagrees,
  // align termTotal with monthlyRate * months.
  if (
    monthlyRate !== null &&
    termTotal !== null &&
    gstTotal !== null &&
    taxMode === 'before_tax'
  ) {
    const expectedFromRate = roundCurrency(monthlyRate * months);
    const expectedFromGst = roundCurrency(gstTotal / taxMultiplier);
    if (
      expectedFromGst > 0 &&
      Math.abs(expectedFromRate - expectedFromGst) / expectedFromGst <= 0.05 &&
      Math.abs(termTotal - expectedFromRate) / expectedFromRate > 0.05
    ) {
      termTotal = expectedFromRate;
    }
  }

  if (termTotal === null) {
    if (monthlyRate !== null) {
      termTotal = roundCurrency(monthlyRate * months);
    } else if (gstTotal !== null) {
      termTotal =
        taxMode === 'inclusive_of_tax'
          ? gstTotal
          : roundCurrency(gstTotal / taxMultiplier);
    }
  }

  if (monthlyRate === null && termTotal !== null && months > 0) {
    monthlyRate = roundCurrency(termTotal / months);
  }

  if (gstTotal === null && termTotal !== null) {
    gstTotal =
      taxMode === 'inclusive_of_tax'
        ? termTotal
        : roundCurrency(termTotal * taxMultiplier);
  }

  return {
    monthlyRate,
    termTotal,
    gstTotal,
    taxMode,
    taxText,
    taxRate,
  };
}

export type TenureSelection = 'all' | BillingCycle | BillingCycle[];

export function resolveTargetCycles(
  tenureSelection: TenureSelection = 'all'
): BillingCycle[] {
  if (tenureSelection === 'all') {
    return [...ALL_BILLING_CYCLES];
  }
  const list = Array.isArray(tenureSelection)
    ? tenureSelection
    : [tenureSelection];
  const unique = ALL_BILLING_CYCLES.filter((c) => list.includes(c));
  if (unique.length === 0 || unique.length === ALL_BILLING_CYCLES.length) {
    return [...ALL_BILLING_CYCLES];
  }
  return unique;
}

export function formatTenureSelectionLabel(
  tenureSelection: TenureSelection = 'all'
): string {
  const cycles = resolveTargetCycles(tenureSelection);
  if (cycles.length === ALL_BILLING_CYCLES.length) {
    return 'All Tenures';
  }
  const titles = cycles.map((c) => CYCLE_META[c].title);
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} & ${titles[1]}`;
  return `${titles.slice(0, -1).join(', ')} & ${titles[titles.length - 1]}`;
}

export function formatTenureButtonLabel(
  tenureSelection: TenureSelection = 'all'
): string {
  const cycles = resolveTargetCycles(tenureSelection);
  if (cycles.length === ALL_BILLING_CYCLES.length) {
    return 'All Tenures';
  }
  if (cycles.length === 1) {
    return CYCLE_META[cycles[0]].title;
  }
  if (cycles.length === 2) {
    return `${CYCLE_META[cycles[0]].title} + ${CYCLE_META[cycles[1]].title}`;
  }
  return `${cycles.length} Tenures`;
}

export function generateQuotationText(
  plan: HostingPlanFull,
  settings: PortalSettings,
  mode: QuotationCopyMode = 'complete',
  tenureSelection: TenureSelection = 'all'
): string {
  const symbol = settings.currencySymbol || '₹';
  const code = settings.currencyCode || 'INR';
  const lines: string[] = [];

  const trimmedSeries = plan.series?.trim() || '';
  lines.push(plan.name.trim());
  if (trimmedSeries) {
    lines.push(`Series: ${trimmedSeries}`);
  }

  if (mode === 'complete' || mode === 'specs') {
    const validSpecs = [...plan.specifications]
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

    if (validSpecs.length > 0) {
      lines.push('');
      for (const spec of validSpecs) {
        lines.push(`${spec.label.trim()}: ${spec.value.trim()}`);
      }
    }
  }

  if (mode === 'complete' || mode === 'pricing') {
    const targetCycles = resolveTargetCycles(tenureSelection);
    const isAllTenures = targetCycles.length === ALL_BILLING_CYCLES.length;
    const sortedPricing = targetCycles
      .map((cycle) => getPricingItem(plan.pricing, cycle))
      .filter((p): p is PlanPricingItem => hasPricingValue(p));

    if (sortedPricing.length > 0) {
      lines.push('');
      lines.push(
        isAllTenures
          ? 'Pricing:'
          : `Pricing (${formatTenureSelectionLabel(targetCycles)}):`
      );

      for (const item of sortedPricing) {
        const cycle = normalizeBillingCycle(item.billingCycle);
        const meta = CYCLE_META[cycle];
        const breakdown = resolvePricingBreakdown(item, cycle, plan, settings);

        const segments: string[] = [];
        if (breakdown.monthlyRate !== null && breakdown.monthlyRate > 0) {
          segments.push(
            `${formatCurrencyValue(breakdown.monthlyRate, symbol, code)}/mo`
          );
        }

        if (breakdown.taxMode === 'inclusive_of_tax') {
          const inclusiveTotal = breakdown.gstTotal ?? breakdown.termTotal;
          if (inclusiveTotal !== null && inclusiveTotal > 0) {
            segments.push(
              `Total: ${formatCurrencyValue(inclusiveTotal, symbol, code)} (inclusive of tax)`
            );
          }
        } else {
          if (breakdown.termTotal !== null && breakdown.termTotal > 0) {
            segments.push(
              `Total: ${formatCurrencyValue(breakdown.termTotal, symbol, code)} (before tax)`
            );
          }
          if (breakdown.gstTotal !== null && breakdown.gstTotal > 0) {
            segments.push(
              `GST Incl: ${formatCurrencyValue(breakdown.gstTotal, symbol, code)}`
            );
          }
        }

        lines.push(
          `- ${meta.title} (${meta.durationLabel}): ${segments.join(' | ')}`
        );
      }

      for (const item of sortedPricing) {
        const cycle = normalizeBillingCycle(item.billingCycle);
        const meta = CYCLE_META[cycle];
        const baseRate = item.currentPrice ?? 0;
        const regularPrice = item.originalPrice ?? baseRate;
        const finalDiscounted =
          item.discountedPrice ??
          (item.specialOfferPrice !== null && item.specialOfferPrice < regularPrice
            ? item.specialOfferPrice
            : baseRate > 0 && baseRate < regularPrice
              ? baseRate
              : null);

        const hasDiscount =
          (item.discountPercentage !== null && item.discountPercentage > 0) ||
          (finalDiscounted !== null && finalDiscounted < regularPrice);

        if (hasDiscount) {
          lines.push('');
          lines.push(`Special ${meta.title} Offer:`);
          lines.push(`Original Price: ${formatCurrencyValue(regularPrice, symbol, code)}`);
          if (item.discountPercentage !== null && item.discountPercentage > 0) {
            lines.push(`Discount: ${item.discountPercentage}%`);
          }
          if (finalDiscounted !== null) {
            lines.push(
              `Discounted Price: ${formatCurrencyValue(finalDiscounted, symbol, code)}`
            );
          }
        }
      }
    } else if (!isAllTenures) {
      lines.push('');
      lines.push(
        `Pricing (${formatTenureSelectionLabel(targetCycles)}): Unavailable`
      );
    }
  }

  if (mode === 'complete') {
    const activeOffers = [...plan.offers]
      .filter((o) => o.isActive !== false && o.title.trim())
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (activeOffers.length > 0) {
      lines.push('');
      lines.push('Special Offer:');
      for (const offer of activeOffers) {
        const title = offer.title.trim();
        const hasValueTag = /\((?:cost|value|free)/i.test(title);
        let offerLine = title;

        if (!hasValueTag) {
          if (
            offer.marketValue !== null &&
            offer.marketValue > 0 &&
            (offer.offerPrice === 0 || /free/i.test(title))
          ) {
            offerLine = `${title} (Cost: ${formatCurrencyValue(offer.marketValue, symbol, code)})`;
          } else if (offer.marketValue !== null && offer.marketValue > 0) {
            offerLine = `${title} (Value: ${formatCurrencyValue(offer.marketValue, symbol, code)})`;
          } else if (offer.offerPrice !== null && offer.offerPrice > 0) {
            offerLine = `${title} (Offer: ${formatCurrencyValue(offer.offerPrice, symbol, code)})`;
          }
        }

        if (offer.description && offer.description.trim()) {
          offerLine = `${offerLine} - ${offer.description.trim()}`;
        }

        lines.push(offerLine);
      }
    }
  }

  return lines.join('\n').trim();
}

export function generateMultiPlanQuotationText(
  plans: HostingPlanFull[],
  settings: PortalSettings,
  mode: QuotationCopyMode = 'complete',
  tenureSelection: TenureSelection = 'all'
): string {
  if (plans.length === 0) return '';
  if (plans.length === 1) {
    return generateQuotationText(plans[0], settings, mode, tenureSelection);
  }
  const company = settings.companyName || 'HostGraber';
  const tenureLabel = formatTenureSelectionLabel(tenureSelection);
  const header = `${company} Quotation (${plans.length} plans · ${tenureLabel})`;
  const body = plans
    .map((p) => generateQuotationText(p, settings, mode, tenureSelection))
    .join('\n\n----------------------------------------\n\n');
  return `${header}\n\n${body}`;
}
