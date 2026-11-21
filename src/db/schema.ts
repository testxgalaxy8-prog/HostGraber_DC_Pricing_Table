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

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'), // 'super_admin' | 'admin'
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
