import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { PortalUser, UserRole } from '../../shared/types.ts';

export function UserManagementView({
  currentUser,
  onToast,
}: {
  currentUser: PortalUser;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const { changeOwnPassword } = useAuth();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Admin User form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [creating, setCreating] = useState(false);

  // Own password update form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newOwnPassword, setNewOwnPassword] = useState('');
  const [confirmOwnPassword, setConfirmOwnPassword] = useState('');
  const [updatingOwnPassword, setUpdatingOwnPassword] = useState(false);

  // Reset another user's password inline state
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingUserPassword, setResettingUserPassword] = useState(false);

  // Delete user inline confirmation state
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<PortalUser[]>('/api/users');
      setUsers(list);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load admin users.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) return;
    setCreating(true);
    try {
      const created = await apiFetch<PortalUser>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          password,
          role,
        }),
      });
      setUsers((prev) => [...prev, created]);
      setUsername('');
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRole('admin');
      onToast('success', `Admin user "${created.username}" created successfully.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create admin user.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleOwnPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOwnPassword.length < 8) {
      onToast('error', 'New password must be at least 8 characters long.');
      return;
    }
    if (newOwnPassword !== confirmOwnPassword) {
      onToast('error', 'New password and confirmation do not match.');
      return;
    }
    setUpdatingOwnPassword(true);
    try {
      await changeOwnPassword(currentPassword, newOwnPassword);
      setCurrentPassword('');
      setNewOwnPassword('');
      setConfirmOwnPassword('');
      onToast('success', 'Your admin password has been updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update password.'
      );
    } finally {
      setUpdatingOwnPassword(false);
    }
  };

  const handleResetUserPassword = async (userId: number) => {
    if (resetPasswordValue.length < 8) {
      onToast('error', 'New password must be at least 8 characters.');
      return;
    }
    setResettingUserPassword(true);
    try {
      const updated = await apiFetch<PortalUser>(`/api/users/${userId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setResetUserId(null);
      setResetPasswordValue('');
      onToast('success', `Password updated for ${updated.username}.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to reset user password.'
      );
    } finally {
      setResettingUserPassword(false);
    }
  };

  const handleRoleChange = async (userId: number, nextRole: UserRole) => {
    try {
      const updated = await apiFetch<PortalUser>(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onToast('success', `Updated role for ${updated.username}.`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update role.'
      );
    }
  };

  const handleToggleActive = async (user: PortalUser) => {
    try {
      const updated = await apiFetch<PortalUser>(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onToast(
        'success',
        updated.isActive ? 'Admin account activated.' : 'Admin account deactivated.'
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update user status.'
      );
    }
  };

  const handleDeleteUser = async (user: PortalUser) => {
    if (deletingUserId !== null) return;
    setDeletingUserId(user.id);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setConfirmDeleteUserId(null);
      if (resetUserId === user.id) {
        setResetUserId(null);
        setResetPasswordValue('');
      }
      onToast('success', `Deleted user "${user.username}".`);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete user.'
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          User Management
        </h1>
      </div>

      {/* Change Own Password */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-[#059669]" />
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Change Your Password ({currentUser.username})
          </h2>
        </div>

        <form
          onSubmit={handleOwnPasswordUpdate}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              New Password (8+ chars)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newOwnPassword}
              onChange={(e) => setNewOwnPassword(e.target.value)}
              placeholder="New password"
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
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
              value={confirmOwnPassword}
              onChange={(e) => setConfirmOwnPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>
          <button
            type="submit"
            disabled={updatingOwnPassword}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{updatingOwnPassword ? 'Updating...' : 'Update Password'}</span>
          </button>
        </form>
      </section>

      {/* Create New Admin User (Super Admin Only) */}
      {isSuperAdmin ? (
        <section className="bg-white border border-[#E2E8F0] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-[#059669]" />
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Create New Admin User
            </h2>
          </div>

          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. rahul.sharma"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahul@hostgraber.com"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Password (min 8 chars) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set strong password"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Admin Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
                >
                  <option value="admin">Admin (Manage Own Leads, Plans &amp; Excel)</option>
                  <option value="super_admin">Super Admin (Full Access &amp; Lead Transfer)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{creating ? 'Creating...' : 'Create Admin User'}</span>
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : (
        <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] text-xs text-[#64748B]">
          Only Super Admins can create, delete, reset passwords, or change roles for admin users.
        </div>
      )}

      {/* Admin Accounts Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Administrator Accounts ({users.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-[#64748B]">Loading admin accounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Admin User</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  {isSuperAdmin && <th className="py-3 px-5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-[#0F172A]">
                        {u.displayName || u.username}
                        {u.id === currentUser.id && (
                          <span className="ml-2 text-xs font-semibold text-[#059669]">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#64748B]">{u.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-[#475569]">
                      {u.username}
                    </td>
                    <td className="py-3 px-4">
                      {isSuperAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value as UserRole)
                          }
                          className="px-2.5 py-1 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                        >
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-[#475569] capitalize">
                          {u.role.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          u.isActive ? 'text-[#059669]' : 'text-[#DC2626]'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B] font-mono-tabular">
                      {new Date(u.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-5 text-right space-x-3 whitespace-nowrap">
                        {resetUserId === u.id ? (
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="password"
                              minLength={8}
                              value={resetPasswordValue}
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                              placeholder="New password (8+ chars)"
                              className="w-40 px-2.5 py-1 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                            />
                            <button
                              type="button"
                              disabled={resettingUserPassword}
                              onClick={() => handleResetUserPassword(u.id)}
                              className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetUserId(null);
                                setResetPasswordValue('');
                              }}
                              className="text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : confirmDeleteUserId === u.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-[#991B1B] font-medium">
                              Delete {u.username}?
                            </span>
                            <button
                              type="button"
                              disabled={deletingUserId === u.id}
                              onClick={() => handleDeleteUser(u)}
                              className="text-xs font-semibold text-[#DC2626] hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {deletingUserId === u.id ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingUserId === u.id}
                              onClick={() => setConfirmDeleteUserId(null)}
                              className="text-xs text-[#64748B] hover:text-[#0F172A] disabled:opacity-50 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteUserId(null);
                                setResetUserId(u.id);
                                setResetPasswordValue('');
                              }}
                              className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                            >
                              Reset Password
                            </button>
                            {u.id !== currentUser.id && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(u)}
                                  className="text-xs font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
                                >
                                  {u.isActive ? 'Deactivate' : 'Reactivate'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetUserId(null);
                                    setResetPasswordValue('');
                                    setConfirmDeleteUserId(u.id);
                                  }}
                                  className="text-xs font-semibold text-[#DC2626] hover:text-red-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
