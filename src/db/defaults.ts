import { asc, count, eq, or } from 'drizzle-orm';
import { db } from './index.ts';
import { categories, settings, users } from './schema.ts';
import { hashPassword } from '../lib/password.ts';
import { ALL_BILLING_CYCLES, normalizeBillingCycle } from '../shared/quotation.ts';
import type { BillingCycle, CategoryItem, PortalSettings } from '../shared/types.ts';

const DEFAULT_CATEGORIES = [
  { name: 'Web Hosting', slug: 'web-hosting', sortOrder: 1 },
  { name: 'Enterprise Hosting', slug: 'enterprise-hosting', sortOrder: 2 },
  { name: 'Cloud Hosting', slug: 'cloud-hosting', sortOrder: 3 },
  { name: 'WordPress Hosting', slug: 'wordpress-hosting', sortOrder: 4 },
  { name: 'VPS Hosting', slug: 'vps-hosting', sortOrder: 5 },
  { name: 'Dedicated Server', slug: 'dedicated-server', sortOrder: 6 },
  { name: 'Email Hosting', slug: 'email-hosting', sortOrder: 7 },
  { name: 'Reseller Hosting', slug: 'reseller-hosting', sortOrder: 8 },
  { name: 'Server Management', slug: 'server-management', sortOrder: 9 },
  { name: 'Other Services', slug: 'other-services', sortOrder: 10 },
];

export const DEMO_ADMIN_USERNAME = 'admin';
export const DEMO_ADMIN_EMAIL = 'admin@hostgraber.com';
export const DEMO_ADMIN_PASSWORD = 'HostGraber@123';

export function slugifyCategory(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'general'
  );
}

export async function ensureDemoAdminSeeded(): Promise<{
  demoPasswordActive: boolean;
}> {
  try {
    const userCountRows = await db.select({ value: count() }).from(users);
    const total = Number(userCountRows[0]?.value ?? 0);

    if (total === 0) {
      await db
        .insert(users)
        .values({
          username: DEMO_ADMIN_USERNAME,
          email: DEMO_ADMIN_EMAIL,
          displayName: 'HostGraber Demo Admin',
          passwordHash: hashPassword(DEMO_ADMIN_PASSWORD),
          role: 'super_admin',
          mustChangePassword: true,
          isActive: true,
        })
        .onConflictDoNothing({ target: users.username });
      return { demoPasswordActive: true };
    }

    const demoRows = await db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.username, DEMO_ADMIN_USERNAME))
      .limit(1);

    return {
      demoPasswordActive: Boolean(demoRows[0]?.mustChangePassword),
    };
  } catch (error) {
    console.error('Database error in ensureDemoAdminSeeded:', error);
    return { demoPasswordActive: false };
  }
}

function normalizeDurationList(raw: string[] | null | undefined): BillingCycle[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...ALL_BILLING_CYCLES];
  }
  const normalized = Array.from(new Set(raw.map((item) => normalizeBillingCycle(item))));
  return normalized.length > 0 ? normalized : [...ALL_BILLING_CYCLES];
}

export async function getOrInitSettings(): Promise<PortalSettings> {
  try {
    const existing = await db.select().from(settings).limit(1);
    if (existing.length > 0) {
      const row = existing[0];
      return {
        id: row.id,
        companyName: row.companyName,
        companyWebsite: row.companyWebsite,
        logoUrl: row.logoUrl ?? null,
        pdfLogoUrl: row.pdfLogoUrl ?? null,
        logoShowCompanyName: row.logoShowCompanyName ?? true,
        currencyCode: row.currencyCode,
        currencySymbol: row.currencySymbol,
        defaultTaxRate: Number(row.defaultTaxRate),
        defaultTaxDisplay:
          row.defaultTaxDisplay === 'inclusive_of_tax'
            ? 'inclusive_of_tax'
            : 'before_tax',
        defaultBillingDurations: normalizeDurationList(row.defaultBillingDurations),
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    const inserted = await db
      .insert(settings)
      .values({
        companyName: 'HostGraber',
        companyWebsite: 'https://hostgraber.com/',
        logoUrl: null,
        pdfLogoUrl: null,
        logoShowCompanyName: true,
        currencyCode: 'INR',
        currencySymbol: '₹',
        defaultTaxRate: 18,
        defaultTaxDisplay: 'before_tax',
        defaultBillingDurations: [...ALL_BILLING_CYCLES],
      })
      .returning();

    const row = inserted[0];
    return {
      id: row.id,
      companyName: row.companyName,
      companyWebsite: row.companyWebsite,
      logoUrl: row.logoUrl ?? null,
      pdfLogoUrl: row.pdfLogoUrl ?? null,
      logoShowCompanyName: row.logoShowCompanyName ?? true,
      currencyCode: row.currencyCode,
      currencySymbol: row.currencySymbol,
      defaultTaxRate: Number(row.defaultTaxRate),
      defaultTaxDisplay:
        row.defaultTaxDisplay === 'inclusive_of_tax'
          ? 'inclusive_of_tax'
          : 'before_tax',
      defaultBillingDurations: normalizeDurationList(row.defaultBillingDurations),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Database error in getOrInitSettings:', error);
    throw new Error('Failed to load portal settings.', { cause: error });
  }
}

export async function ensureDefaultCategories(): Promise<CategoryItem[]> {
  try {
    const existing = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    if (existing.length > 0) {
      return existing.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: c.sortOrder,
      }));
    }

    for (const cat of DEFAULT_CATEGORIES) {
      await db
        .insert(categories)
        .values(cat)
        .onConflictDoNothing({ target: categories.slug });
    }

    const seeded = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    return seeded.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sortOrder,
    }));
  } catch (error) {
    console.error('Database error in ensureDefaultCategories:', error);
    throw new Error('Failed to load categories.', { cause: error });
  }
}

export async function ensureCategoryByName(
  rawName: string
): Promise<{ id: number; name: string }> {
  const cleanName = rawName.trim() || 'Other Services';
  const slug = slugifyCategory(cleanName);

  const existingByName = await db
    .select()
    .from(categories)
    .where(or(eq(categories.slug, slug), eq(categories.name, cleanName)))
    .limit(1);

  if (existingByName.length > 0) {
    return { id: existingByName[0].id, name: existingByName[0].name };
  }

  const inserted = await db
    .insert(categories)
    .values({
      name: cleanName,
      slug,
      sortOrder: 99,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    return { id: inserted[0].id, name: inserted[0].name };
  }

  const fallback = await db
    .select()
    .from(categories)
    .where(or(eq(categories.slug, slug), eq(categories.name, cleanName)))
    .limit(1);

  return { id: fallback[0].id, name: fallback[0].name };
}
