import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  hostingPlans,
  importHistory,
  planChangeLogs,
  planOffers,
  planPricing,
  planSpecifications,
  pricingHistory,
} from './schema.ts';
import { ensureCategoryByName } from './defaults.ts';
import { buildNormalizedKey, fetchAllPlans } from './plans.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  hasPricingValue,
  normalizeBillingCycle,
} from '../shared/quotation.ts';
import type {
  BillingCycle,
  ColumnMappingEntry,
  HostingPlanFull,
  ImportMode,
  ImportPreviewResult,
  ImportPreviewRow,
  PlanOfferItem,
  PlanPricingItem,
  PlanSpecItem,
  TargetFieldType,
  TaxDisplayMode,
  WorksheetSummary,
} from '../shared/types.ts';

const TENURE_LIST: BillingCycle[] = [
  'monthly',
  'quarterly',
  'semiannually',
  'annually',
  'biennially',
  'triennially',
];

const PRICE_TENURE_TARGETS: Record<BillingCycle, TargetFieldType> = {
  monthly: 'price_monthly',
  quarterly: 'price_quarterly',
  semiannually: 'price_semiannually',
  annually: 'price_annually',
  biennially: 'price_biennially',
  triennially: 'price_triennially',
};

const TOTAL_TENURE_TARGETS: Record<BillingCycle, TargetFieldType> = {
  monthly: 'total_monthly',
  quarterly: 'total_quarterly',
  semiannually: 'total_semiannually',
  annually: 'total_annually',
  biennially: 'total_biennially',
  triennially: 'total_triennially',
};

/**
 * Normalizes an Excel header cell:
 * trims, collapses whitespace, lowercases, strips currency/units and punctuation.
 */
export function normalizeHeaderText(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[₹$€£]/g, ' ')
    .replace(/\(\s*(?:mo|month|yr|year|gb|tb|ssd|ram)\s*\)/gi, ' ')
    .replace(/[.,:/\\\-–—_()[\]&@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function compactKey(normalized: string): string {
  return normalized.replace(/\s+/g, '');
}

function isSummarySheetName(sheetName: string): boolean {
  const clean = normalizeHeaderText(sheetName);
  return clean === 'summary all' || clean === 'summary';
}

function isPureNumericHeader(raw: string): boolean {
  const cleaned = raw.trim().replace(/[₹$€£,\s]/g, '');
  if (!cleaned) return false;
  return /^\d+(?:\.\d+)?$/.test(cleaned);
}

function detectTenureToken(normalized: string): BillingCycle | null {
  const compact = compactKey(normalized);
  if (
    compact === 'monthly' ||
    compact === '1month' ||
    compact === '1mo' ||
    compact === 'permonth'
  ) {
    return 'monthly';
  }
  if (
    compact === 'quarterly' ||
    compact === 'quarter' ||
    compact === '3months' ||
    compact === '3month' ||
    compact === '3mo'
  ) {
    return 'quarterly';
  }
  if (
    compact === 'semiannually' ||
    compact === 'semiannual' ||
    compact === '6months' ||
    compact === '6month' ||
    compact === '6mo'
  ) {
    return 'semiannually';
  }
  if (
    compact === 'annually' ||
    compact === 'annual' ||
    compact === 'yearly' ||
    compact === '12months' ||
    compact === '12month' ||
    compact === '1year' ||
    compact === '1yr' ||
    compact === 'peryear'
  ) {
    return 'annually';
  }
  if (
    compact === 'biennially' ||
    compact === 'biennial' ||
    compact === '24months' ||
    compact === '24month' ||
    compact === '2years' ||
    compact === '2year' ||
    compact === '2yr'
  ) {
    return 'biennially';
  }
  if (
    compact === 'triennially' ||
    compact === 'triennial' ||
    compact === '36months' ||
    compact === '36month' ||
    compact === '3years' ||
    compact === '3year' ||
    compact === '3yr'
  ) {
    return 'triennially';
  }
  return null;
}

function isPlanNameSynonym(normalized: string): boolean {
  const c = compactKey(normalized);
  return (
    c === 'planname' ||
    c === 'plan' ||
    c === 'package' ||
    c === 'packagename' ||
    c === 'productname' ||
    c === 'tiername' ||
    c === 'servername'
  );
}

function isBaseMonthlySynonym(normalized: string): boolean {
  const c = compactKey(normalized);
  return (
    c === 'basemonthlyprice' ||
    c === 'baseprice' ||
    c === 'pricemo' ||
    c === 'pricepermonth' ||
    c === 'revisedpricemo' ||
    c === 'revisedprice' ||
    c === 'monthlybaseprice'
  );
}

const STANDARD_SPEC_SYNONYMS: Array<{ patterns: RegExp[]; specKey: string }> = [
  {
    patterns: [/^no\.?\s*of\s*websites?$/i, /^websites?$/i, /^hosted\s*websites?$/i],
    specKey: 'websites',
  },
  {
    patterns: [
      /^storage(\s*\(?ssd\)?)?$/i,
      /^storage\s*\(?gb\)?$/i,
      /^nvme\s*ssd(\s*\(?tb\)?)?$/i,
      /^ssd(\s*storage)?$/i,
      /^disk(\s*space)?$/i,
      /^nvme$/i,
    ],
    specKey: 'storage',
  },
  {
    patterns: [/^(mysql\s*)?databases?$/i, /^db$/i],
    specKey: 'databases',
  },
  {
    patterns: [/^emails?$/i, /^email\s*accounts?$/i, /^mail\s*accounts?$/i],
    specKey: 'email_accounts',
  },
  {
    patterns: [/^mailbox\s*storage(\s*\(?gb\)?)?$/i, /^email\s*storage$/i],
    specKey: 'mailbox_storage',
  },
  {
    patterns: [/^sub\s*-?\s*domains?$/i],
    specKey: 'subdomains',
  },
  {
    patterns: [/^ftp(\s*accounts?)?$/i],
    specKey: 'ftp_accounts',
  },
  {
    patterns: [/^vcpu(\s*cores?)?$/i, /^cpu(\s*cores?)?$/i, /^cores?$/i, /^processor$/i, /^threads?$/i],
    specKey: 'cpu',
  },
  {
    patterns: [/^ram(\s*\(?gb\)?)?$/i, /^memory(\s*\(?ram\)?)?$/i],
    specKey: 'ram',
  },
  {
    patterns: [/^bandwidth(\s*\(?(?:tb|gb)\)?)?$/i, /^traffic$/i, /^data\s*transfer$/i],
    specKey: 'bandwidth',
  },
  {
    patterns: [/^users?\s*rdp$/i, /^rdp(\s*users?)?$/i],
    specKey: 'rdp_users',
  },
  {
    patterns: [/^concurrent\s*tally\s*users?$/i, /^tally\s*users?$/i],
    specKey: 'concurrent_users',
  },
  {
    patterns: [/^cpanel\s*accounts?$/i],
    specKey: 'cpanel_accounts',
  },
  {
    patterns: [/^setup\s*(?:&|and)?\s*maintenance$/i],
    specKey: 'setup_maintenance',
  },
  {
    patterns: [/^monitoring$/i],
    specKey: 'monitoring',
  },
  {
    patterns: [/^support$/i],
    specKey: 'support',
  },
  {
    patterns: [/^helpdesk\s*response\s*time$/i, /^response\s*time$/i],
    specKey: 'response_time',
  },
  {
    patterns: [/^(ip|ips|ip\s*address(es)?|dedicated\s*ip)$/i],
    specKey: 'ip_address',
  },
  {
    patterns: [/^virtualization$/i],
    specKey: 'virtualization',
  },
  {
    patterns: [/^(access|root\s*access|root\/admin\s*access|admin\s*access)$/i],
    specKey: 'access',
  },
  {
    patterns: [/^(os|operating\s*system)$/i],
    specKey: 'os',
  },
  {
    patterns: [/^(network\s*port|port|network\s*speed|uplink)$/i],
    specKey: 'network_port',
  },
  {
    patterns: [/^(security|security\s*features|ddos(\s*protection)?)$/i],
    specKey: 'security',
  },
  {
    patterns: [/^(control\s*panel|panel)$/i],
    specKey: 'control_panel',
  },
  {
    patterns: [/^backup(s)?$/i],
    specKey: 'backups',
  },
  {
    patterns: [/^(ssl|ssl\s*certificate)$/i],
    specKey: 'ssl',
  },
  {
    patterns: [/^uptime$/i],
    specKey: 'uptime',
  },
  {
    patterns: [/^(location|datacenter|data\s*center)$/i],
    specKey: 'datacenter',
  },
];

function matchStandardSpec(rawHeader: string, normalized: string): string | null {
  const cleanDisplay = rawHeader.trim().replace(/\s+/g, ' ');
  for (const entry of STANDARD_SPEC_SYNONYMS) {
    if (
      entry.patterns.some((rx) => rx.test(cleanDisplay) || rx.test(normalized))
    ) {
      return entry.specKey;
    }
  }
  return null;
}

function slugifySpecKey(rawHeader: string): string {
  return (
    rawHeader
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'custom_spec'
  );
}

function matchSingleColumnCore(
  rawHeader: string,
  normalized: string
): { targetField: TargetFieldType; recognized: boolean; specKey?: string } | null {
  const c = compactKey(normalized);

  if (
    c === 'category' ||
    c === 'productcategory' ||
    c === 'servicetype' ||
    c === 'hostingtype' ||
    c === 'group'
  ) {
    return { targetField: 'category', recognized: true };
  }

  if (isBaseMonthlySynonym(normalized)) {
    return { targetField: 'base_monthly_price', recognized: true };
  }

  if (c === 'shortdescription' || c === 'shortdesc' || c === 'summary' || c === 'tagline' || c === 'brief') {
    return { targetField: 'short_description', recognized: true };
  }
  if (c === 'fulldescription' || c === 'description' || c === 'desc' || c === 'details' || c === 'overview') {
    return { targetField: 'full_description', recognized: true };
  }
  if (c === 'originalprice' || c === 'regularprice' || c === 'mrp') {
    return { targetField: 'original_price', recognized: true };
  }
  if (c === 'discountedprice' || c === 'offerprice' || c === 'saleprice' || c === 'finalprice') {
    return { targetField: 'discounted_price', recognized: true };
  }
  if (c === 'discount' || c === 'discountpercentage' || c === 'discountpercent' || c === 'off') {
    return { targetField: 'discount_percentage', recognized: true };
  }
  if (c === 'specialoffers' || c === 'specialoffer' || c === 'offers' || c === 'offer' || c === 'promotions' || c === 'promo') {
    return { targetField: 'special_offers', recognized: true };
  }
  if (c === 'freeaddons' || c === 'addons' || c === 'freebies') {
    return { targetField: 'free_addons', recognized: true };
  }
  if (c === 'additionalbenefits' || c === 'benefits' || c === 'perks') {
    return { targetField: 'additional_benefits', recognized: true };
  }
  if (c === 'termsandconditions' || c === 'terms' || c === 'tc') {
    return { targetField: 'terms_and_conditions', recognized: true };
  }
  if (c === 'notes' || c === 'note' || c === 'remarks' || normalized.startsWith('revised plans')) {
    return { targetField: 'notes', recognized: true };
  }
  if (c === 'status' || c === 'isactive' || c === 'active' || c === 'availability') {
    return { targetField: 'status', recognized: true };
  }

  // WHMCS Feed columns (explicit suffix)
  if (normalized.includes('whmcs')) {
    const withoutWhmcs = normalized.replace(/whmcs(\s*feed)?/g, '').trim();
    const tenure = detectTenureToken(withoutWhmcs);
    if (tenure) {
      return { targetField: TOTAL_TENURE_TARGETS[tenure], recognized: true };
    }
  }

  return null;
}

/**
 * Scores a candidate row to find the true table header row, skipping pre-header PRICING (...) banners.
 */
function detectHeaderRowIndex(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 15);
  let bestRowIdx = 0;
  let bestScore = -1;

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] || [];
    const nonEmptyCells = row
      .map((c) => String(c ?? '').trim())
      .filter((s) => s.length > 0);
    if (nonEmptyCells.length === 0) continue;

    // Banner rows typically start with PRICING (...) and have very few populated cells
    const firstNonEmpty = nonEmptyCells[0];
    if (/^pricing\s*\(/i.test(firstNonEmpty) && nonEmptyCells.length <= 3) {
      continue;
    }

    let score = 0;
    for (const raw of nonEmptyCells) {
      const norm = normalizeHeaderText(raw);
      if (!norm) continue;
      if (isPlanNameSynonym(norm)) score += 4;
      else if (isBaseMonthlySynonym(norm)) score += 3;
      else if (norm.includes('whmcs')) score += 3;
      else if (detectTenureToken(norm)) score += 3;
      else if (matchSingleColumnCore(raw, norm)) score += 2;
      else if (matchStandardSpec(raw, norm)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  return bestRowIdx;
}

function trimTrailingEmptyRows(matrix: unknown[][]): unknown[][] {
  let end = matrix.length - 1;
  while (end >= 0) {
    const row = matrix[end] || [];
    if (row.some((cell) => String(cell ?? '').trim().length > 0)) {
      break;
    }
    end--;
  }
  return end < 0 ? [] : matrix.slice(0, end + 1);
}

/**
 * Analyzes all header cells on a worksheet using positional rules:
 * - Duplicate "Plan Name": 1st -> series, 2nd -> plan_name
 * - Tenure blocks: 1st block -> price_*, WHMCS Feed or 2nd block -> total_*
 * - Positional numeric header anomaly (e.g., 18719.52 between Semi-Annually WHMCS Feed & Biennially WHMCS Feed) -> total_annually + warning
 * - Known spec columns -> standard specKey + recognized: true
 */
function analyzeSheetHeaders(
  rawHeaderRow: unknown[],
  sheetName: string
): {
  mappings: ColumnMappingEntry[];
  headers: string[];
  unrecognizedColumns: string[];
  sheetWarnings: string[];
} {
  const sheetWarnings: string[] = [];
  const nonEmptyCols: Array<{ columnIndex: number; raw: string; norm: string }> = [];

  for (let colIdx = 0; colIdx < rawHeaderRow.length; colIdx++) {
    const raw = String(rawHeaderRow[colIdx] ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!raw) continue;
    nonEmptyCols.push({
      columnIndex: colIdx,
      raw,
      norm: normalizeHeaderText(raw),
    });
  }

  // Count plan-name-like columns for duplicate header disambiguation
  const planNameIndices = nonEmptyCols
    .filter((c) => isPlanNameSynonym(c.norm))
    .map((c) => c.columnIndex);

  const seenPriceTenures = new Set<BillingCycle>();
  let enteredTotalBlock = false;

  const mappings: ColumnMappingEntry[] = [];

  for (const col of nonEmptyCols) {
    // Handle duplicate "Plan Name": 1st -> series, 2nd -> plan_name
    if (isPlanNameSynonym(col.norm)) {
      if (planNameIndices.length >= 2 && col.columnIndex === planNameIndices[0]) {
        mappings.push({
          columnIndex: col.columnIndex,
          excelColumn: col.raw,
          normalizedHeader: col.norm,
          targetField: 'series',
          recognized: true,
        });
      } else {
        mappings.push({
          columnIndex: col.columnIndex,
          excelColumn: col.raw,
          normalizedHeader: col.norm,
          targetField: 'plan_name',
          recognized: true,
        });
      }
      continue;
    }

    const core = matchSingleColumnCore(col.raw, col.norm);
    if (core) {
      if (core.targetField.startsWith('total_')) {
        enteredTotalBlock = true;
      }
      mappings.push({
        columnIndex: col.columnIndex,
        excelColumn: col.raw,
        normalizedHeader: col.norm,
        targetField: core.targetField,
        recognized: true,
      });
      continue;
    }

    const tenure = detectTenureToken(col.norm);
    if (tenure) {
      let targetField: TargetFieldType;
      if (enteredTotalBlock || seenPriceTenures.has(tenure)) {
        targetField = TOTAL_TENURE_TARGETS[tenure];
        enteredTotalBlock = true;
      } else {
        targetField = PRICE_TENURE_TARGETS[tenure];
        seenPriceTenures.add(tenure);
      }
      mappings.push({
        columnIndex: col.columnIndex,
        excelColumn: col.raw,
        normalizedHeader: col.norm,
        targetField,
        recognized: true,
      });
      continue;
    }

    // Check standard specs
    const stdSpecKey = matchStandardSpec(col.raw, col.norm);
    if (stdSpecKey) {
      mappings.push({
        columnIndex: col.columnIndex,
        excelColumn: col.raw,
        normalizedHeader: col.norm,
        targetField: 'specification',
        specKey: stdSpecKey,
        specLabel: col.raw,
        recognized: true,
      });
      continue;
    }

    // Defer pure numeric header anomalies to positional recovery pass
    if (isPureNumericHeader(col.raw)) {
      mappings.push({
        columnIndex: col.columnIndex,
        excelColumn: col.raw,
        normalizedHeader: col.norm,
        targetField: 'ignore',
        recognized: false,
      });
      continue;
    }

    // Truly unrecognized custom column -> dynamic specification
    mappings.push({
      columnIndex: col.columnIndex,
      excelColumn: col.raw,
      normalizedHeader: col.norm,
      targetField: 'specification',
      specKey: slugifySpecKey(col.raw),
      specLabel: col.raw,
      recognized: false,
    });
  }

  // Second pass: positional recovery for numeric header cells (e.g. Plesk Hosting 18719.52)
  const totalOrder: TargetFieldType[] = TENURE_LIST.map((t) => TOTAL_TENURE_TARGETS[t]);
  const priceOrder: TargetFieldType[] = TENURE_LIST.map((t) => PRICE_TENURE_TARGETS[t]);

  for (let i = 0; i < mappings.length; i++) {
    const m = mappings[i];
    if (!isPureNumericHeader(m.excelColumn)) continue;

    const prevTarget = i > 0 ? mappings[i - 1].targetField : null;
    const nextTarget = i + 1 < mappings.length ? mappings[i + 1].targetField : null;

    let inferredTarget: TargetFieldType | null = null;
    const prevTotalIdx = prevTarget ? totalOrder.indexOf(prevTarget) : -1;
    const nextTotalIdx = nextTarget ? totalOrder.indexOf(nextTarget) : -1;

    if (prevTotalIdx !== -1 && prevTotalIdx + 1 < totalOrder.length) {
      inferredTarget = totalOrder[prevTotalIdx + 1];
    } else if (nextTotalIdx > 0) {
      inferredTarget = totalOrder[nextTotalIdx - 1];
    } else {
      const prevPriceIdx = prevTarget ? priceOrder.indexOf(prevTarget) : -1;
      const nextPriceIdx = nextTarget ? priceOrder.indexOf(nextTarget) : -1;
      if (prevPriceIdx !== -1 && prevPriceIdx + 1 < priceOrder.length) {
        inferredTarget = priceOrder[prevPriceIdx + 1];
      } else if (nextPriceIdx > 0) {
        inferredTarget = priceOrder[nextPriceIdx - 1];
      }
    }

    if (inferredTarget) {
      const warning = `Sheet "${sheetName}": Numeric header "${m.excelColumn}" was detected by position (${
        prevTarget || 'start'
      } → ${nextTarget || 'end'}) and auto-mapped as "${inferredTarget}".`;
      m.targetField = inferredTarget;
      m.recognized = true;
      m.warning = warning;
      sheetWarnings.push(warning);
    } else {
      const warning = `Sheet "${sheetName}": Numeric header "${m.excelColumn}" could not be matched to a price tenure and was ignored.`;
      m.targetField = 'ignore';
      m.recognized = true;
      m.warning = warning;
      sheetWarnings.push(warning);
    }
  }

  const unrecognizedColumns = mappings
    .filter((m) => !m.recognized)
    .map((m) => m.excelColumn);

  return {
    mappings,
    headers: mappings.map((m) => m.excelColumn),
    unrecognizedColumns,
    sheetWarnings,
  };
}

export function inspectWorkbookBuffer(
  buffer: Buffer
): { worksheets: WorksheetSummary[]; unrecognizedColumns: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheets: WorksheetSummary[] = [];
  const unrecognizedSet = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    const matrix = trimTrailingEmptyRows(rawMatrix);
    if (matrix.length === 0) continue;

    const headerRowIdx = detectHeaderRowIndex(matrix);
    const headerRow = matrix[headerRowIdx] || [];

    const analyzed = analyzeSheetHeaders(headerRow, sheetName);
    if (analyzed.mappings.length === 0) continue;

    const isSummary = isSummarySheetName(sheetName);
    if (!isSummary) {
      for (const col of analyzed.unrecognizedColumns) {
        unrecognizedSet.add(col);
      }
    }

    const dataRows = matrix
      .slice(headerRowIdx + 1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0));

    const sampleRows = dataRows.slice(0, 4).map((row) => {
      const obj: Record<string, string> = {};
      for (const m of analyzed.mappings) {
        obj[`col_${m.columnIndex}`] = String(row[m.columnIndex] ?? '').trim();
        if (!(m.excelColumn in obj)) {
          obj[m.excelColumn] = String(row[m.columnIndex] ?? '').trim();
        }
      }
      return obj;
    });

    worksheets.push({
      sheetName,
      defaultSelected: !isSummary,
      isSummarySheet: isSummary,
      headerRowIndex: headerRowIdx + 1,
      rowCount: dataRows.length,
      headers: analyzed.headers,
      suggestedMappings: analyzed.mappings,
      sampleRows,
      sheetWarnings: analyzed.sheetWarnings,
    });
  }

  return {
    worksheets,
    unrecognizedColumns: Array.from(unrecognizedSet),
  };
}

function cleanCurrencyNumber(raw: string): {
  value: number | null;
  invalid: boolean;
} {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === '-' ||
    trimmed === '--' ||
    trimmed === '—' ||
    /^n\/?a$/i.test(trimmed) ||
    /^not\s*available$/i.test(trimmed)
  ) {
    return { value: null, invalid: false };
  }

  if (/^free$/i.test(trimmed)) {
    return { value: 0, invalid: false };
  }

  const normalized = trimmed
    .replace(/[₹$€£,\s]/g, '')
    .replace(/\/(mo|month|yr|year|2yr|3yr)$/i, '');

  if (!normalized || normalized === '-') {
    return { value: null, invalid: false };
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    return { value: null, invalid: true };
  }

  return { value: parsed, invalid: false };
}

/**
 * Parses a tenure cell which may be:
 * - "-" or blank -> { monthlyRate: null, totalPrice: null }
 * - "₹14,273.28" -> { singleValue: 14273.28 }
 * - "4699/14097" or "99/594" or "3999/47988" -> { monthlyRate: 4699, totalPrice: 14097, isSlashPair: true }
 */
export function parseTenureCell(raw: string): {
  monthlyRate: number | null;
  totalPrice: number | null;
  singleValue: number | null;
  isSlashPair: boolean;
  invalid: boolean;
} {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === '-' ||
    trimmed === '--' ||
    trimmed === '—' ||
    /^n\/?a$/i.test(trimmed) ||
    /^not\s*available$/i.test(trimmed)
  ) {
    return {
      monthlyRate: null,
      totalPrice: null,
      singleValue: null,
      isSlashPair: false,
      invalid: false,
    };
  }

  // Handle "4699/14097" (per-month rate / total price), ignoring trailing "/mo"
  if (trimmed.includes('/') && !/\/(mo|month|yr|year|2yr|3yr)$/i.test(trimmed)) {
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const left = cleanCurrencyNumber(parts[0]);
      const right = cleanCurrencyNumber(parts[1]);
      if (!left.invalid && !right.invalid && (left.value !== null || right.value !== null)) {
        return {
          monthlyRate: left.value,
          totalPrice: right.value,
          singleValue: left.value,
          isSlashPair: true,
          invalid: false,
        };
      }
    }
  }

  const single = cleanCurrencyNumber(trimmed);
  return {
    monthlyRate: single.value,
    totalPrice: null,
    singleValue: single.value,
    isSlashPair: false,
    invalid: single.invalid,
  };
}

export function parsePriceValue(raw: string): {
  value: number | null;
  invalid: boolean;
} {
  return cleanCurrencyNumber(raw);
}

function parsePercentageValue(raw: string): {
  value: number | null;
  invalid: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || /^n\/?a$/i.test(trimmed)) {
    return { value: null, invalid: false };
  }
  const normalized = trimmed.replace(/[%\s]/g, '');
  const parsed = Number(normalized);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { value: null, invalid: true };
  }
  return { value: parsed, invalid: false };
}

function parseOffersFromCell(raw: string, startOrder: number): PlanOfferItem[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || /^n\/?a$/i.test(trimmed)) {
    return [];
  }

  const parts = trimmed
    .split(/\r?\n|\s*;\s*|\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((entry, idx) => {
    const costMatch = entry.match(
      /\((?:cost|value)\s*:\s*[₹$€£]?\s*([0-9,]+(?:\.[0-9]+)?)\)/i
    );
    const freeValueMatch = entry.match(
      /\(free\s*,\s*value\s*:\s*[₹$€£]?\s*([0-9,]+(?:\.[0-9]+)?)\)/i
    );

    let marketValue: number | null = null;
    if (freeValueMatch) {
      marketValue = Number(freeValueMatch[1].replace(/,/g, ''));
    } else if (costMatch) {
      marketValue = Number(costMatch[1].replace(/,/g, ''));
    }

    return {
      title: entry,
      description: null,
      marketValue: marketValue !== null && !Number.isNaN(marketValue) ? marketValue : null,
      offerPrice: /\bfree\b/i.test(entry) ? 0 : null,
      isActive: true,
      sortOrder: startOrder + idx,
    };
  });
}

function buildEmptyCycleMap<T>(init: () => T): Record<BillingCycle, T> {
  return {
    monthly: init(),
    quarterly: init(),
    semiannually: init(),
    annually: init(),
    biennially: init(),
    triennially: init(),
  };
}

export async function generateImportPreview(params: {
  buffer: Buffer;
  filename: string;
  selectedSheets: string[];
  sheetMappings: Record<string, ColumnMappingEntry[]>;
  importMode: ImportMode;
  targetCategory: string | null;
}): Promise<ImportPreviewResult> {
  const workbook = XLSX.read(params.buffer, { type: 'buffer' });
  const existingPlans = await fetchAllPlans({ activeOnly: false });
  const existingByKey = new Map(existingPlans.map((p) => [p.normalizedKey, p]));

  const rows: ImportPreviewRow[] = [];
  const seenInWorkbook = new Map<string, ImportPreviewRow>();
  const ignoredSet = new Set<string>();
  const workbookWarnings: string[] = [];

  for (const sheetName of params.selectedSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    const matrix = trimTrailingEmptyRows(rawMatrix);
    if (matrix.length < 2) continue;

    const headerRowIdx = detectHeaderRowIndex(matrix);
    const headerRow = matrix[headerRowIdx] || [];
    const analyzed = analyzeSheetHeaders(headerRow, sheetName);
    workbookWarnings.push(...analyzed.sheetWarnings);

    const mappings =
      params.sheetMappings[sheetName] && params.sheetMappings[sheetName].length > 0
        ? params.sheetMappings[sheetName]
        : analyzed.mappings;

    for (const m of mappings) {
      if (m.targetField === 'ignore') {
        ignoredSet.add(m.excelColumn);
      }
    }

    let lastPlanRowInSheet: ImportPreviewRow | null = null;

    for (let rIdx = headerRowIdx + 1; rIdx < matrix.length; rIdx++) {
      const rawRow = matrix[rIdx] || [];
      const hasAnyValue = rawRow.some((cell) => String(cell ?? '').trim().length > 0);
      if (!hasAnyValue) continue;

      let series: string | null = null;
      let planName = '';
      let categoryName = params.targetCategory?.trim() || sheetName;
      let shortDescription: string | null = null;
      let fullDescription: string | null = null;
      let notes: string | null = null;
      let termsAndConditions: string | null = null;
      let isActive = true;

      let baseMonthlyPrice: number | null = null;
      let originalVal: number | null = null;
      let discountedVal: number | null = null;
      let discountPct: number | null = null;

      const rateByCycle = buildEmptyCycleMap<number | null>(() => null);
      const totalByCycle = buildEmptyCycleMap<number | null>(() => null);

      const specifications: PlanSpecItem[] = [];
      const offers: PlanOfferItem[] = [];
      const warnings: string[] = [];
      const errors: string[] = [];
      const missingFields: string[] = [];

      let numericPriceCount = 0;

      for (const mapping of mappings) {
        const cellText = String(rawRow[mapping.columnIndex] ?? '').trim();
        if (!cellText || mapping.targetField === 'ignore') continue;

        switch (mapping.targetField) {
          case 'series':
            series = cellText;
            break;
          case 'plan_name':
            planName = cellText;
            break;
          case 'category':
            categoryName = cellText;
            break;
          case 'short_description':
            shortDescription = cellText;
            break;
          case 'full_description':
            fullDescription = cellText;
            break;
          case 'notes':
            notes = notes ? `${notes}; ${cellText}` : cellText;
            break;
          case 'terms_and_conditions':
            termsAndConditions = cellText;
            break;
          case 'status':
            isActive = !/^(inactive|disabled|false|no|0|archived)$/i.test(cellText);
            break;
          case 'base_monthly_price': {
            const parsed = cleanCurrencyNumber(cellText);
            if (parsed.invalid) {
              errors.push(`Invalid Base Monthly Price: "${cellText}"`);
            } else if (parsed.value !== null) {
              baseMonthlyPrice = parsed.value;
              numericPriceCount++;
            }
            break;
          }
          case 'price_monthly':
          case 'price_quarterly':
          case 'price_semiannually':
          case 'price_annually':
          case 'price_biennially':
          case 'price_triennially': {
            const cycle = mapping.targetField.replace('price_', '') as BillingCycle;
            const parsed = parseTenureCell(cellText);
            if (parsed.invalid) {
              errors.push(`Invalid ${cycle} price: "${cellText}"`);
            } else if (parsed.isSlashPair) {
              if (parsed.monthlyRate !== null) {
                rateByCycle[cycle] = parsed.monthlyRate;
                numericPriceCount++;
              }
              if (parsed.totalPrice !== null && totalByCycle[cycle] === null) {
                totalByCycle[cycle] = parsed.totalPrice;
                numericPriceCount++;
              }
            } else if (parsed.singleValue !== null) {
              rateByCycle[cycle] = parsed.singleValue;
              numericPriceCount++;
            }
            break;
          }
          case 'total_monthly':
          case 'total_quarterly':
          case 'total_semiannually':
          case 'total_annually':
          case 'total_biennially':
          case 'total_triennially': {
            const cycle = mapping.targetField.replace('total_', '') as BillingCycle;
            const parsed = parseTenureCell(cellText);
            if (parsed.invalid) {
              errors.push(`Invalid ${cycle} WHMCS total: "${cellText}"`);
            } else if (parsed.isSlashPair) {
              if (parsed.monthlyRate !== null && rateByCycle[cycle] === null) {
                rateByCycle[cycle] = parsed.monthlyRate;
                numericPriceCount++;
              }
              if (parsed.totalPrice !== null) {
                totalByCycle[cycle] = parsed.totalPrice;
                numericPriceCount++;
              }
            } else if (parsed.singleValue !== null) {
              totalByCycle[cycle] = parsed.singleValue;
              numericPriceCount++;
            }
            break;
          }
          case 'original_price': {
            const parsed = cleanCurrencyNumber(cellText);
            if (parsed.invalid) errors.push(`Invalid Original Price: "${cellText}"`);
            else if (parsed.value !== null) {
              originalVal = parsed.value;
              numericPriceCount++;
            }
            break;
          }
          case 'discounted_price': {
            const parsed = cleanCurrencyNumber(cellText);
            if (parsed.invalid) errors.push(`Invalid Discounted Price: "${cellText}"`);
            else if (parsed.value !== null) {
              discountedVal = parsed.value;
              numericPriceCount++;
            }
            break;
          }
          case 'discount_percentage': {
            const parsed = parsePercentageValue(cellText);
            if (parsed.invalid) errors.push(`Invalid Discount %: "${cellText}"`);
            else discountPct = parsed.value;
            break;
          }
          case 'special_offers':
          case 'free_addons':
          case 'additional_benefits': {
            const parsedOffers = parseOffersFromCell(cellText, offers.length);
            offers.push(...parsedOffers);
            break;
          }
          case 'specification': {
            const label = (mapping.specLabel || mapping.excelColumn).trim();
            specifications.push({
              specKey: mapping.specKey ?? slugifySpecKey(label),
              label,
              value: cellText,
              sortOrder: specifications.length,
            });
            break;
          }
        }
      }

      // 1) Detect GST-inclusive follow-up row (blank Plan Name or explicit GST marker + numbers in WHMCS Feed / price columns)
      const isExplicitGstLabel =
        /^(?:with\s*)?gst(?:\s*(?:incl(?:usive)?|included|total))?$/i.test(planName);
      if (!planName || (isExplicitGstLabel && specifications.length === 0)) {
        const hasGstNumbers = TENURE_LIST.some(
          (c) =>
            (totalByCycle[c] !== null && (totalByCycle[c] ?? 0) > 0) ||
            (rateByCycle[c] !== null && (rateByCycle[c] ?? 0) > 0)
        );
        const matchesLastSeries =
          !series ||
          /gst/i.test(series) ||
          (lastPlanRowInSheet?.series || '').trim().toLowerCase() ===
            series.trim().toLowerCase();

        if (
          hasGstNumbers &&
          lastPlanRowInSheet &&
          specifications.length === 0 &&
          matchesLastSeries
        ) {
          for (const cycle of TENURE_LIST) {
            const gstVal = totalByCycle[cycle] ?? rateByCycle[cycle];
            if (gstVal !== null && gstVal > 0) {
              const targetEntry = lastPlanRowInSheet.pricing.find(
                (p) => p.billingCycle === cycle
              );
              if (targetEntry) {
                targetEntry.gstInclusiveTotal = gstVal;
              }
            }
          }
        }
        // Never create a separate plan or error row from blank Plan Name / GST rows
        continue;
      }

      // 2) Skip banner rows such as "PRICING (Till 15 DEC 2025)" or "PRICING (April 2026)..."
      if (numericPriceCount === 0 && (/^pricing\s*\(/i.test(planName) || specifications.length === 0)) {
        continue;
      }
      if (numericPriceCount === 0) {
        // Any row with a Plan Name cell but zero numeric price across all pricing columns is a banner/section row
        continue;
      }

      // Attach series as a spec badge if present, while also keeping plan.series
      if (series && !specifications.some((s) => s.specKey === 'series')) {
        specifications.unshift({
          specKey: 'series',
          label: 'Series',
          value: series,
          sortOrder: 0,
        });
        specifications.forEach((s, idx) => {
          s.sortOrder = idx;
        });
      }

      // Fallback monthly rate from Base Monthly Price if monthly cell was empty
      if (rateByCycle.monthly === null && baseMonthlyPrice !== null && baseMonthlyPrice > 0) {
        rateByCycle.monthly = baseMonthlyPrice;
      }

      // Build all 6 tenure records (preserving null where "-" or blank)
      const pricing: PlanPricingItem[] = TENURE_LIST.map((cycle) => {
        const months = CYCLE_META[cycle].months;
        const rawRate = rateByCycle[cycle];
        const rawTotal = totalByCycle[cycle];
        const resolvedRate =
          rawRate !== null
            ? rawRate
            : rawTotal !== null && rawTotal > 0 && months > 0
              ? Math.round((rawTotal / months) * 100) / 100
              : null;

        return {
          billingCycle: cycle,
          originalPrice:
            cycle === 'monthly' &&
            originalVal === null &&
            baseMonthlyPrice !== null &&
            resolvedRate !== null &&
            baseMonthlyPrice > resolvedRate
              ? baseMonthlyPrice
              : null,
          currentPrice: resolvedRate,
          totalPrice: rawTotal,
          gstInclusiveTotal: null,
          discountPercentage: null,
          discountedPrice: null,
          specialOfferPrice: null,
          taxMode: 'default',
        };
      });

      // Apply spreadsheet-level discount fields if supplied
      const pricedItems = pricing.filter((p) => hasPricingValue(p));
      if (
        pricedItems.length > 0 &&
        (originalVal !== null || discountedVal !== null || discountPct !== null)
      ) {
        const targetCycle =
          pricedItems.find((p) => p.billingCycle === 'annually') ??
          pricedItems.find((p) => p.billingCycle === 'monthly') ??
          pricedItems[0];

        if (originalVal !== null && originalVal > 0) {
          targetCycle.originalPrice = originalVal;
        }
        const base =
          targetCycle.originalPrice ?? targetCycle.currentPrice ?? targetCycle.totalPrice ?? 0;
        if (discountPct !== null && discountPct > 0 && base > 0) {
          targetCycle.discountPercentage = discountPct;
          targetCycle.discountedPrice =
            discountedVal !== null
              ? discountedVal
              : Number((base * (1 - discountPct / 100)).toFixed(2));
        } else if (discountedVal !== null && discountedVal > 0) {
          targetCycle.discountedPrice = discountedVal;
          if (base > discountedVal) {
            targetCycle.discountPercentage = Number(
              (((base - discountedVal) / base) * 100).toFixed(2)
            );
          }
        }
      }

      const normalizedKey = buildNormalizedKey(categoryName, planName);
      const prevInWorkbook = seenInWorkbook.get(normalizedKey) ?? null;
      const existing = existingByKey.get(normalizedKey) ?? null;

      let action: ImportPreviewRow['action'] =
        existing || prevInWorkbook ? 'update' : 'create';

      if (prevInWorkbook) {
        warnings.push(
          'Duplicate Plan Name + Category within uploaded workbook — later row will update earlier row'
        );
      }

      if (errors.length > 0) {
        action = 'error';
      } else if (params.importMode === 'add_new' && (existing || prevInWorkbook)) {
        action = 'skip';
        warnings.push(
          existing
            ? 'Skipped because plan already exists (Add New mode)'
            : 'Skipped duplicate Plan Name + Category in workbook (Add New mode)'
        );
      }

      const referenceForDiff = existing ?? prevInWorkbook;
      const priceChanges: ImportPreviewRow['priceChanges'] = [];
      if (referenceForDiff) {
        for (const p of pricing) {
          const prev = referenceForDiff.pricing.find(
            (ep) => normalizeBillingCycle(ep.billingCycle) === p.billingCycle
          );
          const nextVal = p.currentPrice ?? p.totalPrice ?? null;
          const prevVal = prev ? prev.currentPrice ?? prev.totalPrice ?? null : null;
          if (nextVal !== null && prevVal !== nextVal) {
            priceChanges.push({
              billingCycle: p.billingCycle,
              previousPrice: prevVal,
              newPrice: nextVal,
            });
          }
        }
      }

      const previewRow: ImportPreviewRow = {
        rowIndex: rIdx + 1,
        sheetName,
        action,
        selected: action === 'create' || action === 'update',
        existingPlanId: existing ? existing.id : null,
        series,
        planName,
        categoryName,
        baseMonthlyPrice,
        shortDescription,
        fullDescription,
        notes,
        termsAndConditions,
        isActive,
        specifications,
        pricing,
        offers,
        warnings,
        errors,
        missingFields,
        priceChanges,
      };

      seenInWorkbook.set(normalizedKey, previewRow);
      rows.push(previewRow);
      lastPlanRowInSheet = previewRow;
    }
  }

  return {
    filename: params.filename,
    importMode: params.importMode,
    targetCategory: params.targetCategory,
    selectedSheets: params.selectedSheets,
    unmappedColumns: Array.from(ignoredSet),
    warnings: Array.from(new Set(workbookWarnings)),
    totalDetected: rows.length,
    createCount: rows.filter((r) => r.action === 'create').length,
    updateCount: rows.filter((r) => r.action === 'update').length,
    skipCount: rows.filter((r) => r.action === 'skip').length,
    errorCount: rows.filter((r) => r.action === 'error').length,
    warningCount: rows.filter((r) => r.warnings.length > 0).length,
    rows,
  };
}

export async function commitExcelImport(params: {
  filename: string;
  worksheetNames: string[];
  importMode: ImportMode;
  targetCategory: string | null;
  rows: ImportPreviewRow[];
  uploadedBy: string;
  uploadedByEmail: string;
}): Promise<{
  importRecordId: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}> {
  const existingPlans = await fetchAllPlans({ activeOnly: false });
  const existingByKey = new Map<string, HostingPlanFull>(
    existingPlans.map((p) => [p.normalizedKey, p])
  );
  const categoryCache = new Map<string, { id: number; name: string }>();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const importedKeys = new Set<string>();

  const importRecordId = await db.transaction(async (tx) => {
    for (const row of params.rows) {
      if (
        !row.selected ||
        row.action === 'skip' ||
        row.action === 'error' ||
        !row.planName.trim()
      ) {
        skippedCount++;
        continue;
      }

      const categoryKey = (row.categoryName.trim() || 'Other Services').toLowerCase();
      let category = categoryCache.get(categoryKey);
      if (!category) {
        category = await ensureCategoryByName(row.categoryName);
        categoryCache.set(categoryKey, category);
      }

      const normalizedKey = buildNormalizedKey(category.name, row.planName);
      importedKeys.add(normalizedKey);
      const existing = existingByKey.get(normalizedKey);

      if (existing && params.importMode === 'add_new') {
        skippedCount++;
        continue;
      }

      const dedupedPricingMap = new Map<BillingCycle, PlanPricingItem>();
      for (const p of row.pricing) {
        const cycle = normalizeBillingCycle(p.billingCycle);
        dedupedPricingMap.set(cycle, {
          ...p,
          billingCycle: cycle,
        });
      }
      const normalizedPricing = Array.from(dedupedPricingMap.values());

      if (!existing) {
        const inserted = await tx
          .insert(hostingPlans)
          .values({
            categoryId: category.id,
            categoryName: category.name,
            series: row.series?.trim() || null,
            name: row.planName.trim(),
            normalizedKey,
            baseMonthlyPrice: row.baseMonthlyPrice ?? null,
            shortDescription: row.shortDescription,
            fullDescription: row.fullDescription,
            notes: row.notes,
            termsAndConditions: row.termsAndConditions,
            taxDisplayOverride: 'default',
            isActive: row.isActive,
            sourceFilename: params.filename,
            updatedBy: params.uploadedByEmail,
          })
          .returning();

        const plan = inserted[0];

        if (row.specifications.length > 0) {
          await tx.insert(planSpecifications).values(
            row.specifications.map((s, idx) => ({
              planId: plan.id,
              specKey: s.specKey ?? slugifySpecKey(s.label),
              label: s.label.trim(),
              value: s.value.trim(),
              sortOrder: idx,
            }))
          );
        }

        if (normalizedPricing.length > 0) {
          await tx.insert(planPricing).values(
            normalizedPricing.map((p) => ({
              planId: plan.id,
              billingCycle: p.billingCycle,
              originalPrice: p.originalPrice ?? null,
              currentPrice: p.currentPrice ?? null,
              totalPrice: p.totalPrice ?? null,
              gstInclusiveTotal: p.gstInclusiveTotal ?? null,
              discountPercentage: p.discountPercentage ?? null,
              discountedPrice: p.discountedPrice ?? null,
              specialOfferPrice: p.specialOfferPrice ?? null,
              taxMode: p.taxMode || 'default',
            }))
          );

          const priced = normalizedPricing.filter((p) => hasPricingValue(p));
          if (priced.length > 0) {
            await tx.insert(pricingHistory).values(
              priced.map((p) => ({
                planId: plan.id,
                planName: plan.name,
                categoryName: plan.categoryName,
                billingCycle: p.billingCycle,
                previousPrice: null,
                newPrice: p.currentPrice ?? p.totalPrice ?? null,
                previousDiscountedPrice: null,
                newDiscountedPrice: p.discountedPrice ?? null,
                changeType: 'created',
                sourceFilename: params.filename,
                updatedBy: params.uploadedByEmail,
              }))
            );
          }
        }

        if (row.offers.length > 0) {
          await tx.insert(planOffers).values(
            row.offers.map((o, idx) => ({
              planId: plan.id,
              title: o.title.trim(),
              description: o.description ?? null,
              marketValue: o.marketValue ?? null,
              offerPrice: o.offerPrice ?? null,
              isActive: o.isActive ?? true,
              sortOrder: idx,
            }))
          );
        }

        await tx.insert(planChangeLogs).values({
          planId: plan.id,
          planName: plan.name,
          changeScope: 'plan',
          summary: `Imported new plan from ${params.filename}`,
          previousSnapshot: null,
          newSnapshot: {
            categoryName: plan.categoryName,
            series: plan.series,
            specsCount: row.specifications.length,
            pricingCount: normalizedPricing.filter((p) => hasPricingValue(p)).length,
            offersCount: row.offers.length,
          },
          sourceFilename: params.filename,
          updatedBy: params.uploadedByEmail,
        });

        existingByKey.set(normalizedKey, {
          id: plan.id,
          categoryId: plan.categoryId,
          categoryName: plan.categoryName,
          series: plan.series ?? null,
          name: plan.name,
          normalizedKey: plan.normalizedKey,
          baseMonthlyPrice: plan.baseMonthlyPrice ?? null,
          shortDescription: plan.shortDescription,
          fullDescription: plan.fullDescription,
          notes: plan.notes,
          termsAndConditions: plan.termsAndConditions,
          taxDisplayOverride: (plan.taxDisplayOverride || 'default') as TaxDisplayMode,
          isActive: plan.isActive,
          sourceFilename: plan.sourceFilename,
          updatedBy: plan.updatedBy,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
          specifications: row.specifications.map((s, idx) => ({
            ...s,
            specKey: s.specKey ?? slugifySpecKey(s.label),
            sortOrder: idx,
          })),
          pricing: normalizedPricing,
          offers: row.offers,
        });

        createdCount++;
      } else {
        await tx
          .update(hostingPlans)
          .set({
            categoryId: category.id,
            categoryName: category.name,
            series: row.series !== undefined ? row.series?.trim() || null : existing.series,
            name: row.planName.trim(),
            baseMonthlyPrice:
              row.baseMonthlyPrice !== undefined
                ? row.baseMonthlyPrice
                : existing.baseMonthlyPrice,
            shortDescription: row.shortDescription ?? existing.shortDescription,
            fullDescription: row.fullDescription ?? existing.fullDescription,
            notes: row.notes ?? existing.notes,
            termsAndConditions: row.termsAndConditions ?? existing.termsAndConditions,
            isActive: row.isActive,
            sourceFilename: params.filename,
            updatedBy: params.uploadedByEmail,
            updatedAt: new Date(),
          })
          .where(eq(hostingPlans.id, existing.id));

        if (row.specifications.length > 0) {
          await tx
            .delete(planSpecifications)
            .where(eq(planSpecifications.planId, existing.id));
          await tx.insert(planSpecifications).values(
            row.specifications.map((s, idx) => ({
              planId: existing.id,
              specKey: s.specKey ?? slugifySpecKey(s.label),
              label: s.label.trim(),
              value: s.value.trim(),
              sortOrder: idx,
            }))
          );
        }

        if (normalizedPricing.length > 0) {
          const oldPricingMap = new Map(
            existing.pricing.map((p) => [normalizeBillingCycle(p.billingCycle), p])
          );
          const mergedPricing = new Map(oldPricingMap);
          const historyInserts: Array<{
            planId: number;
            planName: string;
            categoryName: string;
            billingCycle: string;
            previousPrice: number | null;
            newPrice: number | null;
            previousDiscountedPrice: number | null;
            newDiscountedPrice: number | null;
            changeType: string;
            sourceFilename: string | null;
            updatedBy: string;
          }> = [];

          for (const next of normalizedPricing) {
            const prev = oldPricingMap.get(next.billingCycle);
            const prevPrice = prev ? prev.currentPrice ?? prev.totalPrice ?? null : null;
            const nextPrice = next.currentPrice ?? next.totalPrice ?? null;

            if (!hasPricingValue(prev) && hasPricingValue(next)) {
              historyInserts.push({
                planId: existing.id,
                planName: row.planName.trim(),
                categoryName: category.name,
                billingCycle: next.billingCycle,
                previousPrice: null,
                newPrice: nextPrice,
                previousDiscountedPrice: null,
                newDiscountedPrice: next.discountedPrice ?? null,
                changeType: 'created',
                sourceFilename: params.filename,
                updatedBy: params.uploadedByEmail,
              });
            } else if (
              prev &&
              (prev.currentPrice !== next.currentPrice ||
                prev.totalPrice !== next.totalPrice ||
                prev.gstInclusiveTotal !== next.gstInclusiveTotal ||
                prev.discountedPrice !== next.discountedPrice ||
                prev.discountPercentage !== next.discountPercentage)
            ) {
              historyInserts.push({
                planId: existing.id,
                planName: row.planName.trim(),
                categoryName: category.name,
                billingCycle: next.billingCycle,
                previousPrice: prevPrice,
                newPrice: nextPrice,
                previousDiscountedPrice: prev.discountedPrice ?? null,
                newDiscountedPrice: next.discountedPrice ?? null,
                changeType: 'updated',
                sourceFilename: params.filename,
                updatedBy: params.uploadedByEmail,
              });
            }
            mergedPricing.set(next.billingCycle, next);
          }

          if (historyInserts.length > 0) {
            await tx.insert(pricingHistory).values(historyInserts);
          }

          await tx.delete(planPricing).where(eq(planPricing.planId, existing.id));
          await tx.insert(planPricing).values(
            Array.from(mergedPricing.values()).map((p) => ({
              planId: existing.id,
              billingCycle: p.billingCycle,
              originalPrice: p.originalPrice ?? null,
              currentPrice: p.currentPrice ?? null,
              totalPrice: p.totalPrice ?? null,
              gstInclusiveTotal: p.gstInclusiveTotal ?? null,
              discountPercentage: p.discountPercentage ?? null,
              discountedPrice: p.discountedPrice ?? null,
              specialOfferPrice: p.specialOfferPrice ?? null,
              taxMode: p.taxMode || 'default',
            }))
          );
        }

        if (row.offers.length > 0) {
          await tx.delete(planOffers).where(eq(planOffers.planId, existing.id));
          await tx.insert(planOffers).values(
            row.offers.map((o, idx) => ({
              planId: existing.id,
              title: o.title.trim(),
              description: o.description ?? null,
              marketValue: o.marketValue ?? null,
              offerPrice: o.offerPrice ?? null,
              isActive: o.isActive ?? true,
              sortOrder: idx,
            }))
          );
        }

        await tx.insert(planChangeLogs).values({
          planId: existing.id,
          planName: row.planName.trim(),
          changeScope: 'excel_import',
          summary: `Updated plan from Excel import (${params.filename})`,
          previousSnapshot: {
            pricing: existing.pricing,
            specsCount: existing.specifications.length,
            offersCount: existing.offers.length,
          },
          newSnapshot: {
            pricing: normalizedPricing,
            specsCount: row.specifications.length,
            offersCount: row.offers.length,
          },
          sourceFilename: params.filename,
          updatedBy: params.uploadedByEmail,
        });

        existingByKey.set(normalizedKey, {
          ...existing,
          categoryId: category.id,
          categoryName: category.name,
          series: row.series !== undefined ? row.series?.trim() || null : existing.series,
          name: row.planName.trim(),
          baseMonthlyPrice:
            row.baseMonthlyPrice !== undefined
              ? row.baseMonthlyPrice
              : existing.baseMonthlyPrice,
          shortDescription: row.shortDescription ?? existing.shortDescription,
          fullDescription: row.fullDescription ?? existing.fullDescription,
          notes: row.notes ?? existing.notes,
          termsAndConditions: row.termsAndConditions ?? existing.termsAndConditions,
          isActive: row.isActive,
          sourceFilename: params.filename,
          updatedBy: params.uploadedByEmail,
          specifications:
            row.specifications.length > 0
              ? row.specifications.map((s, idx) => ({
                  ...s,
                  specKey: s.specKey ?? slugifySpecKey(s.label),
                  sortOrder: idx,
                }))
              : existing.specifications,
          pricing: normalizedPricing.length > 0 ? normalizedPricing : existing.pricing,
          offers: row.offers.length > 0 ? row.offers : existing.offers,
        });

        updatedCount++;
      }
    }

    if (params.importMode === 'replace_category' && params.targetCategory) {
      const targetCatLower = params.targetCategory.trim().toLowerCase();
      for (const existing of existingPlans) {
        if (
          existing.categoryName.trim().toLowerCase() === targetCatLower &&
          existing.isActive &&
          !importedKeys.has(existing.normalizedKey)
        ) {
          await tx
            .update(hostingPlans)
            .set({
              isActive: false,
              updatedBy: params.uploadedByEmail,
              updatedAt: new Date(),
            })
            .where(eq(hostingPlans.id, existing.id));

          await tx.insert(planChangeLogs).values({
            planId: existing.id,
            planName: existing.name,
            changeScope: 'status',
            summary: `Deactivated during Replace Category (${params.targetCategory}) import from ${params.filename}`,
            previousSnapshot: { isActive: true },
            newSnapshot: { isActive: false },
            sourceFilename: params.filename,
            updatedBy: params.uploadedByEmail,
          });
        }
      }
    }

    const hist = await tx
      .insert(importHistory)
      .values({
        originalFilename: params.filename,
        uploadedBy: params.uploadedBy,
        uploadedByEmail: params.uploadedByEmail,
        worksheetNames: params.worksheetNames,
        importMode: params.importMode,
        totalPlansDetected: params.rows.length,
        newPlansImported: createdCount,
        existingPlansUpdated: updatedCount,
        status: 'completed',
        errorInfo: null,
        summaryData: {
          skippedCount,
          targetCategory: params.targetCategory,
        },
      })
      .returning();

    return hist[0].id;
  });

  return {
    importRecordId,
    createdCount,
    updatedCount,
    skippedCount,
  };
}
