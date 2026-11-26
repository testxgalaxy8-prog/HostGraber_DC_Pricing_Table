import * as XLSX from 'xlsx';
import {
  ALL_LEAD_STATUSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  formatLeadDisplayDate,
  formatLeadDisplayTime,
  getFollowUpUrgency,
  getTodayIsoDate,
} from '../shared/leads.ts';
import type { LeadItem, LeadSource } from '../shared/types.ts';

export type LeadExportSelection = 'all' | 'filtered' | 'selected';
export type LeadExportFormat = 'xlsx' | 'csv';

function sanitizeSpreadsheetText(value: unknown, preserveLeadingPlus = false): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (!raw) return '';
  if (preserveLeadingPlus && /^\+\d/.test(raw)) {
    return raw;
  }
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

function sanitizeCsvCell(value: unknown): string {
  const safe = sanitizeSpreadsheetText(value, false);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function getPriorityLabel(lead: LeadItem, todayStr: string): string {
  if (lead.status === 'converted') return 'Converted';
  if (lead.status === 'deny') return 'Closed / Deny';
  if (lead.status === 'not_required') return 'Closed / Not Required';
  const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, todayStr);
  if (urgency === 'overdue') return 'Overdue Follow-up';
  if (urgency === 'today') return 'Due Today';
  if (urgency === 'upcoming') return 'Upcoming';
  return 'No Follow-up Set';
}

function formatUpdatedTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildExportFilename(
  companyName: string,
  selection: LeadExportSelection,
  todayStr: string,
  ext: LeadExportFormat
): string {
  const slug =
    companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'crm';
  return `${slug}-leads-${selection}-${todayStr}.${ext}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportLeadsFile({
  leads,
  selection,
  format,
  scopeLabel,
  exportedBy,
  companyName,
}: {
  leads: LeadItem[];
  selection: LeadExportSelection;
  format: LeadExportFormat;
  scopeLabel: string;
  exportedBy: string;
  companyName: string;
}): string {
  const todayStr = getTodayIsoDate();
  const filename = buildExportFilename(companyName, selection, todayStr, format);

  if (format === 'csv') {
    const header = [
      'Client Name',
      'Mobile Number',
      'Owner',
      'Lead Status',
      'Follow-up Priority',
      'Latest Call Remark',
      'Call Logs',
      'Call / Lead Date',
      'Follow-up Date',
      'Follow-up Time',
      'Source',
      'Campaign / Tag',
      'Updated By',
      'Last Updated',
    ];

    const csvLines = [
      header.map(sanitizeCsvCell).join(','),
      ...leads.map((lead) =>
        [
          lead.name,
          lead.phone,
          lead.ownerName,
          LEAD_STATUS_META[lead.status].label,
          getPriorityLabel(lead, todayStr),
          lead.latestRemark,
          lead.remarksCount,
          lead.leadDate,
          lead.followUpDate || '',
          lead.followUpTime ? formatLeadDisplayTime(lead.followUpTime) : '',
          LEAD_SOURCE_LABELS[lead.source],
          lead.campaignName || '',
          lead.updatedBy,
          formatUpdatedTimestamp(lead.updatedAt),
        ]
          .map(sanitizeCsvCell)
          .join(',')
      ),
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    triggerBlobDownload(blob, filename);
    return filename;
  }

  // Excel Workbook (.xlsx)
  const headers = [
    'Client Name',
    'Mobile Number',
    'Owner',
    'Lead Status',
    'Follow-up Priority',
    'Latest Call Remark',
    'Call Logs',
    'Call / Lead Date',
    'Follow-up Date',
    'Follow-up Time',
    'Source',
    'Campaign / Tag',
    'Updated By',
    'Last Updated',
  ];

  const rows: Array<Array<string | number>> = leads.map((lead) => [
    sanitizeSpreadsheetText(lead.name),
    sanitizeSpreadsheetText(lead.phone, true),
    sanitizeSpreadsheetText(lead.ownerName),
    LEAD_STATUS_META[lead.status].label,
    getPriorityLabel(lead, todayStr),
    sanitizeSpreadsheetText(lead.latestRemark || ''),
    lead.remarksCount,
    lead.leadDate ? formatLeadDisplayDate(lead.leadDate) : '',
    lead.followUpDate ? formatLeadDisplayDate(lead.followUpDate) : '',
    lead.followUpTime ? formatLeadDisplayTime(lead.followUpTime) : '',
    LEAD_SOURCE_LABELS[lead.source],
    sanitizeSpreadsheetText(lead.campaignName || ''),
    sanitizeSpreadsheetText(lead.updatedBy),
    formatUpdatedTimestamp(lead.updatedAt),
  ]);

  const leadsSheetData = [headers, ...rows];
  const leadsSheet = XLSX.utils.aoa_to_sheet(leadsSheetData);

  // Explicit column widths so Excel renders cleanly without ### truncation
  const maxLengths = headers.map((h) => h.length);
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const len = String(cell ?? '').length;
      if (len > maxLengths[idx]) maxLengths[idx] = len;
    });
  }
  leadsSheet['!cols'] = maxLengths.map((len, idx) => {
    const minWidth = idx === 5 ? 28 : 13;
    const maxWidth = idx === 5 ? 48 : 30;
    return { wch: Math.min(Math.max(len + 3, minWidth), maxWidth) };
  });

  if (rows.length > 0) {
    leadsSheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 },
      }),
    };
  }

  // Build Executive Summary sheet
  let todayDueCount = 0;
  let overdueCount = 0;
  const statusCounts = new Map<string, number>();
  const sourceCounts = new Map<LeadSource, number>();

  for (const lead of leads) {
    statusCounts.set(lead.status, (statusCounts.get(lead.status) || 0) + 1);
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) || 0) + 1);
    const urgency = getFollowUpUrgency(lead.followUpDate, lead.status, todayStr);
    if (urgency === 'today') todayDueCount += 1;
    if (urgency === 'overdue') overdueCount += 1;
  }

  const selectionLabel =
    selection === 'selected'
      ? 'Selected Leads Only'
      : selection === 'filtered'
        ? 'Filtered Leads View'
        : 'All Leads in Current View';

  const summaryRows: Array<Array<string | number>> = [
    [`${companyName || 'HostGraber'} — Lead Management Export`, '', ''],
    ['Generated At', formatUpdatedTimestamp(new Date().toISOString()), ''],
    ['Exported By', sanitizeSpreadsheetText(exportedBy), ''],
    ['Workspace View', sanitizeSpreadsheetText(scopeLabel), ''],
    ['Export Selection', selectionLabel, ''],
    ['Total Leads Exported', leads.length, ''],
    ['Follow-ups Due Today', todayDueCount, ''],
    ['Overdue Follow-ups', overdueCount, ''],
    ['', '', ''],
    ['Lead Status Breakdown', 'Count', 'Share (%)'],
    ...ALL_LEAD_STATUSES.map((st) => {
      const count = statusCounts.get(st) || 0;
      const pct = leads.length > 0 ? Number(((count / leads.length) * 100).toFixed(1)) : 0;
      return [LEAD_STATUS_META[st].label, count, `${pct}%`];
    }),
    ['', '', ''],
    ['Lead Source Breakdown', 'Count', 'Share (%)'],
    ...(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[])
      .filter((src) => (sourceCounts.get(src) || 0) > 0)
      .map((src) => {
        const count = sourceCounts.get(src) || 0;
        const pct = leads.length > 0 ? Number(((count / leads.length) * 100).toFixed(1)) : 0;
        return [LEAD_SOURCE_LABELS[src], count, `${pct}%`];
      }),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, leadsSheet, 'Leads');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const arrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;

  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);
  return filename;
}
