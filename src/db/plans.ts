import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  hostingPlans,
  planChangeLogs,
  planOffers,
  planPricing,
  planSpecifications,
  pricingHistory,
} from './schema.ts';
import { ensureCategoryByName } from './defaults.ts';
import {
  ALL_BILLING_CYCLES,
  hasPricingValue,
  normalizeBillingCycle,
} from '../shared/quotation.ts';
import type {
  BillingCycle,
  HostingPlanFull,
  PlanOfferItem,
  PlanPricingItem,
  PlanSpecItem,
  TaxDisplayMode,
} from '../shared/types.ts';

export function buildNormalizedKey(categoryName: string, planName: string): string {
  return `${categoryName.trim().toLowerCase()}::${planName.trim().toLowerCase()}`;
}

export interface UpsertPlanInput {
  name: string;
  series?: string | null;
  categoryName: string;
  baseMonthlyPrice?: number | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  taxDisplayOverride?: TaxDisplayMode;
  isActive?: boolean;
  specifications: PlanSpecItem[];
  pricing: PlanPricingItem[];
  offers: PlanOfferItem[];
}

function mapPricingRows(
  rows: Array<typeof planPricing.$inferSelect>
): PlanPricingItem[] {
  const byCycle = new Map<BillingCycle, PlanPricingItem>();
  for (const pr of rows) {
    const cycle = normalizeBillingCycle(pr.billingCycle);
    byCycle.set(cycle, {
      id: pr.id,
      billingCycle: cycle,
      originalPrice: pr.originalPrice,
      currentPrice: pr.currentPrice,
      totalPrice: pr.totalPrice ?? null,
      gstInclusiveTotal: pr.gstInclusiveTotal ?? null,
      discountPercentage: pr.discountPercentage,
      discountedPrice: pr.discountedPrice,
      specialOfferPrice: pr.specialOfferPrice,
      taxMode: (pr.taxMode || 'default') as TaxDisplayMode,
    });
  }
  return ALL_BILLING_CYCLES.map((c) => byCycle.get(c)).filter(
    (item): item is PlanPricingItem => Boolean(item)
  );
}

export async function fetchAllPlans(options?: {
  activeOnly?: boolean;
}): Promise<HostingPlanFull[]> {
  try {
    const planRows = options?.activeOnly
      ? await db
          .select()
          .from(hostingPlans)
          .where(eq(hostingPlans.isActive, true))
          .orderBy(desc(hostingPlans.updatedAt), asc(hostingPlans.name))
      : await db
          .select()
          .from(hostingPlans)
          .orderBy(desc(hostingPlans.updatedAt), asc(hostingPlans.name));

    if (planRows.length === 0) {
      return [];
    }

    const planIds = planRows.map((p) => p.id);

    const [specRows, pricingRows, offerRows] = await Promise.all([
      db
        .select()
        .from(planSpecifications)
        .where(inArray(planSpecifications.planId, planIds))
        .orderBy(asc(planSpecifications.sortOrder), asc(planSpecifications.id)),
      db.select().from(planPricing).where(inArray(planPricing.planId, planIds)),
      db
        .select()
        .from(planOffers)
        .where(inArray(planOffers.planId, planIds))
        .orderBy(asc(planOffers.sortOrder), asc(planOffers.id)),
    ]);

    const specsByPlan = new Map<number, PlanSpecItem[]>();
    for (const s of specRows) {
      const list = specsByPlan.get(s.planId) ?? [];
      list.push({
        id: s.id,
        specKey: s.specKey ?? null,
        label: s.label,
        value: s.value,
        sortOrder: s.sortOrder,
      });
      specsByPlan.set(s.planId, list);
    }

    const rawPricingByPlan = new Map<number, Array<typeof planPricing.$inferSelect>>();
    for (const pr of pricingRows) {
      const list = rawPricingByPlan.get(pr.planId) ?? [];
      list.push(pr);
      rawPricingByPlan.set(pr.planId, list);
    }

    const offersByPlan = new Map<number, PlanOfferItem[]>();
    for (const o of offerRows) {
      const list = offersByPlan.get(o.planId) ?? [];
      list.push({
        id: o.id,
        title: o.title,
        description: o.description,
        marketValue: o.marketValue,
        offerPrice: o.offerPrice,
        isActive: o.isActive,
        sortOrder: o.sortOrder,
      });
      offersByPlan.set(o.planId, list);
    }

    return planRows.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      series: p.series ?? null,
      name: p.name,
      normalizedKey: p.normalizedKey,
      baseMonthlyPrice: p.baseMonthlyPrice ?? null,
      shortDescription: p.shortDescription,
      fullDescription: p.fullDescription,
      notes: p.notes,
      termsAndConditions: p.termsAndConditions,
      taxDisplayOverride: (p.taxDisplayOverride || 'default') as TaxDisplayMode,
      isActive: p.isActive,
      sourceFilename: p.sourceFilename,
      updatedBy: p.updatedBy,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      specifications: specsByPlan.get(p.id) ?? [],
      pricing: mapPricingRows(rawPricingByPlan.get(p.id) ?? []),
      offers: offersByPlan.get(p.id) ?? [],
    }));
  } catch (error) {
    console.error('Database error in fetchAllPlans:', error);
    throw new Error('Failed to load hosting plans.', { cause: error });
  }
}

export async function fetchPlanById(id: number): Promise<HostingPlanFull | null> {
  try {
    const rows = await db
      .select()
      .from(hostingPlans)
      .where(eq(hostingPlans.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const plan = rows[0];
    const [specRows, pricingRows, offerRows] = await Promise.all([
      db
        .select()
        .from(planSpecifications)
        .where(eq(planSpecifications.planId, plan.id))
        .orderBy(asc(planSpecifications.sortOrder), asc(planSpecifications.id)),
      db.select().from(planPricing).where(eq(planPricing.planId, plan.id)),
      db
        .select()
        .from(planOffers)
        .where(eq(planOffers.planId, plan.id))
        .orderBy(asc(planOffers.sortOrder), asc(planOffers.id)),
    ]);

    return {
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
      specifications: specRows.map((s) => ({
        id: s.id,
        specKey: s.specKey ?? null,
        label: s.label,
        value: s.value,
        sortOrder: s.sortOrder,
      })),
      pricing: mapPricingRows(pricingRows),
      offers: offerRows.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        marketValue: o.marketValue,
        offerPrice: o.offerPrice,
        isActive: o.isActive,
        sortOrder: o.sortOrder,
      })),
    };
  } catch (error) {
    console.error('Database error in fetchPlanById:', error);
    throw new Error('Failed to load plan details.', { cause: error });
  }
}

export async function createPlanRecord(
  input: UpsertPlanInput,
  updatedBy: string,
  sourceFilename: string | null = null
): Promise<HostingPlanFull> {
  try {
    const category = await ensureCategoryByName(input.categoryName);
    const normalizedKey = buildNormalizedKey(category.name, input.name);

    const createdId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(hostingPlans)
        .values({
          categoryId: category.id,
          categoryName: category.name,
          series: input.series?.trim() || null,
          name: input.name.trim(),
          normalizedKey,
          baseMonthlyPrice: input.baseMonthlyPrice ?? null,
          shortDescription: input.shortDescription?.trim() || null,
          fullDescription: input.fullDescription?.trim() || null,
          notes: input.notes?.trim() || null,
          termsAndConditions: input.termsAndConditions?.trim() || null,
          taxDisplayOverride: input.taxDisplayOverride || 'default',
          isActive: input.isActive ?? true,
          sourceFilename,
          updatedBy,
        })
        .returning();

      const plan = inserted[0];

      const validSpecs = input.specifications
        .filter((s) => s.label.trim() && s.value.trim())
        .map((s, idx) => ({
          planId: plan.id,
          specKey: s.specKey ?? null,
          label: s.label.trim(),
          value: s.value.trim(),
          sortOrder: idx,
        }));

      if (validSpecs.length > 0) {
        await tx.insert(planSpecifications).values(validSpecs);
      }

      const normalizedPricing = input.pricing.map((p) => ({
        ...p,
        billingCycle: normalizeBillingCycle(p.billingCycle),
      }));
      const validPricing = normalizedPricing.filter((p) => hasPricingValue(p));

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
      }

      if (validPricing.length > 0) {
        await tx.insert(pricingHistory).values(
          validPricing.map((p) => ({
            planId: plan.id,
            planName: plan.name,
            categoryName: plan.categoryName,
            billingCycle: p.billingCycle,
            previousPrice: null,
            newPrice: p.currentPrice ?? p.totalPrice ?? null,
            previousDiscountedPrice: null,
            newDiscountedPrice: p.discountedPrice ?? null,
            changeType: 'created',
            sourceFilename,
            updatedBy,
          }))
        );
      }

      const validOffers = input.offers
        .filter((o) => o.title.trim())
        .map((o, idx) => ({
          planId: plan.id,
          title: o.title.trim(),
          description: o.description?.trim() || null,
          marketValue: o.marketValue ?? null,
          offerPrice: o.offerPrice ?? null,
          isActive: o.isActive ?? true,
          sortOrder: idx,
        }));

      if (validOffers.length > 0) {
        await tx.insert(planOffers).values(validOffers);
      }

      await tx.insert(planChangeLogs).values({
        planId: plan.id,
        planName: plan.name,
        changeScope: 'plan',
        summary: sourceFilename
          ? `Created plan from Excel import (${sourceFilename})`
          : 'Created plan manually',
        previousSnapshot: null,
        newSnapshot: {
          categoryName: plan.categoryName,
          series: plan.series,
          specsCount: validSpecs.length,
          pricingCount: validPricing.length,
          offersCount: validOffers.length,
        },
        sourceFilename,
        updatedBy,
      });

      return plan.id;
    });

    const full = await fetchPlanById(createdId);
    if (!full) {
      throw new Error('Plan creation failed.');
    }
    return full;
  } catch (error) {
    console.error('Database error in createPlanRecord:', error);
    throw new Error(
      error instanceof Error && error.message.includes('unique')
        ? 'A plan with this name already exists in the selected category.'
        : 'Failed to create hosting plan.',
      { cause: error }
    );
  }
}

export async function updatePlanRecord(
  planId: number,
  input: UpsertPlanInput,
  updatedBy: string,
  sourceFilename: string | null = null
): Promise<HostingPlanFull> {
  try {
    const existing = await fetchPlanById(planId);
    if (!existing) {
      throw new Error('Hosting plan not found.');
    }

    const category = await ensureCategoryByName(input.categoryName);
    const normalizedKey = buildNormalizedKey(category.name, input.name);

    await db.transaction(async (tx) => {
      await tx
        .update(hostingPlans)
        .set({
          categoryId: category.id,
          categoryName: category.name,
          series: input.series !== undefined ? input.series?.trim() || null : existing.series,
          name: input.name.trim(),
          normalizedKey,
          baseMonthlyPrice:
            input.baseMonthlyPrice !== undefined
              ? input.baseMonthlyPrice
              : existing.baseMonthlyPrice,
          shortDescription: input.shortDescription?.trim() || null,
          fullDescription: input.fullDescription?.trim() || null,
          notes: input.notes?.trim() || null,
          termsAndConditions: input.termsAndConditions?.trim() || null,
          taxDisplayOverride: input.taxDisplayOverride || 'default',
          isActive: input.isActive ?? existing.isActive,
          sourceFilename: sourceFilename ?? existing.sourceFilename,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(hostingPlans.id, planId));

      await tx.delete(planSpecifications).where(eq(planSpecifications.planId, planId));
      const validSpecs = input.specifications
        .filter((s) => s.label.trim() && s.value.trim())
        .map((s, idx) => ({
          planId,
          specKey: s.specKey ?? null,
          label: s.label.trim(),
          value: s.value.trim(),
          sortOrder: idx,
        }));
      if (validSpecs.length > 0) {
        await tx.insert(planSpecifications).values(validSpecs);
      }

      const oldPricingMap = new Map(
        existing.pricing.map((p) => [normalizeBillingCycle(p.billingCycle), p])
      );
      const newPricingMap = new Map(
        input.pricing.map((p) => {
          const cycle = normalizeBillingCycle(p.billingCycle);
          return [cycle, { ...p, billingCycle: cycle }] as const;
        })
      );

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

      for (const cycle of ALL_BILLING_CYCLES) {
        const prev = oldPricingMap.get(cycle);
        const next = newPricingMap.get(cycle);
        const prevHasVal = hasPricingValue(prev);
        const nextHasVal = hasPricingValue(next);

        if (!prevHasVal && nextHasVal && next) {
          historyInserts.push({
            planId,
            planName: input.name.trim(),
            categoryName: category.name,
            billingCycle: cycle,
            previousPrice: null,
            newPrice: next.currentPrice ?? next.totalPrice ?? null,
            previousDiscountedPrice: null,
            newDiscountedPrice: next.discountedPrice ?? null,
            changeType: 'created',
            sourceFilename,
            updatedBy,
          });
        } else if (prevHasVal && !nextHasVal && prev) {
          historyInserts.push({
            planId,
            planName: input.name.trim(),
            categoryName: category.name,
            billingCycle: cycle,
            previousPrice: prev.currentPrice ?? prev.totalPrice ?? null,
            newPrice: null,
            previousDiscountedPrice: prev.discountedPrice ?? null,
            newDiscountedPrice: null,
            changeType: 'removed',
            sourceFilename,
            updatedBy,
          });
        } else if (
          prevHasVal &&
          nextHasVal &&
          prev &&
          next &&
          (prev.currentPrice !== next.currentPrice ||
            prev.totalPrice !== next.totalPrice ||
            prev.gstInclusiveTotal !== next.gstInclusiveTotal ||
            prev.originalPrice !== next.originalPrice ||
            prev.discountPercentage !== next.discountPercentage ||
            prev.discountedPrice !== next.discountedPrice)
        ) {
          historyInserts.push({
            planId,
            planName: input.name.trim(),
            categoryName: category.name,
            billingCycle: cycle,
            previousPrice: prev.currentPrice ?? prev.totalPrice ?? null,
            newPrice: next.currentPrice ?? next.totalPrice ?? null,
            previousDiscountedPrice: prev.discountedPrice ?? null,
            newDiscountedPrice: next.discountedPrice ?? null,
            changeType: 'updated',
            sourceFilename,
            updatedBy,
          });
        }
      }

      if (historyInserts.length > 0) {
        await tx.insert(pricingHistory).values(historyInserts);
      }

      await tx.delete(planPricing).where(eq(planPricing.planId, planId));
      const allNewPricing = Array.from(newPricingMap.values());
      if (allNewPricing.length > 0) {
        await tx.insert(planPricing).values(
          allNewPricing.map((p) => ({
            planId,
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

      await tx.delete(planOffers).where(eq(planOffers.planId, planId));
      const validOffers = input.offers
        .filter((o) => o.title.trim())
        .map((o, idx) => ({
          planId,
          title: o.title.trim(),
          description: o.description?.trim() || null,
          marketValue: o.marketValue ?? null,
          offerPrice: o.offerPrice ?? null,
          isActive: o.isActive ?? true,
          sortOrder: idx,
        }));
      if (validOffers.length > 0) {
        await tx.insert(planOffers).values(validOffers);
      }

      const changeAreas: string[] = [];
      if (
        existing.shortDescription !== (input.shortDescription?.trim() || null) ||
        existing.fullDescription !== (input.fullDescription?.trim() || null) ||
        existing.name !== input.name.trim() ||
        existing.categoryName !== category.name ||
        existing.series !== (input.series?.trim() || null)
      ) {
        changeAreas.push('details');
      }
      if (
        JSON.stringify(
          existing.specifications.map((s) => `${s.label}:${s.value}`)
        ) !== JSON.stringify(validSpecs.map((s) => `${s.label}:${s.value}`))
      ) {
        changeAreas.push('specifications');
      }
      if (historyInserts.length > 0) {
        changeAreas.push('pricing');
      }
      if (
        JSON.stringify(existing.offers.map((o) => `${o.title}:${o.marketValue}`)) !==
        JSON.stringify(validOffers.map((o) => `${o.title}:${o.marketValue}`))
      ) {
        changeAreas.push('offers');
      }

      if (changeAreas.length > 0) {
        await tx.insert(planChangeLogs).values({
          planId,
          planName: input.name.trim(),
          changeScope: changeAreas.join(', '),
          summary: sourceFilename
            ? `Updated ${changeAreas.join(', ')} via Excel import (${sourceFilename})`
            : `Updated ${changeAreas.join(', ')} manually`,
          previousSnapshot: {
            series: existing.series,
            shortDescription: existing.shortDescription,
            specifications: existing.specifications.map((s) => ({
              label: s.label,
              value: s.value,
            })),
            offers: existing.offers.map((o) => ({
              title: o.title,
              marketValue: o.marketValue,
            })),
          },
          newSnapshot: {
            series: input.series?.trim() || null,
            shortDescription: input.shortDescription?.trim() || null,
            specifications: validSpecs.map((s) => ({
              label: s.label,
              value: s.value,
            })),
            offers: validOffers.map((o) => ({
              title: o.title,
              marketValue: o.marketValue,
            })),
          },
          sourceFilename,
          updatedBy,
        });
      }
    });

    const updated = await fetchPlanById(planId);
    if (!updated) {
      throw new Error('Plan update failed.');
    }
    return updated;
  } catch (error) {
    console.error('Database error in updatePlanRecord:', error);
    throw new Error('Failed to update hosting plan.', { cause: error });
  }
}

export async function togglePlanStatus(
  planId: number,
  isActive: boolean,
  updatedBy: string
): Promise<HostingPlanFull> {
  try {
    const existing = await fetchPlanById(planId);
    if (!existing) {
      throw new Error('Hosting plan not found.');
    }

    await db.transaction(async (tx) => {
      await tx
        .update(hostingPlans)
        .set({ isActive, updatedBy, updatedAt: new Date() })
        .where(eq(hostingPlans.id, planId));

      await tx.insert(planChangeLogs).values({
        planId,
        planName: existing.name,
        changeScope: 'status',
        summary: isActive ? 'Activated hosting plan' : 'Deactivated hosting plan',
        previousSnapshot: { isActive: existing.isActive },
        newSnapshot: { isActive },
        sourceFilename: null,
        updatedBy,
      });
    });

    const updated = await fetchPlanById(planId);
    if (!updated) {
      throw new Error('Plan not found after status update.');
    }
    return updated;
  } catch (error) {
    console.error('Database error in togglePlanStatus:', error);
    throw new Error('Failed to update plan status.', { cause: error });
  }
}

export async function deletePlanRecord(
  planId: number,
  updatedBy: string
): Promise<void> {
  try {
    const existing = await fetchPlanById(planId);
    if (!existing) {
      throw new Error('Hosting plan not found.');
    }

    await db.transaction(async (tx) => {
      await tx.insert(planChangeLogs).values({
        planId: null,
        planName: existing.name,
        changeScope: 'plan',
        summary: `Deleted hosting plan (${existing.categoryName})`,
        previousSnapshot: {
          name: existing.name,
          series: existing.series,
          categoryName: existing.categoryName,
          pricing: existing.pricing,
        },
        newSnapshot: null,
        sourceFilename: null,
        updatedBy,
      });

      await tx.delete(hostingPlans).where(eq(hostingPlans.id, planId));
    });
  } catch (error) {
    console.error('Database error in deletePlanRecord:', error);
    throw new Error('Failed to delete hosting plan.', { cause: error });
  }
}

export async function deletePlansBulk(
  planIds: number[],
  updatedBy: string
): Promise<{ deletedCount: number; deletedIds: number[] }> {
  const uniqueIds = Array.from(
    new Set(planIds.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (uniqueIds.length === 0) {
    return { deletedCount: 0, deletedIds: [] };
  }

  try {
    return await db.transaction(async (tx) => {
      const existingPlans = await tx
        .select()
        .from(hostingPlans)
        .where(inArray(hostingPlans.id, uniqueIds));

      if (existingPlans.length === 0) {
        return { deletedCount: 0, deletedIds: [] };
      }

      const foundIds = existingPlans.map((p) => p.id);
      const pricingRows = await tx
        .select()
        .from(planPricing)
        .where(inArray(planPricing.planId, foundIds));

      const pricingByPlan = new Map<number, typeof pricingRows>();
      for (const row of pricingRows) {
        const list = pricingByPlan.get(row.planId) ?? [];
        list.push(row);
        pricingByPlan.set(row.planId, list);
      }

      await tx.insert(planChangeLogs).values(
        existingPlans.map((existing) => ({
          planId: null,
          planName: existing.name,
          changeScope: 'plan',
          summary: `Bulk deleted hosting plan (${existing.categoryName})`,
          previousSnapshot: {
            name: existing.name,
            series: existing.series,
            categoryName: existing.categoryName,
            pricing: pricingByPlan.get(existing.id) ?? [],
          },
          newSnapshot: null,
          sourceFilename: null,
          updatedBy,
        }))
      );

      await tx.delete(hostingPlans).where(inArray(hostingPlans.id, foundIds));

      return {
        deletedCount: foundIds.length,
        deletedIds: foundIds,
      };
    });
  } catch (error) {
    console.error('Database error in deletePlansBulk:', error);
    throw new Error('Failed to delete selected hosting plans.', { cause: error });
  }
}

