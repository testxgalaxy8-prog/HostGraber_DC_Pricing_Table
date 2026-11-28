import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { UserAvatar } from '../UserAvatar.tsx';
import type { PortalSettings, PortalUser } from '../../shared/types.ts';

export type ProfileSubTab = 'avatar' | 'security_code' | 'password';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function ProfileView({
  user,
  settings,
  initialTab = 'avatar',
  onRefreshSession,
  onToast,
}: {
  user: PortalUser;
  settings: PortalSettings;
  initialTab?: ProfileSubTab;
  onRefreshSession: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const { changeOwnPassword } = useAuth();
  const [subTab, setSubTab] = useState<ProfileSubTab>(initialTab);

  // Profile picture state
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Lead security code state
  const [securityCode, setSecurityCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  // Change own password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const displayName = user.displayName || user.username;
  const effectiveAvatarPreview = avatarPreviewUrl ?? user.avatarUrl ?? null;

  const handleAvatarPicked = (file: File | undefined | null) => {
    if (!file) return;
    const extAllowed = /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!ALLOWED_AVATAR_MIMES.has(file.type) && !extAllowed) {
      onToast('error', 'Unsupported format. Please upload PNG, JPG, or WEBP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      onToast('error', 'Profile picture must be 2 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedAvatarFile(file);
        setAvatarPreviewUrl(reader.result);
      }
    };
    reader.onerror = () => {
      onToast('error', 'Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUploadAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAvatarFile) {
      onToast('error', 'Select a photo first.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', selectedAvatarFile);
      await apiFetch<{ user: PortalUser }>('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      await onRefreshSession();
      onToast('success', 'Profile picture updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to upload profile picture.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setRemovingAvatar(true);
    try {
      await apiFetch<{ user: PortalUser }>('/api/profile/avatar', {
        method: 'DELETE',
      });
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      await onRefreshSession();
      onToast('success', 'Profile picture removed.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to remove profile picture.'
      );
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleSaveSecurityCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (securityCode.trim().length < 4) {
      onToast('error', 'Security code must be at least 4 characters.');
      return;
    }
    setSavingCode(true);
    try {
      await apiFetch('/api/leads/security-code', {
        method: 'POST',
        body: JSON.stringify({ securityCode: securityCode.trim() }),
      });
      await onRefreshSession();
      setSecurityCode('');
      onToast('success', 'Your Lead Security Code has been saved.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save security code.'
      );
    } finally {
      setSavingCode(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      onToast('error', 'New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      onToast('error', 'New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onToast('success', 'Your password has been updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update password.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Account Summary Header */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSubTab('avatar')}
            title="Update profile picture"
            className="relative group shrink-0 cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17C964]"
          >
            <UserAvatar
              avatarUrl={effectiveAvatarPreview}
              name={displayName}
              size="lg"
            />
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center text-[#334155] group-hover:border-[#17C964] group-hover:text-[#059669] transition-colors">
              <Camera className="w-3 h-3" />
            </span>
          </button>

          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-[#0F172A] truncate">
              {displayName}
            </h1>
            <div className="text-xs text-[#64748B] mt-0.5">
              {user.role === 'super_admin' ? 'Super Admin' : 'Admin'} ·{' '}
              {user.departmentName || settings.companyName}
              {user.jobTitle ? ` · ${user.jobTitle}` : ''}
            </div>
            <div className="text-xs text-[#64748B] font-mono-tabular mt-0.5 truncate">
              @{user.username} · {user.email}
              {user.phone ? ` · ${user.phone}` : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('avatar')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'avatar'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Profile Picture</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('security_code')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'security_code'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lead Security Code</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('password')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'password'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Change Password</span>
          </button>
        </div>
      </section>

      {subTab === 'avatar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start max-w-4xl">
          <form
            onSubmit={handleUploadAvatar}
            className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5"
          >
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Your Profile Picture
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Shown in the portal header, team directory, and sales performance reports
              </p>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(e) => handleAvatarPicked(e.target.files?.[0])}
              className="sr-only"
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => avatarInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  avatarInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleAvatarPicked(e.dataTransfer.files?.[0]);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                dragActive
                  ? 'border-[#17C964] bg-[#ECFDF5]/60'
                  : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#94A3B8]'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center mx-auto text-[#059669]">
                <Upload className="w-5 h-5" />
              </div>
              <div className="mt-3 text-sm font-medium text-[#0F172A]">
                {selectedAvatarFile
                  ? selectedAvatarFile.name
                  : 'Click to browse or drag & drop photo'}
              </div>
              <div className="mt-1 text-xs text-[#64748B]">
                PNG, JPG, or WEBP up to 2 MB · Square photo recommended
              </div>
              {selectedAvatarFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAvatarFile(null);
                    setAvatarPreviewUrl(null);
                    if (avatarInputRef.current) avatarInputRef.current.value = '';
                  }}
                  className="mt-3 text-xs font-medium text-[#64748B] hover:text-[#0F172A] underline cursor-pointer"
                >
                  Clear selected photo
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={removingAvatar || !user.avatarUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{removingAvatar ? 'Removing...' : 'Remove Photo'}</span>
              </button>

              <button
                type="submit"
                disabled={uploadingAvatar || !selectedAvatarFile}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{uploadingAvatar ? 'Uploading...' : 'Save Profile Picture'}</span>
              </button>
            </div>
          </form>

          <section className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0F172A]">
                Avatar Preview
              </h3>
              <span className="text-xs text-[#64748B]">
                {selectedAvatarFile
                  ? 'Unsaved preview'
                  : user.avatarUrl
                    ? 'Custom photo active'
                    : 'Default initials'}
              </span>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <UserAvatar
                avatarUrl={effectiveAvatarPreview}
                name={displayName}
                size="xl"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0F172A] truncate">
                  {displayName}
                </div>
                <div className="text-xs text-[#64748B] truncate">
                  @{user.username}
                </div>
                <div className="text-xs text-[#059669] font-medium mt-1">
                  {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-[#64748B]">
                Header Badge Preview
              </div>
              <div className="px-4 py-3 rounded-lg bg-white border border-[#E2E8F0] flex items-center gap-2.5">
                <UserAvatar
                  avatarUrl={effectiveAvatarPreview}
                  name={displayName}
                  size="sm"
                />
                <div className="text-xs text-[#64748B] truncate">
                  <span className="font-medium text-[#0F172A]">{displayName}</span>
                  {' · '}
                  <span>{user.role === 'super_admin' ? 'Super Admin' : 'Admin'}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {subTab === 'security_code' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 max-w-2xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Personal Lead Security Code
              </h2>
              <p className="text-xs text-[#64748B] mt-1">
                Status:{' '}
                <span className="font-semibold text-[#0F172A]">
                  {user.hasLeadSecurityCode ? 'Configured' : 'Not set'}
                </span>{' '}
                · Required when teammates unlock your pipeline.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSecurityCode} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                New Lead Security Code (4–32 characters)
              </label>
              <input
                type="password"
                required
                minLength={4}
                maxLength={32}
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                placeholder="Enter personal security code"
                className="w-full max-w-sm px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <button
              type="submit"
              disabled={savingCode}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{savingCode ? 'Saving...' : 'Save Security Code'}</span>
            </button>
          </form>
        </section>
      )}

      {subTab === 'password' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 max-w-2xl space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">
              Change Account Password
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              Update the password used to sign in to @{user.username}.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                New Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
