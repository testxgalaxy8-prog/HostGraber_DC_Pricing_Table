export type UserRole = 'super_admin' | 'admin';

export type BillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'semiannually'
  | 'annually'
  | 'biennially'
  | 'triennially';

export type LegacyBillingCycle = BillingCycle | 'yearly' | 'biennial';

export type TaxDisplayMode = 'default' | 'before_tax' | 'inclusive_of_tax';

export type ImportMode =
  | 'add_new'
  | 'update_existing'
  | 'review_changes'
  | 'replace_category';

export interface PortalUser {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  isActive: boolean;
  hasLeadSecurityCode?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSettings {
  id: number;
  companyName: string;
  companyWebsite: string;
  logoUrl: string | null;
  pdfLogoUrl: string | null;
  logoShowCompanyName: boolean;
  currencyCode: string;
  currencySymbol: string;
  defaultTaxRate: number;
  defaultTaxDisplay: 'before_tax' | 'inclusive_of_tax';
  defaultBillingDurations: BillingCycle[];
  updatedBy: string | null;
  updatedAt: string;
}

export interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  planCount?: number;
}

export interface PlanSpecItem {
  id?: number;
  specKey?: string | null;
  label: string;
  value: string;
  sortOrder: number;
}

export interface PlanPricingItem {
  id?: number;
  billingCycle: BillingCycle;
  originalPrice: number | null;
  currentPrice: number | null;
  totalPrice?: number | null;
  gstInclusiveTotal?: number | null;
  discountPercentage: number | null;
  discountedPrice: number | null;
  specialOfferPrice: number | null;
  taxMode: TaxDisplayMode;
}

export interface PlanOfferItem {
  id?: number;
  title: string;
  description: string | null;
  marketValue: number | null;
  offerPrice: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface HostingPlanFull {
  id: number;
  categoryId: number | null;
  categoryName: string;
  series: string | null;
  name: string;
  normalizedKey: string;
  baseMonthlyPrice: number | null;
  shortDescription: string | null;
  fullDescription: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  taxDisplayOverride: TaxDisplayMode;
  isActive: boolean;
  sourceFilename: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  specifications: PlanSpecItem[];
  pricing: PlanPricingItem[];
  offers: PlanOfferItem[];
}

export type TargetFieldType =
  | 'ignore'
  | 'plan_name'
  | 'series'
  | 'category'
  | 'short_description'
  | 'full_description'
  | 'base_monthly_price'
  | 'price_monthly'
  | 'price_quarterly'
  | 'price_semiannually'
  | 'price_annually'
  | 'price_biennially'
  | 'price_triennially'
  | 'total_monthly'
  | 'total_quarterly'
  | 'total_semiannually'
  | 'total_annually'
  | 'total_biennially'
  | 'total_triennially'
  | 'original_price'
  | 'discounted_price'
  | 'discount_percentage'
  | 'special_offers'
  | 'free_addons'
  | 'additional_benefits'
  | 'terms_and_conditions'
  | 'notes'
  | 'status'
  | 'specification';

export interface ColumnMappingEntry {
  columnIndex: number;
  excelColumn: string;
  normalizedHeader?: string;
  targetField: TargetFieldType;
  specKey?: string;
  specLabel?: string;
  recognized: boolean;
  warning?: string;
}

export interface WorksheetSummary {
  sheetName: string;
  defaultSelected: boolean;
  isSummarySheet: boolean;
  headerRowIndex: number;
  rowCount: number;
  headers: string[];
  suggestedMappings: ColumnMappingEntry[];
  sampleRows: Record<string, string>[];
  sheetWarnings: string[];
}

export interface ImportPreviewRow {
  rowIndex: number;
  sheetName: string;
  action: 'create' | 'update' | 'skip' | 'error';
  selected: boolean;
  existingPlanId: number | null;
  series: string | null;
  planName: string;
  categoryName: string;
  baseMonthlyPrice: number | null;
  shortDescription: string | null;
  fullDescription: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  isActive: boolean;
  specifications: PlanSpecItem[];
  pricing: PlanPricingItem[];
  offers: PlanOfferItem[];
  warnings: string[];
  errors: string[];
  missingFields: string[];
  priceChanges: Array<{
    billingCycle: BillingCycle;
    previousPrice: number | null;
    newPrice: number | null;
  }>;
}

export interface ImportPreviewResult {
  filename: string;
  importMode: ImportMode;
  targetCategory: string | null;
  selectedSheets: string[];
  unmappedColumns: string[];
  warnings: string[];
  totalDetected: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  warningCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportHistoryItem {
  id: number;
  originalFilename: string;
  uploadedBy: string;
  uploadedByEmail: string;
  worksheetNames: string[];
  importMode: string;
  totalPlansDetected: number;
  newPlansImported: number;
  existingPlansUpdated: number;
  status: string;
  errorInfo: string | null;
  summaryData: Record<string, unknown> | null;
  createdAt: string;
}

export interface PricingHistoryItem {
  id: number;
  planId: number | null;
  planName: string;
  categoryName: string;
  billingCycle: BillingCycle;
  previousPrice: number | null;
  newPrice: number | null;
  previousDiscountedPrice: number | null;
  newDiscountedPrice: number | null;
  changeType: 'created' | 'updated' | 'removed';
  sourceFilename: string | null;
  updatedBy: string;
  changedAt: string;
}

export interface PlanChangeLogItem {
  id: number;
  planId: number | null;
  planName: string;
  changeScope: string;
  summary: string;
  previousSnapshot: Record<string, unknown> | null;
  newSnapshot: Record<string, unknown> | null;
  sourceFilename: string | null;
  updatedBy: string;
  changedAt: string;
}

export type LeadStatus =
  | 'positive'
  | 'call_needed'
  | 'deny'
  | 'converted'
  | 'existing_client'
  | 'not_required';

export type LeadSource =
  | 'manual'
  | 'whatsapp'
  | 'inbound_call'
  | 'website'
  | 'referral'
  | 'aisensy'
  | 'csv_import'
  | 'other';

export interface LeadRemarkItem {
  id: number;
  leadId: number;
  remark: string;
  statusAtCall: LeadStatus;
  callDate: string;
  followUpDate: string | null;
  loggedBy: string;
  createdAt: string;
}

export interface LeadItem {
  id: number;
  ownerUserId: number | null;
  ownerName: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  source: LeadSource;
  campaignName: string | null;
  status: LeadStatus;
  latestRemark: string;
  leadDate: string;
  followUpDate: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  remarksCount: number;
  remarks?: LeadRemarkItem[];
}

export type LeadInterventionScope = 'me' | 'any' | 'other' | 'user';

export interface LeadColleagueOption {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  hasSecurityCode: boolean;
  unlocked: boolean;
  leadCount: number;
}

export interface LeadAccessLogItem {
  id: number;
  viewerUserId: number | null;
  viewerName: string;
  targetUserId: number | null;
  targetName: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export interface LeadWebhookConfig {
  webhookUrl: string;
  webhookSecret: string;
}

export interface LeadTransferCandidate {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  leadDate: string;
  followUpDate: string | null;
  ownerUserId: number | null;
  ownerName: string;
}


