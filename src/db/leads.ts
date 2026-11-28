import crypto from 'node:crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { db } from './index.ts';
import {
  leadAccessGrants,
  leadAccessLogs,
  leadRemarks,
  leads,
  settings,
  users,
} from './schema.ts';
import { getOrInitSettings } from './defaults.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import {
  CLOSED_LEAD_STATUSES,
  formatLeadCodeFromNumber,
  getTodayIsoDate,
  normalizeFollowUpTimeInput,
  normalizeIsoDateInput,
  normalizeLeadPhone,
  normalizeLeadSource,
  normalizeLeadStatus,
  normalizeLeadType,
} from '../shared/leads.ts';
import type {
  LeadAccessLogItem,
  LeadColleagueOption,
  LeadInterventionScope,
  LeadItem,
  LeadRemarkItem,
  LeadSource,
  LeadStatus,
  LeadType,
  UserRole,
} from '../shared/types.ts';

export class LeadAccessDeniedError extends Error {
  requiresUnlock: boolean;
  targetUserId?: number;

  constructor(message: string, targetUserId?: number) {
    super(message);
    this.name = 'LeadAccessDeniedError';
    this.requiresUnlock = true;
    this.targetUserId = targetUserId;
  }
}

export interface CreateOrUpdateLeadInput {
  leadCode?: string | null;
  ownerUserId?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  leadType?: LeadType | string | null;
  source?: LeadSource | string;
  campaignName?: string | null;
  status?: LeadStatus | string;
  latestRemark?: string | null;
  leadDate?: string | null;
  followUpDate?: string | null;
  followUpTime?: string | null;
  dealValue?: number | null;
  watcherUserIds?: number[];
  actor: string;
}

export interface AddLeadRemarkInput {
  remark: string;
  statusAtCall: LeadStatus | string;
  callDate?: string | null;
  followUpDate?: string | null;
  followUpTime?: string | null;
  actor: string;
}

let schemaMigrationPromise: Promise<void> | null = null;

const LEGACY_STATUS_MAP: Record<string, LeadStatus> = {
  call_needed: 'new_lead',
  positive: 'positive_lead',
  converted: 'won',
  existing_client: 'existing_client_lead',
  not_required: 'cold_lead',
  deny: 'denied',
};

const LEGACY_SOURCE_MAP: Record<string, LeadSource> = {
  aisensy: 'aisensy_organic',
  whatsapp: 'aisensy_organic',
  csv_import: 'import',
  website: 'website_whmcs',
  manual: 'other',
  inbound_call: 'other',
};

export async function ensureLeadsSchemaMigrated(): Promise<void> {
  if (!schemaMigrationPromise) {
    schemaMigrationPromise = (async () => {
      await ensureLeadOwnersBackfilled();

      // 1. Auto-map legacy statuses in leads and lead_remarks
      for (const [legacyStatus, nextStatus] of Object.entries(LEGACY_STATUS_MAP)) {
        await db
          .update(leads)
          .set({ status: nextStatus })
          .where(eq(leads.status, legacyStatus));
        await db
          .update(leadRemarks)
          .set({ statusAtCall: nextStatus })
          .where(eq(leadRemarks.statusAtCall, legacyStatus));
      }

      // 2. Auto-map legacy sources in leads
      for (const [legacySource, nextSource] of Object.entries(LEGACY_SOURCE_MAP)) {
        await db
          .update(leads)
          .set({ source: nextSource })
          .where(eq(leads.source, legacySource));
      }

      // 3. Backfill sequential unique Lead IDs (HG-0001, HG-0002, ...)
      const allCodeRows = await db
        .select({ id: leads.id, leadCode: leads.leadCode })
        .from(leads)
        .orderBy(asc(leads.id));

      let maxNum = 0;
      const usedCodes = new Set<string>();
      for (const r of allCodeRows) {
        const clean = (r.leadCode || '').trim();
        if (clean) {
          usedCodes.add(clean.toUpperCase());
          const match = /^HG-(\d+)$/i.exec(clean);
          if (match) {
            const num = Number(match[1]);
            if (num > maxNum) maxNum = num;
          }
        }
      }

      for (const r of allCodeRows) {
        if (!r.leadCode || !r.leadCode.trim()) {
          maxNum += 1;
          let candidate = formatLeadCodeFromNumber(maxNum);
          while (usedCodes.has(candidate.toUpperCase())) {
            maxNum += 1;
            candidate = formatLeadCodeFromNumber(maxNum);
          }
          usedCodes.add(candidate.toUpperCase());
          await db
            .update(leads)
            .set({ leadCode: candidate })
            .where(eq(leads.id, r.id));
        }
      }
    })().catch((err) => {
      schemaMigrationPromise = null;
      throw err;
    });
  }
  await schemaMigrationPromise;
}

function normalizeEmailInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Enter a valid email address or leave email blank.');
  }
  return trimmed;
}

function normalizeDealValueInput(raw: number | null | undefined): number | null {
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return null;
  const num = Number(raw);
  if (num < 0) return 0;
  return Math.round(num * 100) / 100;
}

async function normalizeWatcherIdsInput(rawIds: number[] | undefined): Promise<number[]> {
  if (!Array.isArray(rawIds) || rawIds.length === 0) return [];
  const clean = Array.from(
    new Set(rawIds.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (clean.length === 0) return [];
  const validRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, clean), eq(users.isActive, true)));
  return validRows.map((r) => r.id);
}

async function generateNextLeadCode(): Promise<string> {
  const existingCodes = await db
    .select({ leadCode: leads.leadCode })
    .from(leads)
    .where(isNotNull(leads.leadCode));

  let maxNum = 0;
  const used = new Set<string>();
  for (const row of existingCodes) {
    const clean = (row.leadCode || '').trim();
    if (!clean) continue;
    used.add(clean.toUpperCase());
    const match = /^HG-(\d+)$/i.exec(clean);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = formatLeadCodeFromNumber(nextNum);
  while (used.has(candidate.toUpperCase())) {
    nextNum += 1;
    candidate = formatLeadCodeFromNumber(nextNum);
  }
  return candidate;
}

async function resolveAndValidateLeadCode(
  rawCode: string | null | undefined,
  excludeLeadId?: number
): Promise<string> {
  const clean = (rawCode || '').trim();
  if (!clean) {
    return generateNextLeadCode();
  }
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(clean)) {
    throw new Error(
      'Lead ID must be 2-32 characters using letters, numbers, hyphens, or underscores (e.g. HG-0001).'
    );
  }

  const normalized = clean.toUpperCase();
  const conflictRows = await db
    .select({ id: leads.id, leadCode: leads.leadCode })
    .from(leads)
    .where(sql`UPPER(${leads.leadCode}) = ${normalized}`)
    .limit(2);

  const conflict = conflictRows.find((r) => r.id !== excludeLeadId);
  if (conflict) {
    throw new Error(`Lead ID "${normalized}" already exists. Use a unique Lead ID.`);
  }

  return normalized;
}

async function fetchUserNameMap(): Promise<Map<number, string>> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users);
  const map = new Map<number, string>();
  for (const u of rows) {
    map.set(u.id, u.displayName || u.username);
  }
  return map;
}

async function fetchDuplicatePhoneMap(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      normalizedPhone: leads.normalizedPhone,
      total: count(),
    })
    .from(leads)
    .groupBy(leads.normalizedPhone);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.normalizedPhone) {
      map.set(row.normalizedPhone, Number(row.total));
    }
  }
  return map;
}

function mapLeadRow(
  row: typeof leads.$inferSelect,
  remarksCount: number,
  userNameMap: Map<number, string>,
  duplicatePhoneMap?: Map<string, number>,
  remarks?: LeadRemarkItem[]
): LeadItem {
  const watcherUserIds = Array.isArray(row.watcherUserIds)
    ? row.watcherUserIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const watcherNames = watcherUserIds
    .map((id) => userNameMap.get(id))
    .filter((name): name is string => Boolean(name));

  return {
    id: row.id,
    leadCode: row.leadCode || formatLeadCodeFromNumber(row.id),
    ownerUserId: row.ownerUserId ?? null,
    ownerName: row.ownerName || row.createdBy || 'Team',
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalizedPhone,
    email: row.email ?? null,
    leadType: normalizeLeadType(row.leadType),
    source: normalizeLeadSource(row.source),
    campaignName: row.campaignName ?? null,
    status: normalizeLeadStatus(row.status),
    latestRemark: row.latestRemark || '',
    leadDate: row.leadDate,
    followUpDate: row.followUpDate ?? null,
    followUpTime: row.followUpTime ?? null,
    reminderNotifiedAt: row.reminderNotifiedAt
      ? row.reminderNotifiedAt.toISOString()
      : null,
    dealValue: row.dealValue ?? null,
    watcherUserIds,
    watcherNames,
    ...(duplicatePhoneMap
      ? {
          duplicatePhoneCount:
            duplicatePhoneMap.get(row.normalizedPhone) ?? 1,
        }
      : {}),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    remarksCount,
    ...(remarks ? { remarks } : {}),
  };
}

function mapRemarkRow(row: typeof leadRemarks.$inferSelect): LeadRemarkItem {
  return {
    id: row.id,
    leadId: row.leadId,
    remark: row.remark,
    statusAtCall: normalizeLeadStatus(row.statusAtCall),
    callDate: row.callDate,
    followUpDate: row.followUpDate ?? null,
    followUpTime: row.followUpTime ?? null,
    loggedBy: row.loggedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureLeadOwnersBackfilled(): Promise<void> {
  const unassigned = await db
    .select({ id: leads.id, createdBy: leads.createdBy })
    .from(leads)
    .where(isNull(leads.ownerUserId))
    .limit(50);

  if (unassigned.length === 0) return;

  const userRows = await db.select().from(users);
  if (userRows.length === 0) return;

  const fallbackUser =
    userRows.find((u) => u.role === 'super_admin' && u.isActive) ?? userRows[0];

  for (const row of unassigned) {
    const key = (row.createdBy || '').trim().toLowerCase();
    const matched =
      userRows.find(
        (u) =>
          (u.displayName || '').trim().toLowerCase() === key ||
          u.username.trim().toLowerCase() === key
      ) ?? fallbackUser;

    await db
      .update(leads)
      .set({
        ownerUserId: matched.id,
        ownerName: matched.displayName || matched.username,
      })
      .where(eq(leads.id, row.id));
  }
}

export async function getUnlockedTargetIds(
  sessionTokenHash: string,
  viewerUserId: number
): Promise<Set<number>> {
  const rows = await db
    .select({ targetUserId: leadAccessGrants.targetUserId })
    .from(leadAccessGrants)
    .where(
      and(
        eq(leadAccessGrants.sessionTokenHash, sessionTokenHash),
        eq(leadAccessGrants.viewerUserId, viewerUserId),
        gt(leadAccessGrants.expiresAt, new Date())
      )
    );
  return new Set(rows.map((r) => r.targetUserId));
}

export async function hasLeadOwnerAccess(
  sessionTokenHash: string,
  viewerUserId: number,
  ownerUserId: number | null
): Promise<boolean> {
  if (!ownerUserId || ownerUserId === viewerUserId) return true;
  const unlocked = await getUnlockedTargetIds(sessionTokenHash, viewerUserId);
  return unlocked.has(ownerUserId);
}

export async function hasLeadViewAccess(
  sessionTokenHash: string,
  viewerUserId: number,
  leadRow: typeof leads.$inferSelect
): Promise<boolean> {
  if (
    Array.isArray(leadRow.watcherUserIds) &&
    leadRow.watcherUserIds.includes(viewerUserId)
  ) {
    return true;
  }
  return hasLeadOwnerAccess(
    sessionTokenHash,
    viewerUserId,
    leadRow.ownerUserId
  );
}

export async function recordLeadAccessLog(entry: {
  viewerUserId: number | null;
  viewerName: string;
  targetUserId: number | null;
  targetName: string;
  action: string;
  details?: string | null;
}): Promise<void> {
  await db.insert(leadAccessLogs).values({
    viewerUserId: entry.viewerUserId,
    viewerName: entry.viewerName,
    targetUserId: entry.targetUserId,
    targetName: entry.targetName,
    action: entry.action,
    details: entry.details ?? null,
  });
}

export async function fetchLeadColleagues(
  viewerUserId: number,
  sessionTokenHash: string
): Promise<{
  myLeadCount: number;
  watchedLeadCount: number;
  colleagues: LeadColleagueOption[];
}> {
  await ensureLeadsSchemaMigrated();

  const [allUsers, countRows, watchedCountRows, unlockedSet] = await Promise.all([
    db.select().from(users).where(eq(users.isActive, true)),
    db
      .select({
        ownerUserId: leads.ownerUserId,
        total: count(),
      })
      .from(leads)
      .groupBy(leads.ownerUserId),
    db
      .select({ total: count() })
      .from(leads)
      .where(
        sql`${leads.watcherUserIds}::jsonb @> ${JSON.stringify([viewerUserId])}::jsonb`
      ),
    getUnlockedTargetIds(sessionTokenHash, viewerUserId),
  ]);

  const countMap = new Map<number, number>();
  for (const row of countRows) {
    if (row.ownerUserId !== null) {
      countMap.set(row.ownerUserId, Number(row.total));
    }
  }

  const myLeadCount = countMap.get(viewerUserId) ?? 0;
  const watchedLeadCount = Number(watchedCountRows[0]?.total ?? 0);

  const colleagues: LeadColleagueOption[] = allUsers
    .filter((u) => u.id !== viewerUserId)
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.username,
      role: u.role as UserRole,
      hasSecurityCode: Boolean(u.leadSecurityCodeHash),
      unlocked: unlockedSet.has(u.id),
      leadCount: countMap.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { myLeadCount, watchedLeadCount, colleagues };
}

export async function fetchScopedLeads(options: {
  scope: LeadInterventionScope;
  targetUserId?: number | null;
  viewerUserId: number;
  viewerName: string;
  isSuperAdmin?: boolean;
  sessionTokenHash: string;
  logSwitch?: boolean;
}): Promise<LeadItem[]> {
  await ensureLeadsSchemaMigrated();

  const unlockedSet = await getUnlockedTargetIds(
    options.sessionTokenHash,
    options.viewerUserId
  );

  let leadRows: Array<typeof leads.$inferSelect> = [];

  if (options.scope === 'me') {
    leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.ownerUserId, options.viewerUserId))
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  } else if (options.scope === 'watched') {
    leadRows = await db
      .select()
      .from(leads)
      .where(
        sql`${leads.watcherUserIds}::jsonb @> ${JSON.stringify([options.viewerUserId])}::jsonb`
      )
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  } else if (options.scope === 'user') {
    const targetId = options.targetUserId ?? options.viewerUserId;
    if (targetId !== options.viewerUserId && !unlockedSet.has(targetId)) {
      throw new LeadAccessDeniedError(
        'Enter the user security code to view their leads.',
        targetId
      );
    }

    if (options.logSwitch && targetId !== options.viewerUserId) {
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (targetUser) {
        await recordLeadAccessLog({
          viewerUserId: options.viewerUserId,
          viewerName: options.viewerName,
          targetUserId: targetUser.id,
          targetName: targetUser.displayName || targetUser.username,
          action: 'viewed_leads',
          details: `Switched workspace to ${targetUser.displayName || targetUser.username}'s leads`,
        });
      }
    }

    leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.ownerUserId, targetId))
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  } else if (options.scope === 'other') {
    const otherIds = Array.from(unlockedSet).filter(
      (id) => id !== options.viewerUserId
    );
    if (otherIds.length === 0) {
      return [];
    }
    leadRows = await db
      .select()
      .from(leads)
      .where(inArray(leads.ownerUserId, otherIds))
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  } else {
    // 'any': own leads + unlocked colleagues' leads + leads watched by viewer
    const allowedIds = Array.from(
      new Set([options.viewerUserId, ...Array.from(unlockedSet)])
    );
    leadRows = await db
      .select()
      .from(leads)
      .where(
        or(
          inArray(leads.ownerUserId, allowedIds),
          sql`${leads.watcherUserIds}::jsonb @> ${JSON.stringify([options.viewerUserId])}::jsonb`
        )
      )
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  }

  if (leadRows.length === 0) return [];

  const leadIds = leadRows.map((l) => l.id);
  const [countRows, userNameMap, duplicatePhoneMap] = await Promise.all([
    db
      .select({
        leadId: leadRemarks.leadId,
        total: count(),
      })
      .from(leadRemarks)
      .where(inArray(leadRemarks.leadId, leadIds))
      .groupBy(leadRemarks.leadId),
    fetchUserNameMap(),
    options.isSuperAdmin ? fetchDuplicatePhoneMap() : Promise.resolve(undefined),
  ]);

  const countMap = new Map<number, number>();
  for (const row of countRows) {
    countMap.set(row.leadId, Number(row.total));
  }

  return leadRows.map((row) =>
    mapLeadRow(
      row,
      countMap.get(row.id) ?? 0,
      userNameMap,
      duplicatePhoneMap
    )
  );
}

export async function setUserLeadSecurityCode(
  userId: number,
  rawCode: string
): Promise<void> {
  const clean = rawCode.trim();
  if (clean.length < 4 || clean.length > 32) {
    throw new Error('Security code must be between 4 and 32 characters.');
  }

  await db
    .update(users)
    .set({
      leadSecurityCodeHash: hashPassword(clean),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function unlockColleagueLeads(options: {
  sessionTokenHash: string;
  viewerUserId: number;
  viewerName: string;
  targetUserId: number;
  securityCode: string;
}): Promise<{ targetUserId: number; targetName: string }> {
  const cleanCode = options.securityCode.trim();
  if (!cleanCode) {
    throw new Error('Enter the security code.');
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, options.targetUserId))
    .limit(1);

  if (!targetUser || !targetUser.isActive) {
    throw new Error('Team member account not found or inactive.');
  }

  const targetName = targetUser.displayName || targetUser.username;

  if (!targetUser.leadSecurityCodeHash) {
    throw new Error(
      `${targetName} has not set a Lead Security Code yet. Ask them to set one under Profile → Security Code.`
    );
  }

  const ok = verifyPassword(cleanCode, targetUser.leadSecurityCodeHash);
  if (!ok) {
    await recordLeadAccessLog({
      viewerUserId: options.viewerUserId,
      viewerName: options.viewerName,
      targetUserId: targetUser.id,
      targetName,
      action: 'unlock_failed',
      details: `Incorrect security code entered while trying to access ${targetName}'s leads`,
    });
    throw new LeadAccessDeniedError(
      `Invalid security code for ${targetName}.`,
      targetUser.id
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .delete(leadAccessGrants)
      .where(
        and(
          eq(leadAccessGrants.sessionTokenHash, options.sessionTokenHash),
          eq(leadAccessGrants.viewerUserId, options.viewerUserId),
          eq(leadAccessGrants.targetUserId, targetUser.id)
        )
      );

    await tx.insert(leadAccessGrants).values({
      sessionTokenHash: options.sessionTokenHash,
      viewerUserId: options.viewerUserId,
      targetUserId: targetUser.id,
      expiresAt,
    });
  });

  await recordLeadAccessLog({
    viewerUserId: options.viewerUserId,
    viewerName: options.viewerName,
    targetUserId: targetUser.id,
    targetName,
    action: 'unlock_success',
    details: `${options.viewerName} unlocked ${targetName}'s leads using security code`,
  });

  return { targetUserId: targetUser.id, targetName };
}

export async function lockColleagueLeads(options: {
  sessionTokenHash: string;
  viewerUserId: number;
  targetUserId: number;
}): Promise<void> {
  await db
    .delete(leadAccessGrants)
    .where(
      and(
        eq(leadAccessGrants.sessionTokenHash, options.sessionTokenHash),
        eq(leadAccessGrants.viewerUserId, options.viewerUserId),
        eq(leadAccessGrants.targetUserId, options.targetUserId)
      )
    );
}

export async function fetchLeadAccessLogs(options: {
  viewerUserId: number;
  isSuperAdmin: boolean;
}): Promise<LeadAccessLogItem[]> {
  const rows = options.isSuperAdmin
    ? await db
        .select()
        .from(leadAccessLogs)
        .orderBy(desc(leadAccessLogs.createdAt))
        .limit(200)
    : await db
        .select()
        .from(leadAccessLogs)
        .where(
          or(
            eq(leadAccessLogs.targetUserId, options.viewerUserId),
            eq(leadAccessLogs.viewerUserId, options.viewerUserId)
          )
        )
        .orderBy(desc(leadAccessLogs.createdAt))
        .limit(200);

  return rows.map((r) => ({
    id: r.id,
    viewerUserId: r.viewerUserId ?? null,
    viewerName: r.viewerName,
    targetUserId: r.targetUserId ?? null,
    targetName: r.targetName,
    action: r.action,
    details: r.details ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function fetchLeadById(
  id: number,
  access?: {
    viewerUserId: number;
    sessionTokenHash: string;
    isSuperAdmin?: boolean;
  }
): Promise<LeadItem | null> {
  await ensureLeadsSchemaMigrated();

  const [leadRow] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!leadRow) return null;

  if (access) {
    const allowed = await hasLeadViewAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      leadRow
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to access this lead.',
        leadRow.ownerUserId ?? undefined
      );
    }
  }

  const [remarkRows, userNameMap, duplicatePhoneMap] = await Promise.all([
    db
      .select()
      .from(leadRemarks)
      .where(eq(leadRemarks.leadId, id))
      .orderBy(
        desc(leadRemarks.callDate),
        desc(leadRemarks.createdAt),
        desc(leadRemarks.id)
      ),
    fetchUserNameMap(),
    access?.isSuperAdmin
      ? fetchDuplicatePhoneMap()
      : Promise.resolve(undefined),
  ]);

  const mappedRemarks = remarkRows.map(mapRemarkRow);
  return mapLeadRow(
    leadRow,
    mappedRemarks.length,
    userNameMap,
    duplicatePhoneMap,
    mappedRemarks
  );
}

async function resolveOwnerInfo(
  ownerUserId: number | null | undefined,
  fallbackActor: string
): Promise<{ ownerUserId: number | null; ownerName: string }> {
  if (ownerUserId) {
    const [ownerRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerUserId))
      .limit(1);
    if (ownerRow) {
      return {
        ownerUserId: ownerRow.id,
        ownerName: ownerRow.displayName || ownerRow.username,
      };
    }
  }
  return {
    ownerUserId: ownerUserId ?? null,
    ownerName: fallbackActor,
  };
}

export async function createLeadRecord(
  input: CreateOrUpdateLeadInput,
  access?: {
    viewerUserId: number;
    viewerName: string;
    sessionTokenHash: string;
    isSuperAdmin?: boolean;
  }
): Promise<LeadItem> {
  await ensureLeadsSchemaMigrated();

  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Contact name is required.');
  }

  const { displayPhone, normalizedPhone } = normalizeLeadPhone(input.phone);
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
    throw new Error('Enter a valid contact number (7 to 15 digits).');
  }

  const targetOwnerId = input.ownerUserId ?? access?.viewerUserId ?? null;
  if (access && targetOwnerId && targetOwnerId !== access.viewerUserId) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      targetOwnerId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to add leads for this colleague.',
        targetOwnerId
      );
    }
  }

  const [ownerInfo, leadCode, watcherUserIds] = await Promise.all([
    resolveOwnerInfo(targetOwnerId, input.actor),
    resolveAndValidateLeadCode(input.leadCode),
    normalizeWatcherIdsInput(input.watcherUserIds),
  ]);

  const email = normalizeEmailInput(input.email);
  const leadType = normalizeLeadType(input.leadType);
  const status = normalizeLeadStatus(input.status);
  const source = normalizeLeadSource(input.source);
  const leadDate = normalizeIsoDateInput(input.leadDate) ?? getTodayIsoDate();
  const followUpDate = normalizeIsoDateInput(input.followUpDate);
  const followUpTime = followUpDate
    ? normalizeFollowUpTimeInput(input.followUpTime)
    : null;
  const latestRemark = (input.latestRemark || '').trim();
  const campaignName = input.campaignName?.trim() || null;
  const dealValue = normalizeDealValueInput(input.dealValue);

  const createdLeadId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(leads)
      .values({
        leadCode,
        ownerUserId: ownerInfo.ownerUserId,
        ownerName: ownerInfo.ownerName,
        name: cleanName,
        phone: displayPhone,
        normalizedPhone,
        email,
        leadType,
        source,
        campaignName,
        status,
        latestRemark,
        leadDate,
        followUpDate,
        followUpTime,
        reminderNotifiedAt: null,
        dealValue,
        watcherUserIds,
        createdBy: input.actor,
        updatedBy: input.actor,
      })
      .returning();

    if (latestRemark) {
      await tx.insert(leadRemarks).values({
        leadId: inserted.id,
        remark: latestRemark,
        statusAtCall: status,
        callDate: leadDate,
        followUpDate,
        followUpTime,
        loggedBy: input.actor,
      });
    }

    return inserted.id;
  });

  if (
    access &&
    ownerInfo.ownerUserId &&
    ownerInfo.ownerUserId !== access.viewerUserId
  ) {
    await recordLeadAccessLog({
      viewerUserId: access.viewerUserId,
      viewerName: access.viewerName,
      targetUserId: ownerInfo.ownerUserId,
      targetName: ownerInfo.ownerName,
      action: 'create_lead',
      details: `Added lead "${cleanName}" (${leadCode}) under ${ownerInfo.ownerName}`,
    });
  }

  const full = await fetchLeadById(
    createdLeadId,
    access
      ? {
          viewerUserId: access.viewerUserId,
          sessionTokenHash: access.sessionTokenHash,
          isSuperAdmin: access.isSuperAdmin,
        }
      : undefined
  );
  if (!full) throw new Error('Failed to load newly created lead.');
  return full;
}

export async function updateLeadRecord(
  id: number,
  input: Partial<CreateOrUpdateLeadInput> & { actor: string },
  access?: {
    viewerUserId: number;
    viewerName: string;
    sessionTokenHash: string;
    isSuperAdmin?: boolean;
  }
): Promise<LeadItem | null> {
  await ensureLeadsSchemaMigrated();

  const [existing] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!existing) return null;

  if (access) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      existing.ownerUserId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to modify this lead.',
        existing.ownerUserId ?? undefined
      );
    }
  }

  const nextName = input.name !== undefined ? input.name.trim() : existing.name;
  if (!nextName) {
    throw new Error('Contact name is required.');
  }

  const nextLeadCode =
    input.leadCode !== undefined
      ? await resolveAndValidateLeadCode(input.leadCode, id)
      : existing.leadCode || formatLeadCodeFromNumber(id);

  let nextPhone = existing.phone;
  let nextNormalized = existing.normalizedPhone;
  if (input.phone !== undefined) {
    const phoneInfo = normalizeLeadPhone(input.phone);
    if (
      phoneInfo.normalizedPhone.length < 7 ||
      phoneInfo.normalizedPhone.length > 15
    ) {
      throw new Error('Enter a valid contact number (7 to 15 digits).');
    }
    nextPhone = phoneInfo.displayPhone;
    nextNormalized = phoneInfo.normalizedPhone;
  }

  const nextEmail =
    input.email !== undefined
      ? normalizeEmailInput(input.email)
      : existing.email ?? null;
  const nextLeadType =
    input.leadType !== undefined
      ? normalizeLeadType(input.leadType)
      : normalizeLeadType(existing.leadType);
  const nextSource =
    input.source !== undefined
      ? normalizeLeadSource(input.source)
      : normalizeLeadSource(existing.source);
  const nextCampaign =
    input.campaignName !== undefined
      ? input.campaignName?.trim() || null
      : existing.campaignName;
  const nextStatus =
    input.status !== undefined
      ? normalizeLeadStatus(input.status)
      : normalizeLeadStatus(existing.status);
  const nextRemark =
    input.latestRemark !== undefined
      ? (input.latestRemark || '').trim()
      : existing.latestRemark;
  const nextLeadDate =
    input.leadDate !== undefined
      ? normalizeIsoDateInput(input.leadDate) ?? existing.leadDate
      : existing.leadDate;
  const nextFollowUpDate =
    input.followUpDate !== undefined
      ? normalizeIsoDateInput(input.followUpDate)
      : existing.followUpDate;
  const nextFollowUpTime =
    nextFollowUpDate === null
      ? null
      : input.followUpTime !== undefined
        ? normalizeFollowUpTimeInput(input.followUpTime)
        : existing.followUpTime;
  const nextDealValue =
    input.dealValue !== undefined
      ? normalizeDealValueInput(input.dealValue)
      : existing.dealValue ?? null;
  const nextWatcherUserIds =
    input.watcherUserIds !== undefined
      ? await normalizeWatcherIdsInput(input.watcherUserIds)
      : Array.isArray(existing.watcherUserIds)
        ? existing.watcherUserIds
        : [];

  const scheduleChanged =
    nextFollowUpDate !== existing.followUpDate ||
    nextFollowUpTime !== existing.followUpTime;

  await db
    .update(leads)
    .set({
      leadCode: nextLeadCode,
      name: nextName,
      phone: nextPhone,
      normalizedPhone: nextNormalized,
      email: nextEmail,
      leadType: nextLeadType,
      source: nextSource,
      campaignName: nextCampaign,
      status: nextStatus,
      latestRemark: nextRemark,
      leadDate: nextLeadDate,
      followUpDate: nextFollowUpDate,
      followUpTime: nextFollowUpTime,
      dealValue: nextDealValue,
      watcherUserIds: nextWatcherUserIds,
      ...(scheduleChanged ? { reminderNotifiedAt: null } : {}),
      updatedBy: input.actor,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  if (
    access &&
    existing.ownerUserId &&
    existing.ownerUserId !== access.viewerUserId
  ) {
    await recordLeadAccessLog({
      viewerUserId: access.viewerUserId,
      viewerName: access.viewerName,
      targetUserId: existing.ownerUserId,
      targetName: existing.ownerName || 'Colleague',
      action: 'update_lead',
      details: `Updated lead "${nextName}" (${nextLeadCode}, Status: ${nextStatus})`,
    });
  }

  return fetchLeadById(
    id,
    access
      ? {
          viewerUserId: access.viewerUserId,
          sessionTokenHash: access.sessionTokenHash,
          isSuperAdmin: access.isSuperAdmin,
        }
      : undefined
  );
}

export async function addLeadRemarkRecord(
  leadId: number,
  input: AddLeadRemarkInput,
  access?: {
    viewerUserId: number;
    viewerName: string;
    sessionTokenHash: string;
    isSuperAdmin?: boolean;
  }
): Promise<LeadItem | null> {
  await ensureLeadsSchemaMigrated();

  const [existing] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!existing) return null;

  if (access) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      existing.ownerUserId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to log call remarks on this lead.',
        existing.ownerUserId ?? undefined
      );
    }
  }

  const cleanRemark = input.remark.trim();
  if (!cleanRemark) {
    throw new Error('Call remark text is required.');
  }

  const nextStatus = normalizeLeadStatus(input.statusAtCall);
  const callDate = normalizeIsoDateInput(input.callDate) ?? getTodayIsoDate();
  const nextFollowUpDate =
    input.followUpDate !== undefined
      ? normalizeIsoDateInput(input.followUpDate)
      : existing.followUpDate;
  const nextFollowUpTime =
    nextFollowUpDate === null
      ? null
      : input.followUpTime !== undefined
        ? normalizeFollowUpTimeInput(input.followUpTime)
        : existing.followUpTime;

  const scheduleChanged =
    nextFollowUpDate !== existing.followUpDate ||
    nextFollowUpTime !== existing.followUpTime;

  await db.transaction(async (tx) => {
    await tx.insert(leadRemarks).values({
      leadId,
      remark: cleanRemark,
      statusAtCall: nextStatus,
      callDate,
      followUpDate: nextFollowUpDate,
      followUpTime: nextFollowUpTime,
      loggedBy: input.actor,
    });

    await tx
      .update(leads)
      .set({
        status: nextStatus,
        latestRemark: cleanRemark,
        leadDate: callDate,
        followUpDate: nextFollowUpDate,
        followUpTime: nextFollowUpTime,
        ...(scheduleChanged || nextFollowUpTime ? { reminderNotifiedAt: null } : {}),
        updatedBy: input.actor,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
  });

  if (
    access &&
    existing.ownerUserId &&
    existing.ownerUserId !== access.viewerUserId
  ) {
    await recordLeadAccessLog({
      viewerUserId: access.viewerUserId,
      viewerName: access.viewerName,
      targetUserId: existing.ownerUserId,
      targetName: existing.ownerName || 'Colleague',
      action: 'add_remark',
      details: `Logged call update on "${existing.name}" (${nextStatus})`,
    });
  }

  return fetchLeadById(
    leadId,
    access
      ? {
          viewerUserId: access.viewerUserId,
          sessionTokenHash: access.sessionTokenHash,
          isSuperAdmin: access.isSuperAdmin,
        }
      : undefined
  );
}

export async function fetchActiveLeadReminders(options: {
  viewerUserId: number;
  sessionTokenHash: string;
  isSuperAdmin?: boolean;
}): Promise<LeadItem[]> {
  await ensureLeadsSchemaMigrated();

  const unlockedSet = await getUnlockedTargetIds(
    options.sessionTokenHash,
    options.viewerUserId
  );
  const allowedOwnerIds = Array.from(
    new Set([options.viewerUserId, ...Array.from(unlockedSet)])
  );

  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        or(
          inArray(leads.ownerUserId, allowedOwnerIds),
          sql`${leads.watcherUserIds}::jsonb @> ${JSON.stringify([options.viewerUserId])}::jsonb`
        ),
        isNotNull(leads.followUpDate),
        notInArray(leads.status, CLOSED_LEAD_STATUSES)
      )
    )
    .orderBy(asc(leads.followUpDate), asc(leads.followUpTime), desc(leads.updatedAt));

  if (rows.length === 0) return [];

  const leadIds = rows.map((r) => r.id);
  const [countRows, userNameMap, duplicatePhoneMap] = await Promise.all([
    db
      .select({
        leadId: leadRemarks.leadId,
        total: count(),
      })
      .from(leadRemarks)
      .where(inArray(leadRemarks.leadId, leadIds))
      .groupBy(leadRemarks.leadId),
    fetchUserNameMap(),
    options.isSuperAdmin ? fetchDuplicatePhoneMap() : Promise.resolve(undefined),
  ]);

  const countMap = new Map<number, number>();
  for (const row of countRows) {
    countMap.set(row.leadId, Number(row.total));
  }

  return rows.map((row) =>
    mapLeadRow(row, countMap.get(row.id) ?? 0, userNameMap, duplicatePhoneMap)
  );
}

export async function updateLeadReminderAction(
  leadId: number,
  input: {
    action: 'dismiss' | 'snooze';
    followUpDate?: string | null;
    followUpTime?: string | null;
  },
  access: {
    viewerUserId: number;
    viewerName: string;
    sessionTokenHash: string;
    isSuperAdmin?: boolean;
  }
): Promise<LeadItem | null> {
  await ensureLeadsSchemaMigrated();

  const [existing] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!existing) return null;

  const allowed = await hasLeadOwnerAccess(
    access.sessionTokenHash,
    access.viewerUserId,
    existing.ownerUserId
  );
  if (!allowed) {
    throw new LeadAccessDeniedError(
      'Security code required to update reminder for this lead.',
      existing.ownerUserId ?? undefined
    );
  }

  if (input.action === 'dismiss') {
    await db
      .update(leads)
      .set({
        reminderNotifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
    return fetchLeadById(leadId, access);
  }

  const nextDate = normalizeIsoDateInput(input.followUpDate);
  const nextTime = normalizeFollowUpTimeInput(input.followUpTime);
  if (!nextDate || !nextTime) {
    throw new Error('Valid snooze follow-up date and time are required.');
  }

  await db
    .update(leads)
    .set({
      followUpDate: nextDate,
      followUpTime: nextTime,
      reminderNotifiedAt: null,
      updatedBy: access.viewerName,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  return fetchLeadById(leadId, access);
}

export async function deleteLeadRecord(
  id: number,
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<boolean> {
  const [existing] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!existing) return false;

  if (access) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      existing.ownerUserId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to delete this lead.',
        existing.ownerUserId ?? undefined
      );
    }
  }

  const deleted = await db
    .delete(leads)
    .where(eq(leads.id, id))
    .returning({ id: leads.id });

  if (
    deleted.length > 0 &&
    access &&
    existing.ownerUserId &&
    existing.ownerUserId !== access.viewerUserId
  ) {
    await recordLeadAccessLog({
      viewerUserId: access.viewerUserId,
      viewerName: access.viewerName,
      targetUserId: existing.ownerUserId,
      targetName: existing.ownerName || 'Colleague',
      action: 'delete_lead',
      details: `Deleted lead "${existing.name}"`,
    });
  }

  return deleted.length > 0;
}

export async function deleteLeadsBulk(
  ids: number[],
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<number> {
  const cleanIds = Array.from(
    new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (cleanIds.length === 0) return 0;

  const targetRows = await db
    .select()
    .from(leads)
    .where(inArray(leads.id, cleanIds));

  if (targetRows.length === 0) return 0;

  if (access) {
    const unlocked = await getUnlockedTargetIds(
      access.sessionTokenHash,
      access.viewerUserId
    );
    for (const row of targetRows) {
      if (
        row.ownerUserId &&
        row.ownerUserId !== access.viewerUserId &&
        !unlocked.has(row.ownerUserId)
      ) {
        throw new LeadAccessDeniedError(
          'Security code required to delete selected colleague leads.',
          row.ownerUserId
        );
      }
    }
  }

  const deleted = await db
    .delete(leads)
    .where(inArray(leads.id, cleanIds))
    .returning({ id: leads.id });

  if (deleted.length > 0 && access) {
    const otherOwners = targetRows.filter(
      (r) => r.ownerUserId && r.ownerUserId !== access.viewerUserId
    );
    if (otherOwners.length > 0) {
      await recordLeadAccessLog({
        viewerUserId: access.viewerUserId,
        viewerName: access.viewerName,
        targetUserId: otherOwners[0].ownerUserId,
        targetName: otherOwners[0].ownerName || 'Colleague',
        action: 'delete_lead',
        details: `Bulk deleted ${deleted.length} leads`,
      });
    }
  }

  return deleted.length;
}

export async function transferLeadsBySuperAdmin(input: {
  leadIds?: number[];
  fromUserId?: number | null;
  targetUserId: number;
  note?: string | null;
  actorUserId: number;
  actorName: string;
}): Promise<{
  transferredCount: number;
  targetUserId: number;
  targetOwnerName: string;
}> {
  await ensureLeadsSchemaMigrated();

  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.targetUserId), eq(users.isActive, true)))
    .limit(1);

  if (!targetUser) {
    throw new Error('Selected destination user is invalid or inactive.');
  }

  const targetDisplayName = targetUser.displayName || targetUser.username;

  const cleanLeadIds = Array.isArray(input.leadIds)
    ? Array.from(
        new Set(
          input.leadIds.filter((id) => Number.isInteger(id) && id > 0)
        )
      )
    : [];

  let rowsToTransfer: Array<typeof leads.$inferSelect> = [];

  if (cleanLeadIds.length > 0) {
    if (cleanLeadIds.length > 500) {
      throw new Error('Cannot transfer more than 500 leads in a single request.');
    }
    rowsToTransfer = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, cleanLeadIds));
  } else if (
    input.fromUserId &&
    Number.isInteger(input.fromUserId) &&
    input.fromUserId > 0
  ) {
    if (input.fromUserId === targetUser.id) {
      throw new Error('Source and destination users must be different.');
    }
    rowsToTransfer = await db
      .select()
      .from(leads)
      .where(eq(leads.ownerUserId, input.fromUserId));
  } else {
    throw new Error('Select specific leads or a source team member to transfer.');
  }

  const eligibleRows = rowsToTransfer.filter(
    (row) => row.ownerUserId !== targetUser.id
  );

  if (eligibleRows.length === 0) {
    throw new Error(
      rowsToTransfer.length === 0
        ? 'No matching leads found to transfer.'
        : `Selected leads already belong to ${targetDisplayName}.`
    );
  }

  const eligibleIds = eligibleRows.map((r) => r.id);
  const previousOwners = Array.from(
    new Set(eligibleRows.map((r) => r.ownerName || 'Unassigned'))
  ).join(', ');

  await db
    .update(leads)
    .set({
      ownerUserId: targetUser.id,
      ownerName: targetDisplayName,
      updatedBy: input.actorName,
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, eligibleIds));

  const cleanNote = input.note?.trim();
  await recordLeadAccessLog({
    viewerUserId: input.actorUserId,
    viewerName: input.actorName,
    targetUserId: targetUser.id,
    targetName: targetDisplayName,
    action: 'transfer_lead',
    details: `Transferred ${eligibleIds.length} ${
      eligibleIds.length === 1 ? 'lead' : 'leads'
    } from ${previousOwners} to ${targetDisplayName}${
      cleanNote ? ` (${cleanNote})` : ''
    }`,
  });

  return {
    transferredCount: eligibleIds.length,
    targetUserId: targetUser.id,
    targetOwnerName: targetDisplayName,
  };
}

export async function bulkImportLeadRecords(
  rows: Array<{
    leadCode?: string;
    name?: string;
    phone?: string;
    email?: string;
    leadType?: string;
    remark?: string;
    status?: string;
    source?: string;
    leadDate?: string;
    followUpDate?: string;
    campaignName?: string;
  }>,
  actor: string,
  ownerUserId: number,
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<{
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}> {
  await ensureLeadsSchemaMigrated();

  if (access && ownerUserId !== access.viewerUserId) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      ownerUserId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to import leads into this colleague account.',
        ownerUserId
      );
    }
  }

  const ownerInfo = await resolveOwnerInfo(ownerUserId, actor);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const existingLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.ownerUserId, ownerUserId));
  const byPhone = new Map<string, typeof leads.$inferSelect>();
  for (const row of existingLeads) {
    byPhone.set(row.normalizedPhone, row);
  }

  for (const row of rows) {
    const cleanName = (row.name || '').trim();
    const phoneInfo = normalizeLeadPhone(row.phone || '');
    if (
      !cleanName ||
      phoneInfo.normalizedPhone.length < 7 ||
      phoneInfo.normalizedPhone.length > 15
    ) {
      skippedCount += 1;
      continue;
    }

    const status = normalizeLeadStatus(row.status);
    const source = row.source ? normalizeLeadSource(row.source) : 'import';
    const leadType = row.leadType ? normalizeLeadType(row.leadType) : 'retail';
    let email: string | null = null;
    try {
      email = normalizeEmailInput(row.email);
    } catch {
      email = null;
    }
    const leadDate = normalizeIsoDateInput(row.leadDate) ?? getTodayIsoDate();
    const followUpDate = normalizeIsoDateInput(row.followUpDate);
    const remark = (row.remark || '').trim();
    const campaignName = (row.campaignName || '').trim() || null;

    const existing = byPhone.get(phoneInfo.normalizedPhone);
    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({
            name: cleanName || existing.name,
            email: email ?? existing.email,
            leadType: row.leadType ? leadType : existing.leadType,
            campaignName: campaignName ?? existing.campaignName,
            status: row.status ? status : existing.status,
            latestRemark: remark || existing.latestRemark,
            leadDate: row.leadDate ? leadDate : existing.leadDate,
            followUpDate:
              followUpDate !== null ? followUpDate : existing.followUpDate,
            updatedBy: actor,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, existing.id));

        if (remark) {
          await tx.insert(leadRemarks).values({
            leadId: existing.id,
            remark,
            statusAtCall: row.status ? status : existing.status,
            callDate: leadDate,
            followUpDate:
              followUpDate !== null ? followUpDate : existing.followUpDate,
            loggedBy: actor,
          });
        }
      });
      updatedCount += 1;
    } else {
      let assignedLeadCode: string;
      try {
        assignedLeadCode = await resolveAndValidateLeadCode(row.leadCode);
      } catch {
        assignedLeadCode = await generateNextLeadCode();
      }

      const [inserted] = await db
        .insert(leads)
        .values({
          leadCode: assignedLeadCode,
          ownerUserId: ownerInfo.ownerUserId,
          ownerName: ownerInfo.ownerName,
          name: cleanName,
          phone: phoneInfo.displayPhone,
          normalizedPhone: phoneInfo.normalizedPhone,
          email,
          leadType,
          source,
          campaignName,
          status,
          latestRemark: remark,
          leadDate,
          followUpDate,
          watcherUserIds: [],
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      if (remark) {
        await db.insert(leadRemarks).values({
          leadId: inserted.id,
          remark,
          statusAtCall: status,
          callDate: leadDate,
          followUpDate,
          loggedBy: actor,
        });
      }

      byPhone.set(phoneInfo.normalizedPhone, inserted);
      createdCount += 1;
    }
  }

  if (
    access &&
    ownerUserId !== access.viewerUserId &&
    (createdCount > 0 || updatedCount > 0)
  ) {
    await recordLeadAccessLog({
      viewerUserId: access.viewerUserId,
      viewerName: access.viewerName,
      targetUserId: ownerUserId,
      targetName: ownerInfo.ownerName,
      action: 'create_lead',
      details: `Bulk imported ${createdCount} new & updated ${updatedCount} leads under ${ownerInfo.ownerName}`,
    });
  }

  return { createdCount, updatedCount, skippedCount };
}

export async function getOrEnsureAiSensyWebhookSecret(): Promise<string> {
  const currentSettings = await getOrInitSettings();
  const [row] = await db
    .select({
      id: settings.id,
      aisensyWebhookSecret: settings.aisensyWebhookSecret,
    })
    .from(settings)
    .where(eq(settings.id, currentSettings.id))
    .limit(1);

  if (row?.aisensyWebhookSecret && row.aisensyWebhookSecret.trim().length >= 16) {
    return row.aisensyWebhookSecret;
  }

  const secret = crypto.randomBytes(24).toString('hex');
  await db
    .update(settings)
    .set({ aisensyWebhookSecret: secret, updatedAt: new Date() })
    .where(eq(settings.id, currentSettings.id));

  return secret;
}

export async function rotateAiSensyWebhookSecret(
  actor: string
): Promise<string> {
  const currentSettings = await getOrInitSettings();
  const secret = crypto.randomBytes(24).toString('hex');
  await db
    .update(settings)
    .set({
      aisensyWebhookSecret: secret,
      updatedBy: actor,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, currentSettings.id));
  return secret;
}

function pickFirstString(
  source: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const val = source[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return String(val);
    }
  }
  return '';
}

export async function ingestAiSensyWebhookLead(
  rawBody: unknown
): Promise<{ action: 'created' | 'updated'; lead: LeadItem }> {
  await ensureLeadsSchemaMigrated();

  const root =
    rawBody && typeof rawBody === 'object'
      ? (rawBody as Record<string, unknown>)
      : {};
  const nested =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.lead && typeof root.lead === 'object'
        ? (root.lead as Record<string, unknown>)
        : root;

  const merged: Record<string, unknown> = { ...root, ...nested };

  const rawPhone = pickFirstString(merged, [
    'phoneNumber',
    'mobileNumber',
    'whatsappNumber',
    'whatsapp_number',
    'mobile',
    'phone',
    'destination',
    'from',
    'userPhone',
  ]);
  const phoneInfo = normalizeLeadPhone(rawPhone);
  if (
    phoneInfo.normalizedPhone.length < 7 ||
    phoneInfo.normalizedPhone.length > 15
  ) {
    throw new Error('Webhook payload missing a valid contact phone number.');
  }

  const rawName =
    pickFirstString(merged, [
      'customerName',
      'userName',
      'fullName',
      'name',
      'contactName',
      'firstName',
    ]) || `Lead (${phoneInfo.displayPhone})`;

  const rawEmail = pickFirstString(merged, ['email', 'emailAddress']);
  const rawLeadType = pickFirstString(merged, ['leadType', 'type', 'segment']);
  const campaignName =
    pickFirstString(merged, ['campaignName', 'campaign', 'topic']) || null;

  const rawSource = pickFirstString(merged, ['source', 'channel']);
  const source = rawSource ? normalizeLeadSource(rawSource) : 'aisensy_organic';

  const ownerHint = pickFirstString(merged, [
    'ownerUsername',
    'assignedTo',
    'owner',
    'agent',
  ]).toLowerCase();

  const allActiveUsers = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true));
  const matchedOwner =
    (ownerHint
      ? allActiveUsers.find(
          (u) =>
            u.username.toLowerCase() === ownerHint ||
            (u.displayName || '').toLowerCase() === ownerHint
        )
      : undefined) ??
    allActiveUsers.find((u) => u.role === 'super_admin') ??
    allActiveUsers[0];

  const incomingMessage = pickFirstString(merged, [
    'remark',
    'message',
    'lastMessage',
    'incomingMessage',
    'text',
    'note',
  ]);

  const tagSummary = Array.isArray(merged.tags)
    ? merged.tags
        .map((t) =>
          typeof t === 'string'
            ? t
            : t && typeof t === 'object' && 'name' in t
              ? String((t as { name?: unknown }).name || '')
              : ''
        )
        .filter(Boolean)
        .join(', ')
    : '';

  const initialRemark =
    incomingMessage ||
    (tagSummary
      ? `Tags: ${tagSummary}`
      : campaignName
        ? `Inbound webhook lead (${campaignName})`
        : 'Inbound webhook lead');

  const today = getTodayIsoDate();
  const [existing] = await db
    .select()
    .from(leads)
    .where(eq(leads.normalizedPhone, phoneInfo.normalizedPhone))
    .limit(1);

  if (existing) {
    const updated = await addLeadRemarkRecord(existing.id, {
      remark: initialRemark,
      statusAtCall: existing.status,
      callDate: today,
      followUpDate: existing.followUpDate,
      actor: 'Lead Webhook',
    });
    return { action: 'updated', lead: updated! };
  }

  let safeEmail: string | null = null;
  try {
    safeEmail = normalizeEmailInput(rawEmail);
  } catch {
    safeEmail = null;
  }

  const created = await createLeadRecord({
    ownerUserId: matchedOwner?.id ?? null,
    name: rawName,
    phone: phoneInfo.displayPhone,
    email: safeEmail,
    leadType: rawLeadType ? normalizeLeadType(rawLeadType) : 'retail',
    source,
    campaignName,
    status: 'new_lead',
    latestRemark: initialRemark,
    leadDate: today,
    followUpDate: today,
    actor: matchedOwner?.displayName || matchedOwner?.username || 'Lead Webhook',
  });

  return { action: 'created', lead: created };
}
