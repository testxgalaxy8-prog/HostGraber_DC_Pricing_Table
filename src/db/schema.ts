import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  leadName: text('lead_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  leadSecurityCodeHash: text('lead_security_code_hash'),
  role: text('role').notNull().default('admin'), // 'super_admin' | 'admin'
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
  jobTitle: text('job_title'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').notNull().default('HostGraber'),
  companyWebsite: text('company_website').notNull().default('https://hostgraber.com/'),
  logoUrl: text('logo_url'),
  pdfLogoUrl: text('pdf_logo_url'),
  logoShowCompanyName: boolean('logo_show_company_name').notNull().default(true),
  currencyCode: text('currency_code').notNull().default('INR'),
  currencySymbol: text('currency_symbol').notNull().default('₹'),
  defaultTaxRate: doublePrecision('default_tax_rate').notNull().default(18),
  defaultTaxDisplay: text('default_tax_display').notNull().default('before_tax'),
  defaultBillingDurations: jsonb('default_billing_durations')
    .$type<string[]>()
    .notNull()
    .default([
      'monthly',
      'quarterly',
      'semiannually',
      'annually',
      'biennially',
      'triennially',
    ]),
  aisensyWebhookSecret: text('aisensy_webhook_secret'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingPlans = pgTable('hosting_plans', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  categoryName: text('category_name').notNull(),
  series: text('series'),
  name: text('name').notNull(),
  normalizedKey: text('normalized_key').notNull().unique(),
  baseMonthlyPrice: doublePrecision('base_monthly_price'),
  shortDescription: text('short_description'),
  fullDescription: text('full_description'),
  notes: text('notes'),
  termsAndConditions: text('terms_and_conditions'),
  taxDisplayOverride: text('tax_display_override').notNull().default('default'),
  isActive: boolean('is_active').notNull().default(true),
  sourceFilename: text('source_filename'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const planSpecifications = pgTable('plan_specifications', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id')
    .references(() => hostingPlans.id, { onDelete: 'cascade' })
    .notNull(),
  specKey: text('spec_key'),
  label: text('label').notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const planPricing = pgTable(
  'plan_pricing',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .references(() => hostingPlans.id, { onDelete: 'cascade' })
      .notNull(),
    billingCycle: text('billing_cycle').notNull(),
    originalPrice: doublePrecision('original_price'),
    currentPrice: doublePrecision('current_price'),
    totalPrice: doublePrecision('total_price'),
    gstInclusiveTotal: doublePrecision('gst_inclusive_total'),
    discountPercentage: doublePrecision('discount_percentage'),
    discountedPrice: doublePrecision('discounted_price'),
    specialOfferPrice: doublePrecision('special_offer_price'),
    taxMode: text('tax_mode').notNull().default('default'),
  },
  (table) => [uniqueIndex('plan_pricing_plan_cycle_idx').on(table.planId, table.billingCycle)]
);

export const planOffers = pgTable('plan_offers', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id')
    .references(() => hostingPlans.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description'),
  marketValue: doublePrecision('market_value'),
  offerPrice: doublePrecision('offer_price'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const importHistory = pgTable('import_history', {
  id: serial('id').primaryKey(),
  originalFilename: text('original_filename').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedByEmail: text('uploaded_by_email').notNull(),
  worksheetNames: jsonb('worksheet_names').$type<string[]>().notNull().default([]),
  importMode: text('import_mode').notNull(),
  totalPlansDetected: integer('total_plans_detected').notNull().default(0),
  newPlansImported: integer('new_plans_imported').notNull().default(0),
  existingPlansUpdated: integer('existing_plans_updated').notNull().default(0),
  status: text('status').notNull().default('completed'),
  errorInfo: text('error_info'),
  summaryData: jsonb('summary_data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pricingHistory = pgTable('pricing_history', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => hostingPlans.id, { onDelete: 'set null' }),
  planName: text('plan_name').notNull(),
  categoryName: text('category_name').notNull(),
  billingCycle: text('billing_cycle').notNull(),
  previousPrice: doublePrecision('previous_price'),
  newPrice: doublePrecision('new_price'),
  previousDiscountedPrice: doublePrecision('previous_discounted_price'),
  newDiscountedPrice: doublePrecision('new_discounted_price'),
  changeType: text('change_type').notNull(),
  sourceFilename: text('source_filename'),
  updatedBy: text('updated_by').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
});

export const planChangeLogs = pgTable('plan_change_logs', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => hostingPlans.id, { onDelete: 'set null' }),
  planName: text('plan_name').notNull(),
  changeScope: text('change_scope').notNull(),
  summary: text('summary').notNull(),
  previousSnapshot: jsonb('previous_snapshot').$type<Record<string, unknown> | null>(),
  newSnapshot: jsonb('new_snapshot').$type<Record<string, unknown> | null>(),
  sourceFilename: text('source_filename'),
  updatedBy: text('updated_by').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  plans: many(hostingPlans),
}));

export const hostingPlansRelations = relations(hostingPlans, ({ one, many }) => ({
  category: one(categories, {
    fields: [hostingPlans.categoryId],
    references: [categories.id],
  }),
  specifications: many(planSpecifications),
  pricing: many(planPricing),
  offers: many(planOffers),
}));

export const planSpecificationsRelations = relations(planSpecifications, ({ one }) => ({
  plan: one(hostingPlans, {
    fields: [planSpecifications.planId],
    references: [hostingPlans.id],
  }),
}));

export const planPricingRelations = relations(planPricing, ({ one }) => ({
  plan: one(hostingPlans, {
    fields: [planPricing.planId],
    references: [hostingPlans.id],
  }),
}));

export const planOffersRelations = relations(planOffers, ({ one }) => ({
  plan: one(hostingPlans, {
    fields: [planOffers.planId],
    references: [hostingPlans.id],
  }),
}));

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  leadCode: text('lead_code'),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  ownerName: text('owner_name').notNull().default(''),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  normalizedPhone: text('normalized_phone').notNull(),
  email: text('email'),
  leadType: text('lead_type').notNull().default('retail'),
  source: text('source').notNull().default('other'),
  campaignName: text('campaign_name'),
  status: text('status').notNull().default('new_lead'),
  latestRemark: text('latest_remark').notNull().default(''),
  leadDate: text('lead_date').notNull(),
  followUpDate: text('follow_up_date'),
  followUpTime: text('follow_up_time'),
  reminderNotifiedAt: timestamp('reminder_notified_at'),
  dealValue: doublePrecision('deal_value'),
  watcherUserIds: jsonb('watcher_user_ids').$type<number[]>().notNull().default([]),
  createdBy: text('created_by').notNull().default('admin'),
  updatedBy: text('updated_by').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const leadRemarks = pgTable('lead_remarks', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id')
    .references(() => leads.id, { onDelete: 'cascade' })
    .notNull(),
  remark: text('remark').notNull(),
  statusAtCall: text('status_at_call').notNull(),
  callDate: text('call_date').notNull(),
  followUpDate: text('follow_up_date'),
  followUpTime: text('follow_up_time'),
  loggedBy: text('logged_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leadAccessGrants = pgTable('lead_access_grants', {
  id: serial('id').primaryKey(),
  sessionTokenHash: text('session_token_hash').notNull(),
  viewerUserId: integer('viewer_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetUserId: integer('target_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const leadAccessLogs = pgTable('lead_access_logs', {
  id: serial('id').primaryKey(),
  viewerUserId: integer('viewer_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  viewerName: text('viewer_name').notNull(),
  targetUserId: integer('target_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  targetName: text('target_name').notNull(),
  action: text('action').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgebaseArticles = pgTable('knowledgebase_articles', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  tags: text('tags'),
  isPinned: boolean('is_pinned').notNull().default(false),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const knowledgebaseImages = pgTable('knowledgebase_images', {
  id: serial('id').primaryKey(),
  mimeType: text('mime_type').notNull(),
  filename: text('filename').notNull(),
  dataBase64: text('data_base64').notNull(),
  uploadedBy: text('uploaded_by').notNull().default('super_admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const communicationTemplates = pgTable('communication_templates', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  subject: text('subject'),
  content: text('content').notNull(),
  tags: text('tags'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teamTargets = pgTable(
  'team_targets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthKey: text('month_key').notNull(),
    leadsTarget: integer('leads_target').notNull().default(0),
    wonTarget: integer('won_target').notNull().default(0),
    revenueTarget: doublePrecision('revenue_target').notNull().default(0),
    notes: text('notes'),
    createdBy: text('created_by').notNull().default('super_admin'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('team_targets_user_month_idx').on(table.userId, table.monthKey)]
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  owner: one(users, {
    fields: [leads.ownerUserId],
    references: [users.id],
  }),
  remarks: many(leadRemarks),
}));

export const leadRemarksRelations = relations(leadRemarks, ({ one }) => ({
  lead: one(leads, {
    fields: [leadRemarks.leadId],
    references: [leads.id],
  }),
}));

