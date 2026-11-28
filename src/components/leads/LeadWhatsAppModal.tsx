import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Server,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { copyTextToClipboard } from '../../lib/clipboard.ts';
import { getTodayIsoDate } from '../../shared/leads.ts';
import {
  WHATSAPP_COUNTRY_CODES,
  buildWhatsAppSendUrl,
  normalizeWhatsAppNumber,
} from '../../lib/whatsapp.ts';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  generateQuotationText,
} from '../../shared/quotation.ts';
import type {
  BillingCycle,
  CommunicationTemplate,
  HostingPlanFull,
  LeadItem,
  PortalSettings,
} from '../../shared/types.ts';

type ComposerMode = 'followup' | 'missed_call' | 'renewal' | 'quote';

export function LeadWhatsAppModal({
  lead,
  settings,
  onClose,
  onLeadUpdated,
  onToast,
}: {
  lead: LeadItem | null;
  settings: PortalSettings;
  onClose: () => void;
  onLeadUpdated?: (lead: LeadItem) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isOpen = lead !== null;
  const [countryCode, setCountryCode] = useState('91');
  const [mobileInput, setMobileInput] = useState('');
  const [mode, setMode] = useState<ComposerMode>('followup');
  const [plans, setPlans] = useState<HostingPlanFull[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<CommunicationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedTenure, setSelectedTenure] = useState<'all' | BillingCycle>('all');
  const [message, setMessage] = useState('');
  const [logToHistory, setLogToHistory] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const sendLinkRef = useRef<HTMLAnchorElement | null>(null);

  const buildTemplateMessage = (target: LeadItem, templateMode: Exclude<ComposerMode, 'quote'>) => {
    const company = settings.companyName || 'HostGraber';
    const planMention = target.campaignName ? ` for *${target.campaignName}*` : '';
    if (templateMode === 'missed_call') {
      return `Hello ${target.name},\n\nWe tried reaching you on a call regarding your hosting inquiry${planMention} at ${company}, but couldn't connect.\n\nPlease share a convenient time to call you back, or reply right here on WhatsApp.\n\nRegards,\n${company} Team`;
    }
    if (templateMode === 'renewal') {
      return `Hello ${target.name},\n\nFollowing up from ${company} regarding your${planMention || ' hosting'} plan activation/renewal. Let us know if you need the payment link or any technical help to get started today.\n\nRegards,\n${company} Team`;
    }
    return `Hello ${target.name},\n\nThank you for connecting with ${company}. Following up on your hosting inquiry${planMention}—please let us know your requirements or preferred time for a quick call so we can share the best plan for you.\n\nRegards,\n${company} Team`;
  };

  useEffect(() => {
    if (!lead) return;
    setMode('followup');
    setSubmitted(false);
    setSelectedTenure('all');
    setSelectedTemplateId('');
    setLogToHistory(true);

    // Pre-fill lead's phone cleanly
    if (lead.normalizedPhone.startsWith('91') && lead.normalizedPhone.length === 12) {
      setCountryCode('91');
      setMobileInput(lead.normalizedPhone.slice(2));
    } else if (lead.normalizedPhone) {
      setCountryCode('');
      setMobileInput(`+${lead.normalizedPhone}`);
    } else {
      setCountryCode('91');
      setMobileInput(lead.phone);
    }

    setMessage(buildTemplateMessage(lead, 'followup'));

    apiFetch<CommunicationTemplate[]>('/api/communication-templates')
      .then((list) => setSavedTemplates(list))
      .catch(() => {
        // Non-blocking fallback to built-in templates
      });

    if (plans.length === 0) {
      setLoadingPlans(true);
      apiFetch<HostingPlanFull[]>('/api/public/plans')
        .then((list) => {
          setPlans(list);
          if (list.length > 0) {
            const matched = lead.campaignName
              ? list.find((p) =>
                  p.name.toLowerCase().includes(lead.campaignName!.toLowerCase())
                )
              : undefined;
            setSelectedPlanId(String(matched?.id ?? list[0].id));
          }
        })
        .catch(() => {
          // Follow-up text still works even if plan catalog fails
        })
        .finally(() => setLoadingPlans(false));
    } else if (lead.campaignName) {
      const matched = plans.find((p) =>
        p.name.toLowerCase().includes(lead.campaignName!.toLowerCase())
      );
      if (matched) {
        setSelectedPlanId(String(matched.id));
      }
    }
  }, [lead]);

  useEffect(() => {
    if (!lead || mode !== 'quote') return;
    const chosenPlan = plans.find((p) => String(p.id) === selectedPlanId);
    if (!chosenPlan) return;
    const tenureArg = selectedTenure === 'all' ? 'all' : [selectedTenure];
    const quoteText = generateQuotationText(
      chosenPlan,
      settings,
      'complete',
      tenureArg
    );
    setMessage(`Hi ${lead.name},\n\nHere is your ${settings.companyName} quotation:\n\n${quoteText}`);
  }, [lead, mode, selectedPlanId, selectedTenure, plans, settings]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const normalized = useMemo(
    () => normalizeWhatsAppNumber(mobileInput, countryCode),
    [mobileInput, countryCode]
  );
  const canSend = normalized.valid && message.trim().length > 0;
  const waUrl = useMemo(
    () => (canSend ? buildWhatsAppSendUrl(normalized.e164Digits, message) : '#'),
    [canSend, normalized.e164Digits, message]
  );

  if (!lead) return null;

  const handleModeChange = (nextMode: ComposerMode) => {
    setMode(nextMode);
    setSelectedTemplateId('');
    if (nextMode !== 'quote') {
      setMessage(buildTemplateMessage(lead, nextMode));
    } else if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(String(plans[0].id));
    }
  };

  const handleSavedTemplatePick = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const found = savedTemplates.find((t) => String(t.id) === templateId);
    if (!found) return;
    const company = settings.companyName || 'HostGraber';
    const populated = found.content
      .replace(/\{contact_name\}/gi, lead.name)
      .replace(/\{lead_id\}/gi, lead.leadCode)
      .replace(/\{company_name\}/gi, company);
    setMessage(populated);
  };

  const logWhatsAppOutreach = () => {
    if (!logToHistory || !lead) return;
    const chosenPlan = plans.find((p) => String(p.id) === selectedPlanId);
    const summaryNote =
      mode === 'quote' && chosenPlan
        ? `Sent WhatsApp quotation for ${chosenPlan.name} (${
            selectedTenure === 'all' ? 'All tenures' : CYCLE_META[selectedTenure].title
          }).`
        : mode === 'missed_call'
          ? 'Call not connected — sent missed-call follow-up on WhatsApp.'
          : mode === 'renewal'
            ? 'Sent activation / renewal follow-up on WhatsApp.'
            : 'Sent WhatsApp follow-up message.';

    apiFetch<LeadItem>(`/api/leads/${lead.id}/remarks`, {
      method: 'POST',
      body: JSON.stringify({
        remark: summaryNote,
        statusAtCall: lead.status,
        callDate: getTodayIsoDate(),
        followUpDate: lead.followUpDate,
      }),
    })
      .then((updated) => {
        onLeadUpdated?.(updated);
      })
      .catch(() => {
        // Non-blocking outreach log
      });
  };

  const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!canSend) {
      event.preventDefault();
      setSubmitted(true);
      phoneInputRef.current?.focus();
      return;
    }
    logWhatsAppOutreach();
    onToast('success', `Opening WhatsApp for ${normalized.formattedDisplay}.`);
    setTimeout(() => onClose(), 120);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!canSend) {
      phoneInputRef.current?.focus();
      return;
    }
    sendLinkRef.current?.click();
  };

  const handleCopyMessage = async () => {
    const ok = await copyTextToClipboard(message);
    onToast(
      ok ? 'success' : 'error',
      ok ? 'WhatsApp message copied to clipboard.' : 'Failed to copy message.'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-wa-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4.5 h-4.5 text-[#059669]" />
            </div>
            <div className="min-w-0">
              <h3
                id="lead-wa-modal-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                WhatsApp Lead · {lead.name}
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5 font-mono-tabular">
                {lead.leadCode} · {lead.phone}
                {lead.campaignName ? ` · ${lead.campaignName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WhatsApp modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Segmented Template & Quote Mode Selector */}
          <div
            role="group"
            aria-label="Message template"
            className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#F1F5F9] rounded-lg"
          >
            <button
              type="button"
              onClick={() => handleModeChange('followup')}
              className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'followup'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Follow-up
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('missed_call')}
              className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'missed_call'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Missed Call
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('renewal')}
              className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'renewal'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Activation
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('quote')}
              className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'quote'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Server className="w-3 h-3 text-[#059669]" />
              <span>Plan Quote</span>
            </button>
          </div>

          {savedTemplates.length > 0 && mode !== 'quote' && (
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                Communication Center Template (Optional)
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSavedTemplatePick(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
              >
                <option value="">— Use quick template above or pick saved template —</option>
                {savedTemplates.map((tmpl) => (
                  <option key={tmpl.id} value={String(tmpl.id)}>
                    {tmpl.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'quote' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Hosting Plan
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  disabled={loadingPlans || plans.length === 0}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                >
                  {loadingPlans ? (
                    <option value="">Loading plans...</option>
                  ) : plans.length === 0 ? (
                    <option value="">No active plans</option>
                  ) : (
                    plans.map((plan) => (
                      <option key={plan.id} value={String(plan.id)}>
                        {plan.name} ({plan.categoryName})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Billing Tenure
                </label>
                <select
                  value={selectedTenure}
                  onChange={(e) =>
                    setSelectedTenure(e.target.value as 'all' | BillingCycle)
                  }
                  className="w-full px-2.5 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964]"
                >
                  <option value="all">All Tenures</option>
                  {ALL_BILLING_CYCLES.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {CYCLE_META[cycle].title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Client Phone */}
          <div>
            <label
              htmlFor="lead-wa-mobile"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Client Mobile Number
            </label>
            <div className="flex items-stretch gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                className="px-2.5 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#17C964] shrink-0"
              >
                {WHATSAPP_COUNTRY_CODES.map((opt) => (
                  <option key={opt.label} value={opt.code}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
              <div className="relative flex-1 min-w-0">
                <Phone className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={phoneInputRef}
                  id="lead-wa-mobile"
                  type="tel"
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
            </div>
            {submitted && !normalized.valid && normalized.error ? (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {normalized.error}
              </p>
            ) : normalized.valid ? (
              <p className="mt-1 text-xs text-[#059669] font-mono-tabular font-medium">
                Recipient: {normalized.formattedDisplay}
              </p>
            ) : null}
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="lead-wa-message"
                className="text-xs font-semibold text-[#334155]"
              >
                WhatsApp Message
              </label>
              <span className="text-[11px] font-mono-tabular text-[#64748B]">
                {message.trim().length} chars
              </span>
            </div>
            <textarea
              id="lead-wa-message"
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 text-xs font-mono leading-relaxed bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964] resize-y"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-[#334155] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={logToHistory}
              onChange={(e) => setLogToHistory(e.target.checked)}
              className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer"
            />
            <span>Automatically log this WhatsApp message to client Call History</span>
          </label>

          <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <a
                ref={sendLinkRef}
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleAnchorClick}
                aria-disabled={!canSend}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  canSend
                    ? 'bg-[#17C964] hover:bg-[#10B981] text-[#04120A] cursor-pointer'
                    : 'bg-[#E2E8F0] text-[#64748B] cursor-not-allowed'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send on WhatsApp</span>
                <ExternalLink className="w-3 h-3 opacity-75" />
              </a>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
