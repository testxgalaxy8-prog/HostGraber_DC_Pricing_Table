import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  communicationTemplates,
  departments,
  importHistory,
  knowledgebaseArticles,
  knowledgebaseImages,
  leads,
  pricingHistory,
  teamTargets,
  users,
} from './schema.ts';
import { fetchAllPlans } from './plans.ts';
import { ensureLeadsSchemaMigrated, fetchScopedLeads } from './leads.ts';
import {
  ALL_LEAD_STATUSES,
  COMMUNICATION_CATEGORIES,
  KNOWLEDGEBASE_CATEGORIES,
  LEAD_FORM_SOURCES,
  getFollowUpUrgency,
  getTodayIsoDate,
  isClosedLeadStatus,
  normalizeLeadSource,
  normalizeLeadStatus,
  normalizeLeadType,
} from '../shared/leads.ts';
import type {
  AnalyticsMonthlyRow,
  AnalyticsSourceRow,
  AnalyticsStatusRow,
  AnalyticsTeamRow,
  CombinedDashboardData,
  CommunicationCategory,
  CommunicationTemplate,
  DepartmentItem,
  KnowledgebaseArticle,
  KnowledgebaseCategory,
  ReportsAnalyticsData,
  TeamTargetItem,
} from '../shared/types.ts';

let seedPromise: Promise<void> | null = null;

const STARTER_KNOWLEDGEBASE: Array<{
  category: KnowledgebaseCategory;
  title: string;
  summary: string;
  content: string;
  tags: string;
  isPinned: boolean;
}> = [
  {
    category: 'product_documentation',
    title: 'Shared & Cloud Hosting Portfolio Guide',
    summary: 'Overview of HostGraber Shared, cPanel, Cloud VPS, and Dedicated plans for discovery calls.',
    content:
      'Use this quick guide during initial discovery:\n\n1. Shared / Starter Hosting: Ideal for new websites, portfolios, and small WordPress blogs expecting up to 15k monthly visits.\n2. Cloud VPS (NVMe): Recommended for SaaS apps, WooCommerce stores, Tally/ERP, or trading terminals requiring dedicated vCPU & RAM.\n3. Reseller / B2B Hosting: Best for agencies managing multiple client domains with WHMCS billing automation.\n\nAlways check required RAM, storage (NVMe SSD), control panel preference (cPanel/DirectAdmin/Plesk), and preferred billing tenure before sharing a formal quote.',
    tags: 'plans, vps, shared, discovery',
    isPinned: true,
  },
  {
    category: 'technical_documentation',
    title: 'Zero-Downtime cPanel & Website Migration Checklist',
    summary: 'Step-by-step pre-migration requirements to reassure prospects switching from another host.',
    content:
      'Key details to collect before scheduling a free migration:\n- Existing hosting control panel URL, username, and password (or full cPanel backup archive).\n- Domain registrar access to lower DNS TTL to 300s prior to cutover.\n- Active email accounts & IMAP sync requirements.\n\nHostGraber engineers verify staging links via hosts-file preview before pointing nameservers so live traffic experiences zero downtime.',
    tags: 'migration, dns, cpanel, ssl',
    isPinned: false,
  },
  {
    category: 'faqs',
    title: 'Billing Cycles, GST Invoices & Upgrade Policy',
    summary: 'Clear answers to frequent commercial and GST billing questions.',
    content:
      'Q: Do you provide GST tax invoices for Indian businesses?\nA: Yes. Enter the client GSTIN at checkout or share it with billing to receive compliant B2B tax invoices (18% GST).\n\nQ: Can a client upgrade mid-cycle?\nA: Yes, upgrades to higher VPS or Hosting tiers are prorated seamlessly without losing data or IP assignments.',
    tags: 'gst, billing, upgrades, faq',
    isPinned: false,
  },
  {
    category: 'objection_handling',
    title: 'Handling "Competitor Plan Is Cheaper" Objections',
    summary: 'Value-first response framework highlighting NVMe speed, local latency, and managed support.',
    content:
      'When a prospect quotes a lower introductory price from a mass-market provider:\n1. Acknowledge their budget target.\n2. Compare renewal pricing vs introductory promo pricing (many competitors triple prices at renewal).\n3. Highlight HostGraber advantages: NVMe Gen4 storage, low-latency Indian & global routing, transparent multi-year discounts, and direct WhatsApp/engineer escalation.\n4. Offer an annual or multi-year lock-in quote to bridge the gap.',
    tags: 'pricing, objection, sales',
    isPinned: true,
  },
  {
    category: 'company_resources',
    title: 'Daily Sales Follow-Up SLA & Escalation Matrix',
    summary: 'Response benchmarks for New Leads, Quotation Shared, and Trial Given stages.',
    content:
      'Standard SLA targets:\n- New Lead (Inbound / Aisensy): First contact within 15 minutes during business hours.\n- Quotation Shared: Mandatory follow-up within 24 hours.\n- Trial Given: Mid-trial check-in on Day 2 and closing call before trial expiry.\n- B2B / Custom Specs: Loop in Enterprise Lead or Super Admin for custom hardware quotes.',
    tags: 'sla, sop, onboarding',
    isPinned: false,
  },
];

const STARTER_TEMPLATES: Array<{
  category: CommunicationCategory;
  title: string;
  subject: string | null;
  content: string;
  tags: string;
}> = [
  {
    category: 'whatsapp_templates',
    title: 'First Outreach — New Hosting Enquiry',
    subject: null,
    content:
      'Hi {contact_name},\n\nThank you for reaching out to {company_name}! Your reference ID is {lead_id}.\n\nCould you share whether you are looking for Shared Hosting, Cloud VPS, or a B2B Reseller setup? I will prepare the best plan options and pricing for you right away.',
    tags: 'intro, new_lead, whatsapp',
  },
  {
    category: 'follow_up_templates',
    title: 'Quotation Follow-up (24 Hours)',
    subject: null,
    content:
      'Hi {contact_name},\n\nChecking in regarding the {company_name} quotation we shared earlier (Ref: {lead_id}). Would you like me to clarify any server specs, billing tenure discounts, or migration steps on a quick 5-minute call?',
    tags: 'followup, quotation',
  },
  {
    category: 'email_templates',
    title: 'Formal Hosting Proposal & GST Summary',
    subject: 'HostGraber Server Quotation — Ref {lead_id}',
    content:
      'Dear {contact_name},\n\nThank you for speaking with our team at {company_name}.\n\nAs discussed, please find your recommended hosting configuration and billing options below. All B2B orders include 18% GST tax invoicing, complimentary SSL certificates, and guided migration support.\n\nReply to this email or message us anytime with your preferred billing cycle to activate your server.\n\nWarm regards,\nHostGraber Sales Team',
    tags: 'email, proposal, b2b',
  },
  {
    category: 'sales_responses',
    title: 'Trial Activation Confirmation',
    subject: null,
    content:
      'Hi {contact_name}, your evaluation environment is active (Ref: {lead_id}). Please test performance and connectivity over the next 48 hours—let us know once you are ready to convert to a live billing plan.',
    tags: 'trial, activation',
  },
  {
    category: 'support_responses',
    title: 'Technical Migration Handoff',
    subject: null,
    content:
      'Hi {contact_name}, I have tagged our migration engineering desk under Ref {lead_id}. Please share your existing control panel details securely and we will schedule a zero-downtime transfer window.',
    tags: 'support, migration',
  },
  {
    category: 'canned_responses',
    title: 'Not Answering — Quick Callback Ping',
    subject: null,
    content:
      'Hi {contact_name}, tried reaching you regarding your {company_name} enquiry ({lead_id}). Please reply with a convenient time for a quick callback today.',
    tags: 'callback, not_answering',
  },
];

export async function ensurePortalStarterData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [kbCountRow, tmplCountRow, deptCountRow] = await Promise.all([
        db.select({ total: count() }).from(knowledgebaseArticles),
        db.select({ total: count() }).from(communicationTemplates),
        db.select({ total: count() }).from(departments),
      ]);

      if (Number(kbCountRow[0]?.total ?? 0) === 0) {
        await db.insert(knowledgebaseArticles).values(
          STARTER_KNOWLEDGEBASE.map((item) => ({
            ...item,
            createdBy: 'System',
            updatedBy: 'System',
          }))
        );
      }

      if (Number(tmplCountRow[0]?.total ?? 0) === 0) {
        await db.insert(communicationTemplates).values(
          STARTER_TEMPLATES.map((item) => ({
            ...item,
            createdBy: 'System',
            updatedBy: 'System',
          }))
        );
      }

      if (Number(deptCountRow[0]?.total ?? 0) === 0) {
        await db.insert(departments).values([
          {
            name: 'Inside Sales',
            description: 'Inbound WhatsApp, website, and Aisensy lead qualification.',
            leadName: 'Sales Lead',
          },
          {
            name: 'B2B & Enterprise',
            description: 'Custom VPS, dedicated servers, and agency partner accounts.',
            leadName: 'Enterprise Lead',
          },
          {
            name: 'Customer Success',
            description: 'Renewals, migrations, and account expansion.',
            leadName: 'Success Lead',
          },
        ]);
      }
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

let kbImagesTablePromise: Promise<void> | null = null;

async function ensureKnowledgebaseImagesTable(): Promise<void> {
  if (!kbImagesTablePromise) {
    kbImagesTablePromise = db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS knowledgebase_images (
          id SERIAL PRIMARY KEY,
          mime_type TEXT NOT NULL,
          filename TEXT NOT NULL,
          data_base64 TEXT NOT NULL,
          uploaded_by TEXT NOT NULL DEFAULT 'super_admin',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`
      )
      .then(() => undefined)
      .catch((err) => {
        kbImagesTablePromise = null;
        throw err;
      });
  }
  await kbImagesTablePromise;
}

export async function saveKnowledgebaseImage(input: {
  mimeType: string;
  filename: string;
  dataBase64: string;
  actor: string;
}): Promise<{ id: number; url: string }> {
  await ensureKnowledgebaseImagesTable();
  const [inserted] = await db
    .insert(knowledgebaseImages)
    .values({
      mimeType: input.mimeType,
      filename: input.filename.slice(0, 180) || 'image',
      dataBase64: input.dataBase64,
      uploadedBy: input.actor,
    })
    .returning({ id: knowledgebaseImages.id });

  return {
    id: inserted.id,
    url: `/api/knowledgebase/images/${inserted.id}`,
  };
}

export async function fetchKnowledgebaseImageById(id: number): Promise<{
  id: number;
  mimeType: string;
  filename: string;
  dataBase64: string;
} | null> {
  await ensureKnowledgebaseImagesTable();
  const [row] = await db
    .select({
      id: knowledgebaseImages.id,
      mimeType: knowledgebaseImages.mimeType,
      filename: knowledgebaseImages.filename,
      dataBase64: knowledgebaseImages.dataBase64,
    })
    .from(knowledgebaseImages)
    .where(eq(knowledgebaseImages.id, id))
    .limit(1);
  return row ?? null;
}

const KB_CATEGORY_SET = new Set(KNOWLEDGEBASE_CATEGORIES.map((c) => c.id));
const COMM_CATEGORY_SET = new Set(COMMUNICATION_CATEGORIES.map((c) => c.id));

function normalizeKbCategory(raw: string | undefined): KnowledgebaseCategory {
  if (raw && KB_CATEGORY_SET.has(raw as KnowledgebaseCategory)) {
    return raw as KnowledgebaseCategory;
  }
  return 'product_documentation';
}

function normalizeCommCategory(raw: string | undefined): CommunicationCategory {
  if (raw && COMM_CATEGORY_SET.has(raw as CommunicationCategory)) {
    return raw as CommunicationCategory;
  }
  return 'whatsapp_templates';
}

function mapKbRow(row: typeof knowledgebaseArticles.$inferSelect): KnowledgebaseArticle {
  return {
    id: row.id,
    category: normalizeKbCategory(row.category),
    title: row.title,
    summary: row.summary ?? null,
    content: row.content,
    tags: row.tags ?? null,
    isPinned: row.isPinned,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTemplateRow(
  row: typeof communicationTemplates.$inferSelect
): CommunicationTemplate {
  return {
    id: row.id,
    category: normalizeCommCategory(row.category),
    title: row.title,
    subject: row.subject ?? null,
    content: row.content,
    tags: row.tags ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Knowledgebase CRUD
export async function fetchKnowledgebaseArticles(
  category?: string
): Promise<KnowledgebaseArticle[]> {
  await ensurePortalStarterData();
  const rows =
    category && KB_CATEGORY_SET.has(category as KnowledgebaseCategory)
      ? await db
          .select()
          .from(knowledgebaseArticles)
          .where(eq(knowledgebaseArticles.category, category))
          .orderBy(
            desc(knowledgebaseArticles.isPinned),
            desc(knowledgebaseArticles.updatedAt),
            desc(knowledgebaseArticles.id)
          )
      : await db
          .select()
          .from(knowledgebaseArticles)
          .orderBy(
            desc(knowledgebaseArticles.isPinned),
            desc(knowledgebaseArticles.updatedAt),
            desc(knowledgebaseArticles.id)
          );
  return rows.map(mapKbRow);
}

export async function createKnowledgebaseArticle(input: {
  category: string;
  title: string;
  summary?: string | null;
  content: string;
  tags?: string | null;
  isPinned?: boolean;
  actor: string;
}): Promise<KnowledgebaseArticle> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error('Article title is required.');
  if (!content) throw new Error('Article content is required.');

  const [created] = await db
    .insert(knowledgebaseArticles)
    .values({
      category: normalizeKbCategory(input.category),
      title,
      summary: input.summary?.trim() || null,
      content,
      tags: input.tags?.trim() || null,
      isPinned: Boolean(input.isPinned),
      createdBy: input.actor,
      updatedBy: input.actor,
    })
    .returning();

  return mapKbRow(created);
}

export async function updateKnowledgebaseArticle(
  id: number,
  input: {
    category?: string;
    title?: string;
    summary?: string | null;
    content?: string;
    tags?: string | null;
    isPinned?: boolean;
    actor: string;
  }
): Promise<KnowledgebaseArticle | null> {
  const [existing] = await db
    .select()
    .from(knowledgebaseArticles)
    .where(eq(knowledgebaseArticles.id, id))
    .limit(1);
  if (!existing) return null;

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  const content =
    input.content !== undefined ? input.content.trim() : existing.content;
  if (!title) throw new Error('Article title is required.');
  if (!content) throw new Error('Article content is required.');

  const [updated] = await db
    .update(knowledgebaseArticles)
    .set({
      category:
        input.category !== undefined
          ? normalizeKbCategory(input.category)
          : existing.category,
      title,
      summary:
        input.summary !== undefined
          ? input.summary?.trim() || null
          : existing.summary,
      content,
      tags: input.tags !== undefined ? input.tags?.trim() || null : existing.tags,
      isPinned:
        input.isPinned !== undefined ? Boolean(input.isPinned) : existing.isPinned,
      updatedBy: input.actor,
      updatedAt: new Date(),
    })
    .where(eq(knowledgebaseArticles.id, id))
    .returning();

  return mapKbRow(updated);
}

export async function deleteKnowledgebaseArticle(id: number): Promise<boolean> {
  const deleted = await db
    .delete(knowledgebaseArticles)
    .where(eq(knowledgebaseArticles.id, id))
    .returning({ id: knowledgebaseArticles.id });
  return deleted.length > 0;
}

// Communication Templates CRUD
export async function fetchCommunicationTemplates(
  category?: string
): Promise<CommunicationTemplate[]> {
  await ensurePortalStarterData();
  const rows =
    category && COMM_CATEGORY_SET.has(category as CommunicationCategory)
      ? await db
          .select()
          .from(communicationTemplates)
          .where(eq(communicationTemplates.category, category))
          .orderBy(desc(communicationTemplates.updatedAt), desc(communicationTemplates.id))
      : await db
          .select()
          .from(communicationTemplates)
          .orderBy(desc(communicationTemplates.updatedAt), desc(communicationTemplates.id));
  return rows.map(mapTemplateRow);
}

export async function createCommunicationTemplate(input: {
  category: string;
  title: string;
  subject?: string | null;
  content: string;
  tags?: string | null;
  actor: string;
}): Promise<CommunicationTemplate> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error('Template title is required.');
  if (!content) throw new Error('Template message content is required.');

  const [created] = await db
    .insert(communicationTemplates)
    .values({
      category: normalizeCommCategory(input.category),
      title,
      subject: input.subject?.trim() || null,
      content,
      tags: input.tags?.trim() || null,
      createdBy: input.actor,
      updatedBy: input.actor,
    })
    .returning();

  return mapTemplateRow(created);
}

export async function updateCommunicationTemplate(
  id: number,
  input: {
    category?: string;
    title?: string;
    subject?: string | null;
    content?: string;
    tags?: string | null;
    actor: string;
  }
): Promise<CommunicationTemplate | null> {
  const [existing] = await db
    .select()
    .from(communicationTemplates)
    .where(eq(communicationTemplates.id, id))
    .limit(1);
  if (!existing) return null;

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  const content =
    input.content !== undefined ? input.content.trim() : existing.content;
  if (!title) throw new Error('Template title is required.');
  if (!content) throw new Error('Template message content is required.');

  const [updated] = await db
    .update(communicationTemplates)
    .set({
      category:
        input.category !== undefined
          ? normalizeCommCategory(input.category)
          : existing.category,
      title,
      subject:
        input.subject !== undefined
          ? input.subject?.trim() || null
          : existing.subject,
      content,
      tags: input.tags !== undefined ? input.tags?.trim() || null : existing.tags,
      updatedBy: input.actor,
      updatedAt: new Date(),
    })
    .where(eq(communicationTemplates.id, id))
    .returning();

  return mapTemplateRow(updated);
}

export async function deleteCommunicationTemplate(id: number): Promise<boolean> {
  const deleted = await db
    .delete(communicationTemplates)
    .where(eq(communicationTemplates.id, id))
    .returning({ id: communicationTemplates.id });
  return deleted.length > 0;
}

// Departments CRUD
export async function fetchDepartments(): Promise<DepartmentItem[]> {
  await ensurePortalStarterData();
  const [deptRows, memberCounts] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.name)),
    db
      .select({
        departmentId: users.departmentId,
        total: count(),
      })
      .from(users)
      .groupBy(users.departmentId),
  ]);

  const countMap = new Map<number, number>();
  for (const row of memberCounts) {
    if (row.departmentId !== null) {
      countMap.set(row.departmentId, Number(row.total));
    }
  }

  return deptRows.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description ?? null,
    leadName: d.leadName ?? null,
    memberCount: countMap.get(d.id) ?? 0,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function createDepartmentRecord(input: {
  name: string;
  description?: string | null;
  leadName?: string | null;
}): Promise<DepartmentItem> {
  const name = input.name.trim();
  if (!name) throw new Error('Department name is required.');

  const [created] = await db
    .insert(departments)
    .values({
      name,
      description: input.description?.trim() || null,
      leadName: input.leadName?.trim() || null,
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    description: created.description ?? null,
    leadName: created.leadName ?? null,
    memberCount: 0,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function updateDepartmentRecord(
  id: number,
  input: {
    name?: string;
    description?: string | null;
    leadName?: string | null;
  }
): Promise<DepartmentItem | null> {
  const [existing] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error('Department name is required.');

  const [updated] = await db
    .update(departments)
    .set({
      name,
      description:
        input.description !== undefined
          ? input.description?.trim() || null
          : existing.description,
      leadName:
        input.leadName !== undefined
          ? input.leadName?.trim() || null
          : existing.leadName,
      updatedAt: new Date(),
    })
    .where(eq(departments.id, id))
    .returning();

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description ?? null,
    leadName: updated.leadName ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteDepartmentRecord(id: number): Promise<boolean> {
  const deleted = await db
    .delete(departments)
    .where(eq(departments.id, id))
    .returning({ id: departments.id });
  return deleted.length > 0;
}

// Team Targets CRUD
export async function fetchTeamTargets(monthKey?: string): Promise<TeamTargetItem[]> {
  const activeMonth =
    monthKey && /^\d{4}-\d{2}$/.test(monthKey)
      ? monthKey
      : getTodayIsoDate().slice(0, 7);

  const [targetRows, userRows, deptRows] = await Promise.all([
    db
      .select()
      .from(teamTargets)
      .where(eq(teamTargets.monthKey, activeMonth))
      .orderBy(asc(teamTargets.userId)),
    db.select().from(users),
    db.select().from(departments),
  ]);

  const deptNameMap = new Map<number, string>();
  for (const d of deptRows) deptNameMap.set(d.id, d.name);

  const userMap = new Map<number, typeof users.$inferSelect>();
  for (const u of userRows) userMap.set(u.id, u);

  return targetRows.map((t) => {
    const u = userMap.get(t.userId);
    return {
      id: t.id,
      userId: t.userId,
      userDisplayName: u ? u.displayName || u.username : `User #${t.userId}`,
      username: u?.username || '',
      departmentName:
        u?.departmentId !== null && u?.departmentId !== undefined
          ? deptNameMap.get(u.departmentId) ?? null
          : null,
      monthKey: t.monthKey,
      leadsTarget: t.leadsTarget,
      wonTarget: t.wonTarget,
      revenueTarget: t.revenueTarget,
      notes: t.notes ?? null,
      createdBy: t.createdBy,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  });
}

export async function upsertTeamTargetRecord(input: {
  userId: number;
  monthKey: string;
  leadsTarget: number;
  wonTarget: number;
  revenueTarget: number;
  notes?: string | null;
  actor: string;
}): Promise<TeamTargetItem> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error('Valid team member is required.');
  }
  if (!/^\d{4}-\d{2}$/.test(input.monthKey)) {
    throw new Error('Month must use YYYY-MM format.');
  }

  const leadsTarget = Math.max(0, Math.round(Number(input.leadsTarget) || 0));
  const wonTarget = Math.max(0, Math.round(Number(input.wonTarget) || 0));
  const revenueTarget = Math.max(0, Number(input.revenueTarget) || 0);

  await db
    .insert(teamTargets)
    .values({
      userId: input.userId,
      monthKey: input.monthKey,
      leadsTarget,
      wonTarget,
      revenueTarget,
      notes: input.notes?.trim() || null,
      createdBy: input.actor,
    })
    .onConflictDoUpdate({
      target: [teamTargets.userId, teamTargets.monthKey],
      set: {
        leadsTarget,
        wonTarget,
        revenueTarget,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      },
    });

  const rows = await fetchTeamTargets(input.monthKey);
  const saved = rows.find((r) => r.userId === input.userId);
  if (!saved) throw new Error('Failed to load saved team target.');
  return saved;
}

export async function deleteTeamTargetRecord(id: number): Promise<boolean> {
  const deleted = await db
    .delete(teamTargets)
    .where(eq(teamTargets.id, id))
    .returning({ id: teamTargets.id });
  return deleted.length > 0;
}

// Combined Dashboard
export async function fetchCombinedDashboard(options: {
  viewerUserId: number;
  viewerName: string;
  isSuperAdmin: boolean;
  sessionTokenHash: string;
}): Promise<CombinedDashboardData> {
  const [scopedLeads, allPlans, catRows, latestImports, latestPriceChanges] =
    await Promise.all([
      fetchScopedLeads({
        scope: options.isSuperAdmin ? 'any' : 'me',
        viewerUserId: options.viewerUserId,
        viewerName: options.viewerName,
        isSuperAdmin: options.isSuperAdmin,
        sessionTokenHash: options.sessionTokenHash,
      }),
      fetchAllPlans({ activeOnly: false }),
      db.select({ id: categories.id }).from(categories),
      db
        .select()
        .from(importHistory)
        .orderBy(desc(importHistory.createdAt))
        .limit(5),
      db
        .select()
        .from(pricingHistory)
        .orderBy(desc(pricingHistory.changedAt))
        .limit(6),
    ]);

  const today = getTodayIsoDate();
  let newToday = 0;
  let followUpsDue = 0;
  let overdue = 0;
  let wonCount = 0;
  let positiveCount = 0;

  for (const lead of scopedLeads) {
    if (lead.leadDate === today) newToday += 1;
    if (lead.status === 'won') wonCount += 1;
    if (lead.status === 'positive_lead') positiveCount += 1;
    const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, today);
    if (urgency === 'today') followUpsDue += 1;
    if (urgency === 'overdue') overdue += 1;
  }

  return {
    leadSummary: {
      totalLeads: scopedLeads.length,
      newToday,
      followUpsDue,
      overdue,
      wonCount,
      positiveCount,
      recentLeads: scopedLeads.slice(0, 6).map((l) => ({
        id: l.id,
        leadCode: l.leadCode,
        name: l.name,
        phone: l.phone,
        status: l.status,
        source: l.source,
        leadDate: l.leadDate,
        followUpDate: l.followUpDate,
        ownerName: l.ownerName,
      })),
    },
    catalogSummary: {
      totalPlans: allPlans.length,
      activePlans: allPlans.filter((p) => p.isActive).length,
      categoriesCount: catRows.length,
      lastImportAt: latestImports[0]?.createdAt
        ? latestImports[0].createdAt.toISOString()
        : null,
      recentPlans: allPlans.slice(0, 6),
      recentImports: latestImports.map((imp) => ({
        id: imp.id,
        originalFilename: imp.originalFilename,
        uploadedBy: imp.uploadedBy,
        uploadedByEmail: imp.uploadedByEmail,
        worksheetNames: Array.isArray(imp.worksheetNames) ? imp.worksheetNames : [],
        importMode: imp.importMode,
        totalPlansDetected: imp.totalPlansDetected,
        newPlansImported: imp.newPlansImported,
        existingPlansUpdated: imp.existingPlansUpdated,
        status: imp.status,
        errorInfo: imp.errorInfo ?? null,
        summaryData: imp.summaryData ?? null,
        createdAt: imp.createdAt.toISOString(),
      })),
      recentPriceChanges: latestPriceChanges.map((ph) => ({
        id: ph.id,
        planId: ph.planId ?? null,
        planName: ph.planName,
        categoryName: ph.categoryName,
        billingCycle: ph.billingCycle as CombinedDashboardData['catalogSummary']['recentPriceChanges'][number]['billingCycle'],
        previousPrice: ph.previousPrice ?? null,
        newPrice: ph.newPrice ?? null,
        previousDiscountedPrice: ph.previousDiscountedPrice ?? null,
        newDiscountedPrice: ph.newDiscountedPrice ?? null,
        changeType: ph.changeType as 'created' | 'updated' | 'removed',
        sourceFilename: ph.sourceFilename ?? null,
        updatedBy: ph.updatedBy,
        changedAt: ph.changedAt.toISOString(),
      })),
    },
  };
}

// Reports & Analytics
export async function fetchReportsAnalytics(options: {
  viewerUserId: number;
  isSuperAdmin: boolean;
  monthKey?: string;
}): Promise<ReportsAnalyticsData> {
  await ensureLeadsSchemaMigrated();

  const activeMonth =
    options.monthKey && /^\d{4}-\d{2}$/.test(options.monthKey)
      ? options.monthKey
      : getTodayIsoDate().slice(0, 7);

  const [allLeadRows, allUsers, allDepts, monthTargets] = await Promise.all([
    options.isSuperAdmin
      ? db.select().from(leads)
      : db.select().from(leads).where(eq(leads.ownerUserId, options.viewerUserId)),
    db.select().from(users).where(eq(users.isActive, true)).orderBy(asc(users.id)),
    db.select().from(departments),
    db.select().from(teamTargets).where(eq(teamTargets.monthKey, activeMonth)),
  ]);

  const totalLeads = allLeadRows.length;
  let activePipeline = 0;
  let wonLeads = 0;
  let lostAndDenied = 0;
  let wonRevenue = 0;
  let pipelineValue = 0;
  let b2bCount = 0;
  let retailCount = 0;

  const statusCountMap = new Map<string, { count: number; value: number }>();
  const sourceMap = new Map<
    string,
    { total: number; won: number; revenue: number }
  >();
  const monthlyMap = new Map<
    string,
    { newLeads: number; wonLeads: number; revenue: number }
  >();

  for (const row of allLeadRows) {
    const status = normalizeLeadStatus(row.status);
    const source = normalizeLeadSource(row.source);
    const leadType = normalizeLeadType(row.leadType);
    const val = Number(row.dealValue) || 0;

    if (leadType === 'b2b') b2bCount += 1;
    else retailCount += 1;

    if (status === 'won') {
      wonLeads += 1;
      wonRevenue += val;
    } else if (status === 'lost' || status === 'denied' || status === 'cold_lead') {
      lostAndDenied += 1;
    } else {
      activePipeline += 1;
      pipelineValue += val;
    }

    const stEntry = statusCountMap.get(status) ?? { count: 0, value: 0 };
    stEntry.count += 1;
    stEntry.value += val;
    statusCountMap.set(status, stEntry);

    const srcEntry = sourceMap.get(source) ?? { total: 0, won: 0, revenue: 0 };
    srcEntry.total += 1;
    if (status === 'won') {
      srcEntry.won += 1;
      srcEntry.revenue += val;
    }
    sourceMap.set(source, srcEntry);

    const mKey = (row.leadDate || getTodayIsoDate()).slice(0, 7);
    const mEntry = monthlyMap.get(mKey) ?? {
      newLeads: 0,
      wonLeads: 0,
      revenue: 0,
    };
    mEntry.newLeads += 1;
    if (status === 'won') {
      mEntry.wonLeads += 1;
      mEntry.revenue += val;
    }
    monthlyMap.set(mKey, mEntry);
  }

  const byStatus: AnalyticsStatusRow[] = ALL_LEAD_STATUSES.map((status) => {
    const entry = statusCountMap.get(status) ?? { count: 0, value: 0 };
    return {
      status,
      count: entry.count,
      percentage: totalLeads > 0 ? Math.round((entry.count / totalLeads) * 1000) / 10 : 0,
      pipelineValue: entry.value,
    };
  });

  const bySource: AnalyticsSourceRow[] = LEAD_FORM_SOURCES.map((source) => {
    const entry = sourceMap.get(source) ?? { total: 0, won: 0, revenue: 0 };
    return {
      source,
      totalLeads: entry.total,
      wonLeads: entry.won,
      conversionRate:
        entry.total > 0 ? Math.round((entry.won / entry.total) * 1000) / 10 : 0,
      revenue: entry.revenue,
    };
  }).sort((a, b) => b.totalLeads - a.totalLeads);

  const monthKeys = Array.from(new Set([...monthlyMap.keys(), activeMonth]))
    .sort()
    .slice(-6);

  const monthlyTrend: AnalyticsMonthlyRow[] = monthKeys.map((mk) => {
    const [yr, mo] = mk.split('-').map(Number);
    const dt = new Date(yr, (mo || 1) - 1, 1);
    const label = Number.isNaN(dt.getTime())
      ? mk
      : dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const entry = monthlyMap.get(mk) ?? { newLeads: 0, wonLeads: 0, revenue: 0 };
    return {
      monthKey: mk,
      label,
      newLeads: entry.newLeads,
      wonLeads: entry.wonLeads,
      revenue: entry.revenue,
    };
  });

  const deptNameMap = new Map<number, string>();
  for (const d of allDepts) deptNameMap.set(d.id, d.name);

  const targetByUser = new Map<number, typeof teamTargets.$inferSelect>();
  for (const t of monthTargets) targetByUser.set(t.userId, t);

  const visibleUsers = options.isSuperAdmin
    ? allUsers
    : allUsers.filter((u) => u.id === options.viewerUserId);

  const teamPerformance: AnalyticsTeamRow[] = visibleUsers.map((u) => {
    const userLeads = allLeadRows.filter((l) => l.ownerUserId === u.id);
    const newLeadsThisMonth = userLeads.filter(
      (l) => (l.leadDate || '').slice(0, 7) === activeMonth
    ).length;
    const activeFollowUps = userLeads.filter(
      (l) => Boolean(l.followUpDate) && !isClosedLeadStatus(normalizeLeadStatus(l.status))
    ).length;
    const wonUserLeads = userLeads.filter(
      (l) => normalizeLeadStatus(l.status) === 'won'
    );
    const wonRev = wonUserLeads.reduce(
      (sum, l) => sum + (Number(l.dealValue) || 0),
      0
    );
    const t = targetByUser.get(u.id);
    return {
      userId: u.id,
      displayName: u.displayName || u.username,
      username: u.username,
      departmentName:
        u.departmentId !== null && u.departmentId !== undefined
          ? deptNameMap.get(u.departmentId) ?? null
          : null,
      avatarUrl: u.avatarUrl ?? null,
      totalLeads: userLeads.length,
      newLeadsThisMonth,
      activeFollowUps,
      wonLeads: wonUserLeads.length,
      conversionRate:
        userLeads.length > 0
          ? Math.round((wonUserLeads.length / userLeads.length) * 1000) / 10
          : 0,
      wonRevenue: wonRev,
      leadsTarget: t?.leadsTarget ?? 0,
      wonTarget: t?.wonTarget ?? 0,
      revenueTarget: t?.revenueTarget ?? 0,
    };
  });

  return {
    monthKey: activeMonth,
    summary: {
      totalLeads,
      activePipeline,
      wonLeads,
      lostAndDenied,
      conversionRate:
        totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 1000) / 10 : 0,
      wonRevenue,
      pipelineValue,
      b2bCount,
      retailCount,
    },
    byStatus,
    bySource,
    monthlyTrend,
    teamPerformance,
  };
}
