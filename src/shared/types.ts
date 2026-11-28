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
  departmentId?: number | null;
  departmentName?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
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
  | 'new_lead'
  | 'positive_lead'
  | 'quotation_shared'
  | 'not_answering'
  | 'meeting_scheduled'
  | 'trial_given'
  | 'existing_client_lead'
  | 'future_prospect'
  | 'won'
  | 'lost'
  | 'cold_lead'
  | 'denied';

export type LeadSource =
  | 'aisensy_ad'
  | 'aisensy_organic'
  | 'partner_enquiry'
  | 'referral'
  | 'website_whmcs'
  | 'import'
  | 'website_grabee_ai'
  | 'internal_team_reference'
  | 'other';

export type LeadType = 'b2b' | 'retail';

export interface LeadRemarkItem {
  id: number;
  leadId: number;
  remark: string;
  statusAtCall: LeadStatus;
  callDate: string;
  followUpDate: string | null;
  followUpTime: string | null;
  loggedBy: string;
  createdAt: string;
}

export interface LeadItem {
  id: number;
  leadCode: string;
  ownerUserId: number | null;
  ownerName: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  email: string | null;
  leadType: LeadType;
  source: LeadSource;
  campaignName: string | null;
  status: LeadStatus;
  latestRemark: string;
  leadDate: string;
  followUpDate: string | null;
  followUpTime: string | null;
  reminderNotifiedAt: string | null;
  dealValue: number | null;
  watcherUserIds: number[];
  watcherNames: string[];
  duplicatePhoneCount?: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  remarksCount: number;
  remarks?: LeadRemarkItem[];
}

export type LeadInterventionScope = 'me' | 'any' | 'other' | 'watched' | 'user';

export interface LeadColleagueOption {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  hasSecurityCode: boolean;
  unlocked: boolean;
  leadCount: number;
  watchedLeadCount?: number;
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
  leadCode: string;
  name: string;
  phone: string;
  status: LeadStatus;
  leadDate: string;
  followUpDate: string | null;
  ownerUserId: number | null;
  ownerName: string;
}

export type KnowledgebaseCategory =
  | 'product_documentation'
  | 'technical_documentation'
  | 'faqs'
  | 'objection_handling'
  | 'company_resources';

export interface KnowledgebaseArticle {
  id: number;
  category: KnowledgebaseCategory;
  title: string;
  summary: string | null;
  content: string;
  tags: string | null;
  isPinned: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CommunicationCategory =
  | 'email_templates'
  | 'whatsapp_templates'
  | 'sales_responses'
  | 'support_responses'
  | 'follow_up_templates'
  | 'canned_responses';

export interface CommunicationTemplate {
  id: number;
  category: CommunicationCategory;
  title: string;
  subject: string | null;
  content: string;
  tags: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentItem {
  id: number;
  name: string;
  description: string | null;
  leadName: string | null;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTargetItem {
  id: number;
  userId: number;
  userDisplayName: string;
  username: string;
  departmentName: string | null;
  monthKey: string;
  leadsTarget: number;
  wonTarget: number;
  revenueTarget: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsStatusRow {
  status: LeadStatus;
  count: number;
  percentage: number;
  pipelineValue: number;
}

export interface AnalyticsSourceRow {
  source: LeadSource;
  totalLeads: number;
  wonLeads: number;
  conversionRate: number;
  revenue: number;
}

export interface AnalyticsMonthlyRow {
  monthKey: string;
  label: string;
  newLeads: number;
  wonLeads: number;
  revenue: number;
}

export interface AnalyticsTeamRow {
  userId: number;
  displayName: string;
  username: string;
  departmentName: string | null;
  avatarUrl?: string | null;
  totalLeads: number;
  newLeadsThisMonth: number;
  activeFollowUps: number;
  wonLeads: number;
  conversionRate: number;
  wonRevenue: number;
  leadsTarget: number;
  wonTarget: number;
  revenueTarget: number;
}

export interface ReportsAnalyticsData {
  monthKey: string;
  summary: {
    totalLeads: number;
    activePipeline: number;
    wonLeads: number;
    lostAndDenied: number;
    conversionRate: number;
    wonRevenue: number;
    pipelineValue: number;
    b2bCount: number;
    retailCount: number;
  };
  byStatus: AnalyticsStatusRow[];
  bySource: AnalyticsSourceRow[];
  monthlyTrend: AnalyticsMonthlyRow[];
  teamPerformance: AnalyticsTeamRow[];
}

export interface CombinedDashboardData {
  leadSummary: {
    totalLeads: number;
    newToday: number;
    followUpsDue: number;
    overdue: number;
    wonCount: number;
    positiveCount: number;
    recentLeads: Array<{
      id: number;
      leadCode: string;
      name: string;
      phone: string;
      status: LeadStatus;
      source: LeadSource;
      leadDate: string;
      followUpDate: string | null;
      ownerName: string;
    }>;
  };
  catalogSummary: {
    totalPlans: number;
    activePlans: number;
    categoriesCount: number;
    lastImportAt: string | null;
    recentPlans: HostingPlanFull[];
    recentImports: ImportHistoryItem[];
    recentPriceChanges: PricingHistoryItem[];
  };
}

