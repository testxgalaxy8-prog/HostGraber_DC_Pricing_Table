import type { LeadItem, LeadSource, LeadStatus } from './types.ts';

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  'call_needed',
  'positive',
  'converted',
  'existing_client',
  'not_required',
  'deny',
];

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
  positive: {
    value: 'positive',
    label: 'Positive',
    shortLabel: 'Positive',
    rowBgClass: 'bg-[#F0FDF4]/60 hover:bg-[#DCFCE7]/50',
    cardBgClass: 'bg-[#F0FDF4]/60',
    cardBorderClass: 'border-[#BBF7D0]',
    textClass: 'text-[#15803D]',
    indicatorClass: 'bg-[#10B981]',
    selectClass: 'bg-[#ECFDF5] border-[#86EFAC] text-[#15803D]',
    filterActiveClass: 'bg-[#ECFDF5] border-[#10B981] text-[#15803D]',
  },
  call_needed: {
    value: 'call_needed',
    label: 'Call Needed',
    shortLabel: 'Call Needed',
    rowBgClass: 'bg-[#FFFDF2] hover:bg-[#FEF9C3]/45',
    cardBgClass: 'bg-[#FFFBEB]/55',
    cardBorderClass: 'border-[#FDE68A]',
    textClass: 'text-[#B45309]',
    indicatorClass: 'bg-[#F59E0B]',
    selectClass: 'bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]',
    filterActiveClass: 'bg-[#FFFBEB] border-[#F59E0B] text-[#B45309]',
  },
  deny: {
    value: 'deny',
    label: 'Deny',
    shortLabel: 'Deny',
    rowBgClass: 'bg-[#FEF2F2]/50 hover:bg-[#FEE2E2]/55',
    cardBgClass: 'bg-[#FEF2F2]/50',
    cardBorderClass: 'border-[#FECACA]',
    textClass: 'text-[#B91C1C]',
    indicatorClass: 'bg-[#EF4444]',
    selectClass: 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C]',
    filterActiveClass: 'bg-[#FEF2F2] border-[#EF4444] text-[#B91C1C]',
  },
  converted: {
    value: 'converted',
    label: 'Converted',
    shortLabel: 'Converted',
    rowBgClass: 'bg-[#ECFDF5]/75 hover:bg-[#D1FAE5]/60',
    cardBgClass: 'bg-[#ECFDF5]/65',
    cardBorderClass: 'border-[#6EE7B7]',
    textClass: 'text-[#047857]',
    indicatorClass: 'bg-[#059669]',
    selectClass: 'bg-[#D1FAE5] border-[#34D399] text-[#065F46]',
    filterActiveClass: 'bg-[#D1FAE5] border-[#059669] text-[#065F46]',
  },
  existing_client: {
    value: 'existing_client',
    label: 'Existing Client',
    shortLabel: 'Existing Client',
    rowBgClass: 'bg-[#EFF6FF]/65 hover:bg-[#DBEAFE]/55',
    cardBgClass: 'bg-[#EFF6FF]/60',
    cardBorderClass: 'border-[#BFDBFE]',
    textClass: 'text-[#1D4ED8]',
    indicatorClass: 'bg-[#2563EB]',
    selectClass: 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]',
    filterActiveClass: 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]',
  },
  not_required: {
    value: 'not_required',
    label: 'Not Required',
    shortLabel: 'Not Required',
    rowBgClass: 'bg-[#F8FAFC] hover:bg-[#F1F5F9]',
    cardBgClass: 'bg-[#F8FAFC]',
    cardBorderClass: 'border-[#CBD5E1]',
    textClass: 'text-[#475569]',
    indicatorClass: 'bg-[#64748B]',
    selectClass: 'bg-[#F1F5F9] border-[#CBD5E1] text-[#334155]',
    filterActiveClass: 'bg-[#F1F5F9] border-[#64748B] text-[#334155]',
  },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: 'Direct / Manual',
  whatsapp: 'WhatsApp',
  inbound_call: 'Inbound Call',
  website: 'Website',
  referral: 'Referral',
  aisensy: 'AiSensy',
  csv_import: 'CSV / Excel Import',
  other: 'Other',
};

export const LEAD_FORM_SOURCES: LeadSource[] = [
  'whatsapp',
  'inbound_call',
  'website',
  'referral',
  'manual',
  'aisensy',
  'other',
];

export function normalizeLeadStatus(raw: string | null | undefined): LeadStatus {
  const s = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'positive' || s === 'posative' || s === 'interested' || s === 'hot' || s === 'warm') {
    return 'positive';
  }
  if (s === 'deny' || s === 'denay' || s === 'denied' || s === 'rejected' || s === 'not_interested' || s === 'closed_lost') {
    return 'deny';
  }
  if (s === 'converted' || s === 'won' || s === 'closed_won' || s === 'paid') {
    return 'converted';
  }
  if (s === 'existing_client' || s === 'existing' || s === 'client' || s === 'customer') {
    return 'existing_client';
  }
  if (
    s === 'not_required' ||
    s === 'no_requirement' ||
    s === 'not_needed' ||
    s === 'no_need' ||
    s === 'unwanted' ||
    s === 'irrelevant'
  ) {
    return 'not_required';
  }
  if (s === 'call_needed' || s === 'call_neded' || s === 'callback' || s === 'follow_up' || s === 'followup' || s === 'new' || s === 'pending') {
    return 'call_needed';
  }
  return 'call_needed';
}

export function normalizeLeadSource(raw: string | null | undefined): LeadSource {
  const s = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'whatsapp' || s === 'wa') return 'whatsapp';
  if (s === 'inbound_call' || s === 'call' || s === 'phone_call' || s === 'phone') return 'inbound_call';
  if (s === 'website' || s === 'web' || s === 'form') return 'website';
  if (s === 'referral' || s === 'ref' || s === 'reference') return 'referral';
  if (s === 'aisensy') return 'aisensy';
  if (s === 'csv_import' || s === 'csv' || s === 'excel' || s === 'import') return 'csv_import';
  if (s === 'other') return 'other';
  return 'manual';
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  if (status === 'deny' || status === 'converted' || status === 'not_required') return 'none';
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

export function computeLeadMetrics(leads: LeadItem[], todayStr: string = getTodayIsoDate()) {
  let todayFollowUps = 0;
  let overdueFollowUps = 0;
  let positive = 0;
  let callNeeded = 0;
  let deny = 0;
  let converted = 0;
  let existingClient = 0;
  let notRequired = 0;

  for (const lead of leads) {
    if (lead.status === 'positive') positive += 1;
    else if (lead.status === 'call_needed') callNeeded += 1;
    else if (lead.status === 'deny') deny += 1;
    else if (lead.status === 'converted') converted += 1;
    else if (lead.status === 'existing_client') existingClient += 1;
    else if (lead.status === 'not_required') notRequired += 1;

    const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, todayStr);
    if (urgency === 'today') todayFollowUps += 1;
    if (urgency === 'overdue') overdueFollowUps += 1;
  }

  return {
    total: leads.length,
    todayFollowUps,
    overdueFollowUps,
    positive,
    callNeeded,
    deny,
    converted,
    existingClient,
    notRequired,
  };
}
