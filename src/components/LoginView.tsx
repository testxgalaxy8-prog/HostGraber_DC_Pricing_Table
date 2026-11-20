import { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { BrandMark } from './BrandMark.tsx';

export function LoginView({ onCancel }: { onCancel: () => void }) {
  const { login, signingIn, authError, demoPasswordActive, clearAuthError, settings } =
    useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loggedIn = await login(identifier, password);
    if (loggedIn) {
      setPassword('');
    }
  };

  const fillDemo = () => {
    clearAuthError();
    setIdentifier('admin');
    setPassword('HostGraber@123');
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-8 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-6 pb-5 border-b border-[#E2E8F0]">
          {settings.logoUrl ? (
            <BrandMark
              logoUrl={settings.logoUrl}
              companyName={settings.companyName}
              showCompanyName={settings.logoShowCompanyName}
              subtitle="Pricing Management Console"
              tone="light"
            />
          ) : (
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
                {settings.companyName || 'HostGraber'}{' '}
                <span className="text-[#10B981]">Admin</span>
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Pricing Management &amp; Excel Import Console
              </p>
            </div>
          )}
          <div className="w-10 h-10 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#059669] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <h2 className="text-base font-semibold text-[#0F172A]">
          Sign in to Admin Panel
        </h2>

        {demoPasswordActive && (
          <div className="mt-4 p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#047857] inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                First-Time Demo Admin Account
              </span>
              <button
                type="button"
                onClick={fillDemo}
                className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
              >
                Auto-fill
              </button>
            </div>
            <div className="font-mono-tabular text-[#0F172A]">
              Username: <span className="font-semibold">admin</span> · Password:{' '}
              <span className="font-semibold">HostGraber@123</span>
            </div>
            <p className="text-[#047857]">
              You will be required to change this demo password immediately after your first login.
            </p>
          </div>
        )}

        {authError && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              Username or Email
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => {
                clearAuthError();
                setIdentifier(e.target.value);
              }}
              placeholder="admin or admin@hostgraber.com"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                clearAuthError();
                setPassword(e.target.value);
              }}
              placeholder="Enter admin password"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 text-[#04120A] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>{signingIn ? 'Signing in...' : 'Sign In to Admin Panel'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-[#334155] hover:text-[#059669] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Plans Catalog</span>
          </button>
          <span className="inline-flex items-center gap-1 text-[#64748B]">
            <ShieldAlert className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Admin Only</span>
          </span>
        </div>
      </div>
    </div>
  );
}
