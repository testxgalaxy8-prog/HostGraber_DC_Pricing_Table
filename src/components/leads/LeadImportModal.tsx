import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { getSessionToken } from '../../lib/api.ts';
import { LEAD_STATUS_META, normalizeLeadStatus } from '../../shared/leads.ts';

interface ParsedImportResponse {
  headers: string[];
  rows: Array<Record<string, string>>;
}

type ColumnTarget =
  | 'leadCode'
  | 'name'
  | 'phone'
  | 'email'
  | 'leadType'
  | 'remark'
  | 'status'
  | 'source'
  | 'leadDate'
  | 'followUpDate'
  | 'campaignName';

function autoMapHeaders(headers: string[]): Record<ColumnTarget, string> {
  const findMatch = (patterns: RegExp[]): string => {
    for (const h of headers) {
      const lower = h.trim().toLowerCase();
      if (patterns.some((p) => p.test(lower))) {
        return h;
      }
    }
    return '';
  };

  return {
    leadCode: findMatch([/lead.*id/, /lead.*code/, /^id$/, /ref/]),
    name: findMatch([/name/, /client/, /customer/, /contact/]),
    phone: findMatch([/phone/, /mobile/, /whatsapp/, /number/, /contact.*no/]),
    email: findMatch([/email/, /e-mail/, /mail/]),
    leadType: findMatch([/lead.*type/, /^type$/, /b2b/, /retail/]),
    remark: findMatch([/remark/, /note/, /update/, /comment/, /message/, /query/]),
    status: findMatch([/status/, /stage/, /outcome/, /state/]),
    source: findMatch([/source/, /channel/, /origin/]),
    leadDate: findMatch([/lead.*date/, /call.*date/, /created/, /^date$/]),
    followUpDate: findMatch([/follow.*up/, /followup/, /next.*call/, /reminder/]),
    campaignName: findMatch([/campaign/, /tag/, /ad/]),
  };
}

function parsePastedLines(raw: string): ParsedImportResponse {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const splitLine = (line: string) => {
    if (delimiter === '\t') {
      return line.split('\t').map((c) => c.trim());
    }
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const firstCells = splitLine(lines[0]);
  const looksLikeHeader = firstCells.some((c) =>
    /(name|phone|mobile|whatsapp|remark|status|date)/i.test(c)
  );

  const headers = looksLikeHeader
    ? firstCells.map((h, i) => h || `Column ${i + 1}`)
    : ['Name', 'Phone', 'Remark', 'Status', 'Follow-up Date'];

  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const rows = dataLines.map((line) => {
    const cells = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

export function LeadImportModal({
  isOpen,
  ownerUserId,
  ownerName,
  onClose,
  onImported,
  onToast,
}: {
  isOpen: boolean;
  ownerUserId: number;
  ownerName: string;
  onClose: () => void;
  onImported: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [tab, setTab] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<ColumnTarget, string>>({
    leadCode: '',
    name: '',
    phone: '',
    email: '',
    leadType: '',
    remark: '',
    status: '',
    source: '',
    leadDate: '',
    followUpDate: '',
    campaignName: '',
  });
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab('file');
    setPasteText('');
    setHeaders([]);
    setRawRows([]);
    setMapping({
      leadCode: '',
      name: '',
      phone: '',
      email: '',
      leadType: '',
      remark: '',
      status: '',
      source: '',
      leadDate: '',
      followUpDate: '',
      campaignName: '',
    });
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, importing, onClose]);

  const mappedRows = useMemo(() => {
    if (!mapping.name || !mapping.phone) return [];
    return rawRows
      .map((row) => ({
        leadCode: mapping.leadCode ? (row[mapping.leadCode] || '').trim() : '',
        name: (row[mapping.name] || '').trim(),
        phone: (row[mapping.phone] || '').trim(),
        email: mapping.email ? (row[mapping.email] || '').trim() : '',
        leadType: mapping.leadType ? (row[mapping.leadType] || '').trim() : 'retail',
        remark: mapping.remark ? (row[mapping.remark] || '').trim() : '',
        status: mapping.status ? (row[mapping.status] || '').trim() : 'new_lead',
        source: mapping.source ? (row[mapping.source] || '').trim() : 'import',
        leadDate: mapping.leadDate ? (row[mapping.leadDate] || '').trim() : '',
        followUpDate: mapping.followUpDate
          ? (row[mapping.followUpDate] || '').trim()
          : '',
        campaignName: mapping.campaignName
          ? (row[mapping.campaignName] || '').trim()
          : '',
      }))
      .filter((r) => r.name && r.phone.replace(/\D/g, '').length >= 7);
  }, [rawRows, mapping]);

  if (!isOpen) return null;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = getSessionToken();
      const res = await fetch('/api/leads/parse-import', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse file.');
      }
      const parsed = data as ParsedImportResponse;
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(autoMapHeaders(parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read CSV/Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleParsePaste = () => {
    setError(null);
    const parsed = parsePastedLines(pasteText);
    if (parsed.rows.length === 0) {
      setError('Paste at least one row with client name and mobile number.');
      return;
    }
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);
    setMapping(autoMapHeaders(parsed.headers));
  };

  const handleImport = async () => {
    if (mappedRows.length === 0) {
      setError('Map Name and Phone columns so at least one valid lead is ready.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
      }>('/api/leads/import', {
        method: 'POST',
        body: JSON.stringify({ ownerUserId, rows: mappedRows }),
      });
      onToast(
        'success',
        `Imported ${res.createdCount} new, updated ${res.updatedCount}${
          res.skippedCount > 0 ? `, skipped ${res.skippedCount}` : ''
        }.`
      );
      await onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import leads.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-import-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3
                id="lead-import-modal-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                Bulk Import Leads
              </h3>
              <p className="text-xs text-[#64748B]">
                Upload a CSV/Excel leads sheet or paste rows · Saving under {ownerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            aria-label="Close import modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F1F5F9] rounded-lg">
            <button
              type="button"
              onClick={() => setTab('file')}
              className={`py-2 font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'file'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Upload CSV / Excel
            </button>
            <button
              type="button"
              onClick={() => setTab('paste')}
              className={`py-2 font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'paste'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Paste Rows
            </button>
          </div>

          {tab === 'file' ? (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#CBD5E1] hover:border-[#17C964] rounded-xl bg-[#F8FAFC] cursor-pointer transition-colors">
              <UploadCloud className="w-7 h-7 text-[#059669] mb-2" />
              <span className="font-semibold text-[#0F172A]">
                {parsing
                  ? 'Reading spreadsheet...'
                  : 'Choose CSV or Excel leads file (.csv, .xlsx, .xls)'}
              </span>
              <span className="text-[#64748B] mt-1">
                Matching mobile numbers update and append call notes automatically
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-2">
              <textarea
                rows={5}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Name, Phone, Remark, Status, Follow-up Date\nRahul Sharma, 9876543210, Interested in Cloud VPS, Positive, 2026-11-25'}
                className="w-full p-3 font-mono text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
              <button
                type="button"
                onClick={handleParsePaste}
                className="px-3.5 py-2 font-semibold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] rounded-lg cursor-pointer"
              >
                Parse Pasted Rows
              </button>
            </div>
          )}

          {headers.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[#E2E8F0]">
              <div className="font-semibold text-[#0F172A]">
                Column Mapping ({rawRows.length} rows detected · {mappedRows.length} valid)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    ['leadCode', 'Lead ID'],
                    ['name', 'Contact Name *'],
                    ['phone', 'Contact Number *'],
                    ['email', 'Email'],
                    ['leadType', 'Lead Type (Retail/B2B)'],
                    ['remark', 'Call Remark'],
                    ['status', 'Lead Status'],
                    ['source', 'Lead Source'],
                    ['leadDate', 'Call / Entry Date'],
                    ['followUpDate', 'Follow-up Date'],
                    ['campaignName', 'Campaign / Tag'],
                  ] as Array<[ColumnTarget, string]>
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      {label}
                    </label>
                    <select
                      value={mapping[field]}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    >
                      <option value="">— Ignore —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {mappedRows.length > 0 && (
                <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-44">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B]">
                        <tr>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">Phone</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {mappedRows.slice(0, 6).map((row, idx) => {
                          const st = normalizeLeadStatus(row.status);
                          return (
                            <tr key={`${row.phone}-${idx}`}>
                              <td className="py-1.5 px-3 font-medium text-[#0F172A]">
                                {row.name}
                              </td>
                              <td className="py-1.5 px-3 font-mono-tabular text-[#334155]">
                                {row.phone}
                              </td>
                              <td className={`py-1.5 px-3 font-semibold ${LEAD_STATUS_META[st].textClass}`}>
                                {LEAD_STATUS_META[st].label}
                              </td>
                              <td className="py-1.5 px-3 text-[#475569] truncate max-w-[180px]">
                                {row.remark || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={importing || mappedRows.length === 0}
            onClick={handleImport}
            className="px-5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {importing ? 'Importing...' : `Import ${mappedRows.length} Leads`}
          </button>
        </div>
      </div>
    </div>
  );
}
