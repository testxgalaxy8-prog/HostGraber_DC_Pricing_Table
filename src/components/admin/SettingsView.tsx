import { useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import type { BillingCycle, PortalSettings, UserRole } from '../../shared/types.ts';

export function SettingsView({
  settings,
  userRole,
  onSaved,
  onToast,
}: {
  settings: PortalSettings;
  userRole: UserRole;
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isSuperAdmin = userRole === 'super_admin';

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyWebsite, setCompanyWebsite] = useState(settings.companyWebsite);
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [defaultTaxRate, setDefaultTaxRate] = useState(String(settings.defaultTaxRate));
  const [defaultTaxDisplay, setDefaultTaxDisplay] = useState<
    'before_tax' | 'inclusive_of_tax'
  >(settings.defaultTaxDisplay);
  const [billingDurations, setBillingDurations] = useState<BillingCycle[]>(
    settings.defaultBillingDurations
  );
  const [saving, setSaving] = useState(false);

  const toggleDuration = (cycle: BillingCycle) => {
    setBillingDurations((prev) =>
      prev.includes(cycle) ? prev.filter((c) => c !== cycle) : [...prev, cycle]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    if (billingDurations.length === 0) {
      onToast('error', 'Select at least one default billing duration.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          companyName,
          companyWebsite,
          currencyCode,
          currencySymbol,
          defaultTaxRate: Number(defaultTaxRate),
          defaultTaxDisplay,
          defaultBillingDurations: billingDurations,
        }),
      });
      await onSaved();
      onToast('success', 'Portal settings saved.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          Settings
        </h1>
      </div>

      {!isSuperAdmin && (
        <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] text-xs text-[#64748B]">
          Settings are read-only for Admins. Only a Super Admin can modify global pricing and tax defaults.
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Company Name
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Company Website
            </label>
            <input
              type="url"
              disabled={!isSuperAdmin}
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Default Currency Code
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Currency Symbol
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Default Tax Rate (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              disabled={!isSuperAdmin}
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#334155] mb-1">
            Default Tax Display in Quotations
          </label>
          <select
            disabled={!isSuperAdmin}
            value={defaultTaxDisplay}
            onChange={(e) =>
              setDefaultTaxDisplay(
                e.target.value as 'before_tax' | 'inclusive_of_tax'
              )
            }
            className="w-full sm:w-80 px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
          >
            <option value="before_tax">Before Tax (e.g. &ldquo;before tax&rdquo;)</option>
            <option value="inclusive_of_tax">
              Inclusive of Tax (e.g. &ldquo;inclusive of tax&rdquo;)
            </option>
          </select>
        </div>

        <div>
          <div className="text-xs font-medium text-[#334155] mb-2">
            Default Billing Durations
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(
              [
                { key: 'monthly', label: 'Monthly (1 mo)' },
                { key: 'quarterly', label: 'Quarterly (3 mo)' },
                { key: 'semiannually', label: 'Semi-Annually (6 mo)' },
                { key: 'annually', label: 'Annually (12 mo)' },
                { key: 'biennially', label: 'Biennially (24 mo)' },
                { key: 'triennially', label: 'Triennially (36 mo)' },
              ] as Array<{ key: BillingCycle; label: string }>
            ).map((opt) => (
              <label
                key={opt.key}
                className="inline-flex items-center gap-2 text-sm text-[#334155] cursor-pointer"
              >
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={billingDurations.includes(opt.key)}
                  onChange={() => toggleDuration(opt.key)}
                  className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="pt-4 border-t border-[#E2E8F0] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
