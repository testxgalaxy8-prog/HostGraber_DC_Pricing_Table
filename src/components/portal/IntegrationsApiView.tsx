import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw, Webhook } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { copyTextToClipboard } from '../../lib/clipboard.ts';
import type { LeadWebhookConfig } from '../../shared/types.ts';

export function IntegrationsApiView({
  onToast,
}: {
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [config, setConfig] = useState<LeadWebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<LeadWebhookConfig>('/api/leads/webhook-config')
      .then(setConfig)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Unable to load webhook config.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const fullTokenUrl = config
    ? `${config.webhookUrl}?token=${encodeURIComponent(config.webhookSecret)}`
    : '';

  const handleCopy = async (value: string, label: string) => {
    const ok = await copyTextToClipboard(value);
    onToast(ok ? 'success' : 'error', ok ? `${label} copied.` : 'Copy failed.');
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const updated = await apiFetch<LeadWebhookConfig>(
        '/api/leads/webhook-config/rotate',
        { method: 'POST' }
      );
      setConfig(updated);
      setConfirmRotate(false);
      setShowSecret(true);
      onToast('success', 'Inbound lead webhook secret rotated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to rotate secret.'
      );
    } finally {
      setRotating(false);
    }
  };

  const samplePayload = JSON.stringify(
    {
      customerName: 'Rahul Sharma',
      phoneNumber: '9876543210',
      email: 'rahul@company.in',
      leadType: 'b2b',
      source: 'aisensy_organic',
      campaignName: 'Cloud VPS Offer',
      message: 'Interested in 4GB NVMe VPS monthly quote',
    },
    null,
    2
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          Integrations &amp; API
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Inbound webhook credentials for AiSensy, WHMCS &amp; forms
        </p>
      </div>

      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center shrink-0">
            <Webhook className="w-4 h-4 text-[#059669]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Inbound Lead Webhook
            </h2>
            <p className="text-xs text-[#64748B]">
              Creates or appends leads automatically
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {loading ? (
            <div className="py-8 text-center text-[#64748B]">
              Loading webhook credentials...
            </div>
          ) : error ? (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          ) : config ? (
            <>
              <div className="space-y-1.5">
                <label className="block font-semibold text-[#334155]">
                  Webhook Endpoint (POST)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={config.webhookUrl}
                    className="flex-1 min-w-0 px-3 py-2 font-mono text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(config.webhookUrl, 'Webhook URL')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-[#334155]">
                    Webhook Secret Token (<code className="font-mono">x-webhook-secret</code> header)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="inline-flex items-center gap-1 text-[#059669] hover:underline cursor-pointer"
                  >
                    {showSecret ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Reveal</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    value={config.webhookSecret}
                    className="flex-1 min-w-0 px-3 py-2 font-mono text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(config.webhookSecret, 'Webhook secret')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 p-3.5 rounded-xl bg-[#ECFDF5]/60 border border-[#A7F3D0]">
                <div className="font-semibold text-[#065F46]">
                  Quick One-Line Webhook URL (if custom headers are not supported)
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    value={fullTokenUrl}
                    className="flex-1 min-w-0 px-2.5 py-1.5 font-mono text-[11px] bg-white border border-[#A7F3D0] rounded-lg text-[#0F172A]"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(fullTokenUrl, 'Full tokenized URL')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy URL</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-[#334155]">
                  JSON Payload Example
                </div>
                <pre className="p-3.5 rounded-lg bg-[#0F172A] text-[#E2E8F0] font-mono text-[11px] overflow-x-auto">
                  {samplePayload}
                </pre>
                <p className="text-[#64748B]">
                  Matching phone numbers append a new call remark automatically.
                </p>
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                {!confirmRotate ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRotate(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FCD34D] hover:bg-[#FEF3C7] rounded-lg cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Rotate Secret</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[#B91C1C] font-medium">
                      Existing webhook URLs will stop working. Confirm?
                    </span>
                    <button
                      type="button"
                      disabled={rotating}
                      onClick={handleRotate}
                      className="px-3 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                    >
                      {rotating ? 'Rotating...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRotate(false)}
                      className="px-2.5 py-1.5 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
