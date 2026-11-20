import { useState } from 'react';
import { KeyRound, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { BrandMark } from './BrandMark.tsx';

export function ChangePasswordView({
  forced,
  onSuccess,
  onCancel,
  onToast,
}: {
  forced: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const { user, settings, changeOwnPassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState(
    forced ? 'HostGraber@123' : ''
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      onToast('success', 'Admin password updated successfully.');
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update admin password.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-8 shadow-sm">
        {settings.logoUrl && (
          <div className="mb-4">
            <BrandMark
              logoUrl={settings.logoUrl}
              companyName={settings.companyName}
              showCompanyName={settings.logoShowCompanyName}
              subtitle={null}
              tone="light"
            />
          </div>
        )}
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-[#E2E8F0]">
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">
              {forced ? 'Change Demo Admin Password' : 'Update Admin Password'}
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Signed in as {user?.username} ({user?.email})
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#059669] shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>

        {forced && (
          <div className="mb-5 p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] leading-relaxed">
            For security, you must replace the default demo password before uploading Excel files, editing plans, or creating admin users.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={forced ? 'HostGraber@123' : 'Enter current password'}
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              New Password (minimum 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter strong new password"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 text-[#04120A] text-sm font-semibold transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{saving ? 'Updating Password...' : 'Save New Password & Continue'}</span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
          {!forced && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 text-[#334155] hover:text-[#059669] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Admin Panel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={logout}
              className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              Sign out &amp; return to public plans
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
