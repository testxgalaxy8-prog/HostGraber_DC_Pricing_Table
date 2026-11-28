import type {
  CommunicationCategory,
  KnowledgebaseCategory,
  LeadItem,
  LeadSource,
  LeadStatus,
  LeadType,
} from './types.ts';

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  'new_lead',
  'positive_lead',
  'quotation_shared',
  'not_answering',
  'meeting_scheduled',
  'trial_given',
  'existing_client_lead',
  'future_prospect',
  'won',
  'lost',
  'cold_lead',
  'denied',
];

export const SUMMARY_STATUS_CARDS: LeadStatus[] = [
  'positive_lead',
  'quotation_shared',
  'not_answering',
  'future_prospect',
  'won',
  'lost',
  'cold_lead',
  'denied',
];

export const CLOSED_LEAD_STATUSES: LeadStatus[] = ['won', 'lost', 'cold_lead', 'denied'];

export function isClosedLeadStatus(status: LeadStatus): boolean {
  return CLOSED_LEAD_STATUSES.includes(status);
}

export interface LeadStatusStyleMeta {
  value: LeadStatus;
  label: string;
  shortLabel: string;
  rowBgClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  textClass: string;
  indicatorClass: string;
  selectClass: string;
  filterActiveClass: string;
}

export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusStyleMeta> = {
  new_lead: {
    value: 'new_lead',
    label: 'New Lead',
    shortLabel: 'New Lead',
    rowBgClass: 'bg-[#FFFDF2] hover:bg-[#FEF9C3]/45',
    cardBgClass: 'bg-[#FFFBEB]/55',
    cardBorderClass: 'border-[#FDE68A]',
    textClass: 'text-[#B45309]',
    indicatorClass: 'bg-[#F59E0B]',
    selectClass: 'bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]',
    filterActiveClass: 'bg-[#FFFBEB] border-[#F59E0B] text-[#B45309]',
  },
  positive_lead: {
    value: 'positive_lead',
    label: 'Positive Lead',
    shortLabel: 'Positive Lead',
    rowBgClass: 'bg-[#F0FDF4]/60 hover:bg-[#DCFCE7]/50',
    cardBgClass: 'bg-[#F0FDF4]/65',
    cardBorderClass: 'border-[#BBF7D0]',
    textClass: 'text-[#15803D]',
    indicatorClass: 'bg-[#10B981]',
    selectClass: 'bg-[#ECFDF5] border-[#86EFAC] text-[#15803D]',
    filterActiveClass: 'bg-[#ECFDF5] border-[#10B981] text-[#15803D]',
  },
  quotation_shared: {
    value: 'quotation_shared',
    label: 'Quotation Shared',
    shortLabel: 'Quotation Shared',
    rowBgClass: 'bg-[#EEF2FF]/60 hover:bg-[#E0E7FF]/55',
    cardBgClass: 'bg-[#EEF2FF]/65',
    cardBorderClass: 'border-[#C7D2FE]',
    textClass: 'text-[#4338CA]',
    indicatorClass: 'bg-[#6366F1]',
    selectClass: 'bg-[#EEF2FF] border-[#A5B4FC] text-[#4338CA]',
    filterActiveClass: 'bg-[#EEF2FF] border-[#6366F1] text-[#4338CA]',
  },
  not_answering: {
    value: 'not_answering',
    label: 'Not Answering',
    shortLabel: 'Not Answering',
    rowBgClass: 'bg-[#FFF7ED]/70 hover:bg-[#FFEDD5]/60',
    cardBgClass: 'bg-[#FFF7ED]/70',
    cardBorderClass: 'border-[#FED7AA]',
    textClass: 'text-[#C2410C]',
    indicatorClass: 'bg-[#F97316]',
    selectClass: 'bg-[#FFF7ED] border-[#FDBA74] text-[#C2410C]',
    filterActiveClass: 'bg-[#FFF7ED] border-[#F97316] text-[#C2410C]',
  },
  meeting_scheduled: {
    value: 'meeting_scheduled',
    label: 'Meeting Scheduled',
    shortLabel: 'Meeting',
    rowBgClass: 'bg-[#F0FDFA]/65 hover:bg-[#CCFBF1]/55',
    cardBgClass: 'bg-[#F0FDFA]/65',
    cardBorderClass: 'border-[#99F6E4]',
    textClass: 'text-[#0F766E]',
    indicatorClass: 'bg-[#14B8A6]',
    selectClass: 'bg-[#F0FDFA] border-[#5EEAD4] text-[#0F766E]',
    filterActiveClass: 'bg-[#F0FDFA] border-[#14B8A6] text-[#0F766E]',
  },
  trial_given: {
    value: 'trial_given',
    label: 'Trial Given',
    shortLabel: 'Trial Given',
    rowBgClass: 'bg-[#FAF5FF]/65 hover:bg-[#F3E8FF]/55',
    cardBgClass: 'bg-[#FAF5FF]/65',
    cardBorderClass: 'border-[#E9D5FF]',
    textClass: 'text-[#7E22CE]',
    indicatorClass: 'bg-[#A855F7]',
    selectClass: 'bg-[#FAF5FF] border-[#D8B4FE] text-[#7E22CE]',
    filterActiveClass: 'bg-[#FAF5FF] border-[#A855F7] text-[#7E22CE]',
  },
  existing_client_lead: {
    value: 'existing_client_lead',
    label: 'Existing Client/Lead',
    shortLabel: 'Existing Client',
    rowBgClass: 'bg-[#EFF6FF]/65 hover:bg-[#DBEAFE]/55',
    cardBgClass: 'bg-[#EFF6FF]/65',
    cardBorderClass: 'border-[#BFDBFE]',
    textClass: 'text-[#1D4ED8]',
    indicatorClass: 'bg-[#2563EB]',
    selectClass: 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]',
    filterActiveClass: 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]',
  },
  future_prospect: {
    value: 'future_prospect',
    label: 'Future Prospect',
    shortLabel: 'Future Prospect',
    rowBgClass: 'bg-[#ECFEFF]/65 hover:bg-[#CFFAFE]/55',
    cardBgClass: 'bg-[#ECFEFF]/65',
    cardBorderClass: 'border-[#A5F3FC]',
    textClass: 'text-[#0E7490]',
    indicatorClass: 'bg-[#06B6D4]',
    selectClass: 'bg-[#ECFEFF] border-[#67E8F9] text-[#0E7490]',
    filterActiveClass: 'bg-[#ECFEFF] border-[#06B6D4] text-[#0E7490]',
  },
  won: {
    value: 'won',
    label: 'Won',
    shortLabel: 'Won',
    rowBgClass: 'bg-[#ECFDF5]/80 hover:bg-[#D1FAE5]/65',
    cardBgClass: 'bg-[#ECFDF5]/75',
    cardBorderClass: 'border-[#6EE7B7]',
    textClass: 'text-[#047857]',
    indicatorClass: 'bg-[#059669]',
    selectClass: 'bg-[#D1FAE5] border-[#34D399] text-[#065F46]',
    filterActiveClass: 'bg-[#D1FAE5] border-[#059669] text-[#065F46]',
  },
  lost: {
    value: 'lost',
    label: 'Lost',
    shortLabel: 'Lost',
    rowBgClass: 'bg-[#FFF1F2]/60 hover:bg-[#FFE4E6]/60',
    cardBgClass: 'bg-[#FFF1F2]/60',
    cardBorderClass: 'border-[#FECDD3]',
    textClass: 'text-[#BE123C]',
    indicatorClass: 'bg-[#F43F5E]',
    selectClass: 'bg-[#FFF1F2] border-[#FDA4AF] text-[#BE123C]',
    filterActiveClass: 'bg-[#FFF1F2] border-[#F43F5E] text-[#BE123C]',
  },
  cold_lead: {
    value: 'cold_lead',
    label: 'Cold Lead',
    shortLabel: 'Cold Lead',
    rowBgClass: 'bg-[#F8FAFC] hover:bg-[#F1F5F9]',
    cardBgClass: 'bg-[#F8FAFC]',
    cardBorderClass: 'border-[#CBD5E1]',
    textClass: 'text-[#475569]',
    indicatorClass: 'bg-[#64748B]',
    selectClass: 'bg-[#F1F5F9] border-[#CBD5E1] text-[#334155]',
    filterActiveClass: 'bg-[#F1F5F9] border-[#64748B] text-[#334155]',
  },
  denied: {
    value: 'denied',
    label: 'Denied',
    shortLabel: 'Denied',
    rowBgClass: 'bg-[#FEF2F2]/55 hover:bg-[#FEE2E2]/55',
    cardBgClass: 'bg-[#FEF2F2]/55',
    cardBorderClass: 'border-[#FECACA]',
    textClass: 'text-[#B91C1C]',
    indicatorClass: 'bg-[#EF4444]',
    selectClass: 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C]',
    filterActiveClass: 'bg-[#FEF2F2] border-[#EF4444] text-[#B91C1C]',
  },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  aisensy_ad: 'Aisensy Ad',
  aisensy_organic: 'Aisensy Organic',
  partner_enquiry: 'Partner Enquiry (Website)',
  referral: 'Referral',
  website_whmcs: 'Website/WHMCS',
  import: 'Import',
  website_grabee_ai: 'Website Grabee AI',
  internal_team_reference: 'Internal Team Reference',
  other: 'Other',
};

export const LEAD_FORM_SOURCES: LeadSource[] = [
  'aisensy_ad',
  'aisensy_organic',
  'partner_enquiry',
  'referral',
  'website_whmcs',
  'import',
  'website_grabee_ai',
  'internal_team_reference',
  'other',
];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  retail: 'Retail',
  b2b: 'B2B',
};

export const KNOWLEDGEBASE_CATEGORIES: Array<{
  id: KnowledgebaseCategory;
  label: string;
  description: string;
}> = [
  {
    id: 'product_documentation',
    label: 'Product Documentation',
    description: 'Hosting plan tiers, Cloud VPS specs, add-ons, and billing guidelines.',
  },
  {
    id: 'technical_documentation',
    label: 'Technical Documentation',
    description: 'DNS, cPanel/Plesk, WHMCS provisioning, SSL, and server migration runbooks.',
  },
  {
    id: 'faqs',
    label: 'FAQs',
    description: 'Frequent customer questions on uptime SLAs, upgrades, backups, and billing.',
  },
  {
    id: 'objection_handling',
    label: 'Objection Handling',
    description: 'Talk tracks for price comparisons, migration fears, and competitor objections.',
  },
  {
    id: 'company_resources',
    label: 'Company Resources',
    description: 'Sales SOPs, escalation matrix, SLA sheets, and onboarding checklists.',
  },
];

export const COMMUNICATION_CATEGORIES: Array<{
  id: CommunicationCategory;
  label: string;
  description: string;
}> = [
  {
    id: 'email_templates',
    label: 'Email Templates',
    description: 'Formal quotations, trial activation mails, and proposal summaries.',
  },
  {
    id: 'whatsapp_templates',
    label: 'WhatsApp Templates',
    description: 'Quick outreach, plan quote cards, and welcome messages.',
  },
  {
    id: 'sales_responses',
    label: 'Sales Responses',
    description: 'Ready replies for pricing, custom specs, and bulk B2B enquiries.',
  },
  {
    id: 'support_responses',
    label: 'Support Responses',
    description: 'Escalation handoffs, ticket acknowledgements, and migration assurances.',
  },
  {
    id: 'follow_up_templates',
    label: 'Follow-up Templates',
    description: 'Gentle nudges for quotation shared, not answering, and trial expiry.',
  },
  {
    id: 'canned_responses',
    label: 'Canned Responses',
    description: 'Instant one-liners for GST invoices, payment links, and callbacks.',
  },
];

export function normalizeLeadStatus(raw: string | null | undefined): LeadStatus {
  const s = (raw || '').trim().toLowerCase().replace(/[\s/-]+/g, '_');
  if (s === 'new_lead' || s === 'new' || s === 'call_needed' || s === 'call_neded' || s === 'pending' || s === 'callback') {
    return 'new_lead';
  }
  if (s === 'positive_lead' || s === 'positive' || s === 'posative' || s === 'interested' || s === 'hot' || s === 'warm') {
    return 'positive_lead';
  }
  if (s === 'quotation_shared' || s === 'quote_shared' || s === 'quoted' || s === 'proposal_sent') {
    return 'quotation_shared';
  }
  if (s === 'not_answering' || s === 'no_answer' || s === 'unanswered' || s === 'did_not_pick') {
    return 'not_answering';
  }
  if (s === 'meeting_scheduled' || s === 'meeting' || s === 'demo_scheduled' || s === 'call_scheduled') {
    return 'meeting_scheduled';
  }
  if (s === 'trial_given' || s === 'trial' || s === 'demo_given' || s === 'poc') {
    return 'trial_given';
  }
  if (s === 'existing_client_lead' || s === 'existing_client' || s === 'existing' || s === 'client' || s === 'customer') {
    return 'existing_client_lead';
  }
  if (s === 'future_prospect' || s === 'future' || s === 'follow_up_later' || s === 'later') {
    return 'future_prospect';
  }
  if (s === 'won' || s === 'converted' || s === 'closed_won' || s === 'paid') {
    return 'won';
  }
  if (s === 'lost' || s === 'closed_lost') {
    return 'lost';
  }
  if (s === 'cold_lead' || s === 'cold' || s === 'not_required' || s === 'no_requirement' || s === 'not_needed' || s === 'no_need') {
    return 'cold_lead';
  }
  if (s === 'denied' || s === 'deny' || s === 'denay' || s === 'rejected' || s === 'not_interested' || s === 'unwanted' || s === 'irrelevant') {
    return 'denied';
  }
  return 'new_lead';
}

export function normalizeLeadSource(raw: string | null | undefined): LeadSource {
  const s = (raw || '').trim().toLowerCase().replace(/[\s/()-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (s === 'aisensy_ad' || s === 'aisensy_ads' || s === 'whatsapp_ad' || s === 'ad' || s === 'meta_ad') {
    return 'aisensy_ad';
  }
  if (s === 'aisensy_organic' || s === 'aisensy' || s === 'whatsapp' || s === 'wa' || s === 'organic') {
    return 'aisensy_organic';
  }
  if (s === 'partner_enquiry' || s === 'partner_enquiry_website' || s === 'partner' || s === 'partner_website') {
    return 'partner_enquiry';
  }
  if (s === 'referral' || s === 'ref' || s === 'reference') {
    return 'referral';
  }
  if (s === 'website_whmcs' || s === 'website' || s === 'whmcs' || s === 'web' || s === 'form') {
    return 'website_whmcs';
  }
  if (s === 'import' || s === 'csv_import' || s === 'csv' || s === 'excel' || s === 'bulk_import') {
    return 'import';
  }
  if (s === 'website_grabee_ai' || s === 'grabee' || s === 'grabee_ai' || s === 'website_grabee') {
    return 'website_grabee_ai';
  }
  if (s === 'internal_team_reference' || s === 'internal_team' || s === 'team_reference' || s === 'internal') {
    return 'internal_team_reference';
  }
  if (s === 'other' || s === 'manual' || s === 'inbound_call' || s === 'call' || s === 'phone') {
    return 'other';
  }
  return 'other';
}

export function normalizeLeadType(raw: string | null | undefined): LeadType {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'b2b' || s === 'business' || s === 'enterprise' || s === 'partner' || s === 'reseller') {
    return 'b2b';
  }
  return 'retail';
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMinutesToNow(minutes: number): { date: string; time: string } {
  const target = new Date(Date.now() + minutes * 60_000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  return {
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
  };
}

export function normalizeFollowUpTimeInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const h24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (h24) {
    const hours = Number(h24[1]);
    const minutes = Number(h24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return null;
  }

  const h12 = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(trimmed);
  if (h12) {
    let hours = Number(h12[1]);
    const minutes = Number(h12[2]);
    const period = h12[3].toLowerCase();
    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
}

export function formatLeadDisplayTime(timeStr: string | null | undefined): string {
  const normalized = normalizeFollowUpTimeInput(timeStr);
  if (!normalized) return '';
  const [hhRaw, mmRaw] = normalized.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const period = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(hour12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
}

export function parseFollowUpDateTime(
  followUpDate: string | null | undefined,
  followUpTime: string | null | undefined
): Date | null {
  if (!followUpDate || !followUpTime) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(followUpDate.trim());
  const normalizedTime = normalizeFollowUpTimeInput(followUpTime);
  if (!dateMatch || !normalizedTime) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const [hh, mm] = normalizedTime.split(':').map(Number);

  const parsed = new Date(year, month, day, hh, mm, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export type ReminderTimingState =
  | 'due'
  | 'imminent'
  | 'scheduled'
  | 'acknowledged'
  | 'none';

export interface ReminderTimingInfo {
  state: ReminderTimingState;
  targetMs: number | null;
  diffMs: number | null;
  label: string;
}

export function getReminderTimingStatus(
  lead: {
    followUpDate: string | null | undefined;
    followUpTime?: string | null | undefined;
    status: LeadStatus;
    reminderNotifiedAt?: string | null | undefined;
  },
  nowMs: number = Date.now()
): ReminderTimingInfo {
  if (isClosedLeadStatus(lead.status)) {
    return { state: 'none', targetMs: null, diffMs: null, label: '' };
  }

  const targetDate = parseFollowUpDateTime(lead.followUpDate, lead.followUpTime);
  if (!targetDate) {
    return { state: 'none', targetMs: null, diffMs: null, label: '' };
  }

  const targetMs = targetDate.getTime();
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    const absSec = Math.floor(Math.abs(diffMs) / 1000);
    let overdueLabel = 'Due now';
    if (absSec >= 86400) {
      const days = Math.floor(absSec / 86400);
      overdueLabel = `${days}d overdue`;
    } else if (absSec >= 3600) {
      const hrs = Math.floor(absSec / 3600);
      const mins = Math.floor((absSec % 3600) / 60);
      overdueLabel = mins > 0 ? `${hrs}h ${mins}m overdue` : `${hrs}h overdue`;
    } else if (absSec >= 60) {
      const mins = Math.floor(absSec / 60);
      overdueLabel = `${mins}m overdue`;
    }

    return {
      state: lead.reminderNotifiedAt ? 'acknowledged' : 'due',
      targetMs,
      diffMs,
      label: overdueLabel,
    };
  }

  const totalSec = Math.ceil(diffMs / 1000);
  let label = '';
  if (totalSec < 60) {
    label = `in ${totalSec}s`;
  } else if (totalSec < 3600) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    label = `in ${mins}m ${String(secs).padStart(2, '0')}s`;
  } else if (totalSec < 86400) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    label = mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`;
  } else {
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    label = hrs > 0 ? `in ${days}d ${hrs}h` : `in ${days}d`;
  }

  return {
    state: diffMs <= 15 * 60_000 ? 'imminent' : 'scheduled',
    targetMs,
    diffMs,
    label,
  };
}

export function normalizeIsoDateInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export type FollowUpUrgency = 'overdue' | 'today' | 'upcoming' | 'none';

export function getFollowUpUrgency(
  followUpDate: string | null | undefined,
  status: LeadStatus,
  todayStr: string = getTodayIsoDate()
): FollowUpUrgency {
  if (!followUpDate) return 'none';
  if (isClosedLeadStatus(status)) return 'none';
  if (followUpDate < todayStr) return 'overdue';
  if (followUpDate === todayStr) return 'today';
  return 'upcoming';
}

export function formatLeadDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const [, y, m, d] = match;
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dateObj.getTime())) return isoDate;
  return dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function normalizeLeadPhone(rawPhone: string): {
  displayPhone: string;
  normalizedPhone: string;
} {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return { displayPhone: trimmed, normalizedPhone: '' };
  }

  let e164Digits = digits;
  if (digits.startsWith('00') && digits.length > 9) {
    e164Digits = digits.replace(/^00+/, '');
  } else if (digits.length === 11 && digits.startsWith('0')) {
    e164Digits = `91${digits.slice(1)}`;
  } else if (digits.length === 10) {
    e164Digits = `91${digits}`;
  }

  const displayPhone =
    e164Digits.startsWith('91') && e164Digits.length === 12
      ? `+91 ${e164Digits.slice(2, 7)} ${e164Digits.slice(7)}`
      : `+${e164Digits}`;

  return {
    displayPhone,
    normalizedPhone: e164Digits,
  };
}

export function computeLeadMetrics(
  leads: LeadItem[],
  todayStr: string = getTodayIsoDate(),
  newLeadDate: string = todayStr
) {
  let todayFollowUps = 0;
  let overdueFollowUps = 0;
  let newLeadsOnDate = 0;

  const statusCounts: Record<LeadStatus, number> = {
    new_lead: 0,
    positive_lead: 0,
    quotation_shared: 0,
    not_answering: 0,
    meeting_scheduled: 0,
    trial_given: 0,
    existing_client_lead: 0,
    future_prospect: 0,
    won: 0,
    lost: 0,
    cold_lead: 0,
    denied: 0,
  };

  for (const lead of leads) {
    statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;

    if (lead.leadDate === newLeadDate) {
      newLeadsOnDate += 1;
    }

    const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, todayStr);
    if (urgency === 'today') todayFollowUps += 1;
    if (urgency === 'overdue') overdueFollowUps += 1;
  }

  return {
    total: leads.length,
    newLeadsOnDate,
    todayFollowUps,
    overdueFollowUps,
    statusCounts,
  };
}

export function formatLeadCodeFromNumber(num: number): string {
  return `HG-${String(Math.max(1, num)).padStart(4, '0')}`;
}

