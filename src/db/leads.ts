import crypto from 'node:crypto';
import { and, count, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
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
  getTodayIsoDate,
  normalizeIsoDateInput,
  normalizeLeadPhone,
  normalizeLeadSource,
  normalizeLeadStatus,
} from '../shared/leads.ts';
import type {
  LeadAccessLogItem,
  LeadColleagueOption,
  LeadInterventionScope,
  LeadItem,
  LeadRemarkItem,
  LeadSource,
  LeadStatus,
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
  ownerUserId?: number | null;
  name: string;
  phone: string;
  source?: LeadSource | string;
  campaignName?: string | null;
  status?: LeadStatus | string;
  latestRemark?: string | null;
  leadDate?: string | null;
  followUpDate?: string | null;
  actor: string;
}

export interface AddLeadRemarkInput {
  remark: string;
  statusAtCall: LeadStatus | string;
  callDate?: string | null;
  followUpDate?: string | null;
  actor: string;
}

function mapLeadRow(
  row: typeof leads.$inferSelect,
  remarksCount: number,
  remarks?: LeadRemarkItem[]
): LeadItem {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId ?? null,
    ownerName: row.ownerName || row.createdBy || 'Team',
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalizedPhone,
    source: normalizeLeadSource(row.source),
    campaignName: row.campaignName ?? null,
    status: normalizeLeadStatus(row.status),
    latestRemark: row.latestRemark || '',
    leadDate: row.leadDate,
    followUpDate: row.followUpDate ?? null,
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
  colleagues: LeadColleagueOption[];
}> {
  await ensureLeadOwnersBackfilled();

  const [allUsers, countRows, unlockedSet] = await Promise.all([
    db.select().from(users).where(eq(users.isActive, true)),
    db
      .select({
        ownerUserId: leads.ownerUserId,
        total: count(),
      })
      .from(leads)
      .groupBy(leads.ownerUserId),
    getUnlockedTargetIds(sessionTokenHash, viewerUserId),
  ]);

  const countMap = new Map<number, number>();
  for (const row of countRows) {
    if (row.ownerUserId !== null) {
      countMap.set(row.ownerUserId, Number(row.total));
    }
  }

  const myLeadCount = countMap.get(viewerUserId) ?? 0;

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

  return { myLeadCount, colleagues };
}

export async function fetchScopedLeads(options: {
  scope: LeadInterventionScope;
  targetUserId?: number | null;
  viewerUserId: number;
  viewerName: string;
  sessionTokenHash: string;
  logSwitch?: boolean;
}): Promise<LeadItem[]> {
  await ensureLeadOwnersBackfilled();

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
    // 'any': own leads + unlocked colleagues' leads
    const allowedIds = Array.from(
      new Set([options.viewerUserId, ...Array.from(unlockedSet)])
    );
    leadRows = await db
      .select()
      .from(leads)
      .where(inArray(leads.ownerUserId, allowedIds))
      .orderBy(desc(leads.updatedAt), desc(leads.id));
  }

  if (leadRows.length === 0) return [];

  const leadIds = leadRows.map((l) => l.id);
  const countRows = await db
    .select({
      leadId: leadRemarks.leadId,
      total: count(),
    })
    .from(leadRemarks)
    .where(inArray(leadRemarks.leadId, leadIds))
    .groupBy(leadRemarks.leadId);

  const countMap = new Map<number, number>();
  for (const row of countRows) {
    countMap.set(row.leadId, Number(row.total));
  }

  return leadRows.map((row) => mapLeadRow(row, countMap.get(row.id) ?? 0));
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
      `${targetName} has not set a Lead Security Code yet. Ask them to set one under "My Security Code".`
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
  access?: { viewerUserId: number; sessionTokenHash: string }
): Promise<LeadItem | null> {
  const [leadRow] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!leadRow) return null;

  if (access) {
    const allowed = await hasLeadOwnerAccess(
      access.sessionTokenHash,
      access.viewerUserId,
      leadRow.ownerUserId
    );
    if (!allowed) {
      throw new LeadAccessDeniedError(
        'Security code required to access this lead.',
        leadRow.ownerUserId ?? undefined
      );
    }
  }

  const remarkRows = await db
    .select()
    .from(leadRemarks)
    .where(eq(leadRemarks.leadId, id))
    .orderBy(
      desc(leadRemarks.callDate),
      desc(leadRemarks.createdAt),
      desc(leadRemarks.id)
    );

  const mappedRemarks = remarkRows.map(mapRemarkRow);
  return mapLeadRow(leadRow, mappedRemarks.length, mappedRemarks);
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
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<LeadItem> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Client name is required.');
  }

  const { displayPhone, normalizedPhone } = normalizeLeadPhone(input.phone);
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
    throw new Error('Enter a valid client mobile number (7 to 15 digits).');
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

  const ownerInfo = await resolveOwnerInfo(targetOwnerId, input.actor);
  const status = normalizeLeadStatus(input.status);
  const source = normalizeLeadSource(input.source);
  const leadDate = normalizeIsoDateInput(input.leadDate) ?? getTodayIsoDate();
  const followUpDate = normalizeIsoDateInput(input.followUpDate);
  const latestRemark = (input.latestRemark || '').trim();
  const campaignName = input.campaignName?.trim() || null;

  const createdLeadId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(leads)
      .values({
        ownerUserId: ownerInfo.ownerUserId,
        ownerName: ownerInfo.ownerName,
        name: cleanName,
        phone: displayPhone,
        normalizedPhone,
        source,
        campaignName,
        status,
        latestRemark,
        leadDate,
        followUpDate,
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
      details: `Added lead "${cleanName}" under ${ownerInfo.ownerName}`,
    });
  }

  const full = await fetchLeadById(createdLeadId);
  if (!full) throw new Error('Failed to load newly created lead.');
  return full;
}

export async function updateLeadRecord(
  id: number,
  input: Partial<CreateOrUpdateLeadInput> & { actor: string },
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<LeadItem | null> {
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
    throw new Error('Client name is required.');
  }

  let nextPhone = existing.phone;
  let nextNormalized = existing.normalizedPhone;
  if (input.phone !== undefined) {
    const phoneInfo = normalizeLeadPhone(input.phone);
    if (
      phoneInfo.normalizedPhone.length < 7 ||
      phoneInfo.normalizedPhone.length > 15
    ) {
      throw new Error('Enter a valid client mobile number (7 to 15 digits).');
    }
    nextPhone = phoneInfo.displayPhone;
    nextNormalized = phoneInfo.normalizedPhone;
  }

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

  await db
    .update(leads)
    .set({
      name: nextName,
      phone: nextPhone,
      normalizedPhone: nextNormalized,
      source: nextSource,
      campaignName: nextCampaign,
      status: nextStatus,
      latestRemark: nextRemark,
      leadDate: nextLeadDate,
      followUpDate: nextFollowUpDate,
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
      details: `Updated lead "${nextName}" (Status: ${nextStatus})`,
    });
  }

  return fetchLeadById(id);
}

export async function addLeadRemarkRecord(
  leadId: number,
  input: AddLeadRemarkInput,
  access?: { viewerUserId: number; viewerName: string; sessionTokenHash: string }
): Promise<LeadItem | null> {
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

  await db.transaction(async (tx) => {
    await tx.insert(leadRemarks).values({
      leadId,
      remark: cleanRemark,
      statusAtCall: nextStatus,
      callDate,
      followUpDate: nextFollowUpDate,
      loggedBy: input.actor,
    });

    await tx
      .update(leads)
      .set({
        status: nextStatus,
        latestRemark: cleanRemark,
        leadDate: callDate,
        followUpDate: nextFollowUpDate,
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

  return fetchLeadById(leadId);
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
      if (row.ownerUserId && row.ownerUserId !== access.viewerUserId && !unlocked.has(row.ownerUserId)) {
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

export async function bulkImportLeadRecords(
  rows: Array<{
    name?: string;
    phone?: string;
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
    const source = row.source ? normalizeLeadSource(row.source) : 'csv_import';
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
      const [inserted] = await db
        .insert(leads)
        .values({
          ownerUserId: ownerInfo.ownerUserId,
          ownerName: ownerInfo.ownerName,
          name: cleanName,
          phone: phoneInfo.displayPhone,
          normalizedPhone: phoneInfo.normalizedPhone,
          source,
          campaignName,
          status,
          latestRemark: remark,
          leadDate,
          followUpDate,
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

  if (access && ownerUserId !== access.viewerUserId && (createdCount > 0 || updatedCount > 0)) {
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
    throw new Error('Webhook payload missing a valid client phone number.');
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

  const campaignName =
    pickFirstString(merged, ['campaignName', 'campaign', 'topic']) || null;

  const rawSource = pickFirstString(merged, ['source', 'channel']);
  const source = rawSource ? normalizeLeadSource(rawSource) : 'whatsapp';

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

  const created = await createLeadRecord({
    ownerUserId: matchedOwner?.id ?? null,
    name: rawName,
    phone: phoneInfo.displayPhone,
    source,
    campaignName,
    status: 'call_needed',
    latestRemark: initialRemark,
    leadDate: today,
    followUpDate: today,
    actor: matchedOwner?.displayName || matchedOwner?.username || 'Lead Webhook',
  });

  return { action: 'created', lead: created };
}
