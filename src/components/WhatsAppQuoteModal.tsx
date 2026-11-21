import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  X,
} from 'lucide-react';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import {
  WHATSAPP_COUNTRY_CODES,
  buildWhatsAppSendUrl,
  normalizeWhatsAppNumber,
} from '../lib/whatsapp.ts';

export function WhatsAppQuoteModal({
  isOpen,
  title,
  scopeLabel,
  initialMessage,
  defaultCountryCode = '91',
  onClose,
  onToast,
}: {
  isOpen: boolean;
  title: string;
  scopeLabel: string;
  initialMessage: string;
  defaultCountryCode?: string;
  onClose: () => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [mobileInput, setMobileInput] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [submitted, setSubmitted] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const sendLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCountryCode(defaultCountryCode);
    setMobileInput('');
    setMessage(initialMessage);
    setSubmitted(false);
    const timer = setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
  }, [isOpen, initialMessage, defaultCountryCode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const normalized = useMemo(
    () => normalizeWhatsAppNumber(mobileInput, countryCode),
    [mobileInput, countryCode]
  );

  const encodedLength = useMemo(
    () => encodeURIComponent(message.trim()).length,
    [message]
  );
  const isLongUrl = encodedLength > 3800;

  const canSend = normalized.valid && message.trim().length > 0;
  const waUrl = useMemo(
    () => (canSend ? buildWhatsAppSendUrl(normalized.e164Digits, message) : '#'),
    [canSend, normalized.e164Digits, message]
  );

  if (!isOpen) return null;

  const completeSendFeedback = () => {
    onToast('success', `Opening WhatsApp for ${normalized.formattedDisplay}.`);
    setTimeout(() => {
      onClose();
    }, 120);
  };

  const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!canSend) {
      event.preventDefault();
      setSubmitted(true);
      phoneInputRef.current?.focus();
      return;
    }
    completeSendFeedback();
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
    if (ok) {
      onToast('success', 'Quotation message copied to clipboard.');
    } else {
      onToast('error', 'Failed to copy message.');
    }
  };

  const showPhoneError =
    (submitted && !normalized.valid) ||
    (mobileInput.trim().length > 0 && submitted && Boolean(normalized.error));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-quote-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4.5 h-4.5 text-[#059669]" />
            </div>
            <div className="min-w-0">
              <h3
                id="whatsapp-quote-modal-title"
                className="text-base font-semibold text-[#0F172A] leading-snug"
              >
                Send Quote on WhatsApp
              </h3>
              <p className="text-xs text-[#64748B] truncate mt-0.5">
                {title} · {scopeLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label
              htmlFor="whatsapp-client-mobile"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Client Mobile Number
            </label>
            <div className="flex items-stretch gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                className="px-2.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964] shrink-0"
              >
                {WHATSAPP_COUNTRY_CODES.map((opt) => (
                  <option key={opt.label} value={opt.code}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 min-w-0">
                <Phone className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={phoneInputRef}
                  id="whatsapp-client-mobile"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value)}
                  placeholder={
                    countryCode === '91'
                      ? 'e.g. 98765 43210'
                      : 'Enter client mobile number'
                  }
                  className={`w-full pl-9 pr-3 py-2.5 text-sm font-mono-tabular bg-[#F8FAFC] border rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white ${
                    showPhoneError
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-[#CBD5E1] focus:border-[#17C964]'
                  }`}
                />
              </div>
            </div>

            {showPhoneError && normalized.error ? (
              <p className="mt-1.5 text-xs text-red-600 font-medium">
                {normalized.error}
              </p>
            ) : normalized.valid ? (
              <p className="mt-1.5 text-xs text-[#059669] font-medium font-mono-tabular">
                Recipient: {normalized.formattedDisplay}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-[#64748B]">
                Enter the client mobile number (10-digit local or +country code).
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="whatsapp-quote-message"
                className="text-xs font-semibold text-[#334155]"
              >
                Quotation Message
              </label>
              <span className="text-[11px] font-mono-tabular text-[#64748B]">
                {message.trim().length} chars
              </span>
            </div>
            <textarea
              id="whatsapp-quote-message"
              rows={9}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 text-xs font-mono leading-relaxed bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964] resize-y"
            />
            {submitted && message.trim().length === 0 && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                Quotation message cannot be empty.
              </p>
            )}
          </div>

          {isLongUrl && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                This multi-plan quote is long and may be truncated by WhatsApp
                URL limits. You can trim it above or use Copy Message / Export PDF.
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Message</span>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
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
