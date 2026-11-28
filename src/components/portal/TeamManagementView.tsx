import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Pencil,
  Plus,
  Target,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import { getTodayIsoDate } from '../../shared/leads.ts';
import { UserAvatar } from '../UserAvatar.tsx';
import { UserManagementView } from '../admin/UserManagementView.tsx';
import type {
  DepartmentItem,
  PortalSettings,
  PortalUser,
  TeamTargetItem,
} from '../../shared/types.ts';

export type TeamManagementSubTab =
  | 'directory'
  | 'departments'
  | 'targets'
  | 'users';

export function TeamManagementView({
  currentUser,
  settings,
  initialTab = 'directory',
  onToast,
}: {
  currentUser: PortalUser;
  settings: PortalSettings;
  initialTab?: TeamManagementSubTab;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [subTab, setSubTab] = useState<TeamManagementSubTab>(initialTab);
  const [members, setMembers] = useState<PortalUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [targets, setTargets] = useState<TeamTargetItem[]>([]);
  const [monthKey, setMonthKey] = useState(() => getTodayIsoDate().slice(0, 7));
  const [loading, setLoading] = useState(true);

  // Edit member profile modal
  const [editingMember, setEditingMember] = useState<PortalUser | null>(null);
  const [memberDisplayName, setMemberDisplayName] = useState('');
  const [memberDepartmentId, setMemberDepartmentId] = useState<string>('');
  const [memberJobTitle, setMemberJobTitle] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [savingMember, setSavingMember] = useState(false);

  // Department form state
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptLeadName, setDeptLeadName] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  // Target form state
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [leadsTarget, setLeadsTarget] = useState('30');
  const [wonTarget, setWonTarget] = useState('5');
  const [revenueTarget, setRevenueTarget] = useState('50000');
  const [targetNotes, setTargetNotes] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const loadAll = useCallback(
    async (month: string) => {
      setLoading(true);
      try {
        const [usersList, deptList, targetsList] = await Promise.all([
          apiFetch<PortalUser[]>('/api/users'),
          apiFetch<DepartmentItem[]>('/api/team/departments'),
          apiFetch<TeamTargetItem[]>(
            `/api/team/targets?month=${encodeURIComponent(month)}`
          ),
        ]);
        setMembers(usersList);
        setDepartments(deptList);
        setTargets(targetsList);
        setTargetUserId((prev) =>
          prev || (usersList[0] ? String(usersList[0].id) : '')
        );
      } catch (err) {
        onToast(
          'error',
          err instanceof Error ? err.message : 'Failed to load team data.'
        );
      } finally {
        setLoading(false);
      }
    },
    [onToast]
  );

  useEffect(() => {
    loadAll(monthKey);
  }, [loadAll, monthKey]);

  const openEditMember = (member: PortalUser) => {
    setEditingMember(member);
    setMemberDisplayName(member.displayName || member.username);
    setMemberDepartmentId(
      member.departmentId ? String(member.departmentId) : ''
    );
    setMemberJobTitle(member.jobTitle || '');
    setMemberPhone(member.phone || '');
  };

  const handleSaveMemberProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setSavingMember(true);
    try {
      const updated = await apiFetch<PortalUser>(
        `/api/users/${editingMember.id}/profile`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: memberDisplayName.trim() || null,
            departmentId: memberDepartmentId
              ? Number(memberDepartmentId)
              : null,
            jobTitle: memberJobTitle.trim() || null,
            phone: memberPhone.trim() || null,
          }),
        }
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setEditingMember(null);
      onToast('success', 'Team member profile updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update profile.'
      );
    } finally {
      setSavingMember(false);
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) {
      onToast('error', 'Department name is required.');
      return;
    }
    setSavingDept(true);
    try {
      const payload = {
        name: deptName.trim(),
        description: deptDesc.trim() || null,
        leadName: deptLeadName.trim() || null,
      };
      if (editingDept) {
        const updated = await apiFetch<DepartmentItem>(
          `/api/team/departments/${editingDept.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        setDepartments((prev) =>
          prev.map((d) =>
            d.id === updated.id ? { ...updated, memberCount: d.memberCount } : d
          )
        );
        onToast('success', 'Department updated.');
      } else {
        const created = await apiFetch<DepartmentItem>(
          '/api/team/departments',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        setDepartments((prev) => [...prev, created]);
        onToast('success', 'Department created.');
      }
      setEditingDept(null);
      setDeptName('');
      setDeptDesc('');
      setDeptLeadName('');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save department.'
      );
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDepartment = async (id: number) => {
    try {
      await apiFetch(`/api/team/departments/${id}`, { method: 'DELETE' });
      setDepartments((prev) => prev.filter((d) => d.id !== id));
      onToast('success', 'Department deleted.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete department.'
      );
    }
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) {
      onToast('error', 'Select a team member.');
      return;
    }
    setSavingTarget(true);
    try {
      const saved = await apiFetch<TeamTargetItem>('/api/team/targets', {
        method: 'POST',
        body: JSON.stringify({
          userId: Number(targetUserId),
          monthKey,
          leadsTarget: Number(leadsTarget) || 0,
          wonTarget: Number(wonTarget) || 0,
          revenueTarget: Number(revenueTarget) || 0,
          notes: targetNotes.trim() || null,
        }),
      });
      setTargets((prev) => {
        const exists = prev.some((t) => t.id === saved.id);
        return exists
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [...prev, saved];
      });
      setTargetNotes('');
      onToast('success', 'Monthly target saved.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save target.'
      );
    } finally {
      setSavingTarget(false);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    try {
      await apiFetch(`/api/team/targets/${id}`, { method: 'DELETE' });
      setTargets((prev) => prev.filter((t) => t.id !== id));
      onToast('success', 'Target removed.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete target.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Team Management
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Directory, departments, quotas &amp; accounts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'directory'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Directory</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('departments')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'departments'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Departments</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('targets')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'targets'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Team Targets</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('users')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'users'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <UserCog className="w-3.5 h-3.5" />
            <span>Users</span>
          </button>
        </div>
      </div>

      {subTab === 'directory' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Team Directory ({members.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-[#64748B]">Loading directory...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Member</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Role &amp; Status</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            avatarUrl={m.avatarUrl}
                            name={m.displayName || m.username}
                            size="sm"
                          />
                          <div>
                            <div className="font-semibold text-[#0F172A]">
                              {m.displayName || m.username}
                            </div>
                            <div className="text-xs text-[#64748B]">
                              @{m.username} · {m.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#334155]">
                        {m.departmentName || 'Unassigned'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#475569]">
                        {m.jobTitle || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono-tabular text-[#475569]">
                        {m.phone || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="capitalize font-medium text-[#334155]">
                          {m.role.replace('_', ' ')}
                        </span>{' '}
                        ·{' '}
                        <span
                          className={
                            m.isActive
                              ? 'text-[#059669] font-semibold'
                              : 'text-[#DC2626] font-semibold'
                          }
                        >
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => openEditMember(m)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit Profile</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {subTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleSaveDepartment}
            className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                {editingDept ? 'Edit Department' : 'Add Department'}
              </h2>
              {editingDept && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDept(null);
                    setDeptName('');
                    setDeptDesc('');
                    setDeptLeadName('');
                  }}
                  className="text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                Department Name *
              </label>
              <input
                type="text"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Inside Sales"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                Department Lead
              </label>
              <input
                type="text"
                value={deptLeadName}
                onChange={(e) => setDeptLeadName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={deptDesc}
                onChange={(e) => setDeptDesc(e.target.value)}
                placeholder="Responsibilities and lead routing scope"
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <button
              type="submit"
              disabled={savingDept}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {savingDept
                  ? 'Saving...'
                  : editingDept
                    ? 'Update Department'
                    : 'Create Department'}
              </span>
            </button>
          </form>

          <section className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Departments ({departments.length})
              </h2>
            </div>
            <div className="divide-y divide-[#E2E8F0]">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="px-5 py-4 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[#0F172A]">
                      {dept.name}
                    </div>
                    {dept.description && (
                      <p className="text-xs text-[#64748B]">{dept.description}</p>
                    )}
                    <div className="text-xs text-[#475569]">
                      Lead: {dept.leadName || 'Unassigned'} ·{' '}
                      <span className="font-mono-tabular">
                        {dept.memberCount ?? 0} members
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDept(dept);
                        setDeptName(dept.name);
                        setDeptDesc(dept.description || '');
                        setDeptLeadName(dept.leadName || '');
                      }}
                      className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(dept.id)}
                      className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      aria-label="Delete department"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {subTab === 'targets' && (
        <div className="space-y-5">
          <form
            onSubmit={handleSaveTarget}
            className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Assign Monthly Sales Target
              </h2>
              <input
                type="month"
                value={monthKey}
                onChange={(e) => {
                  if (e.target.value) setMonthKey(e.target.value);
                }}
                className="px-3 py-1.5 text-xs font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Team Member *
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.displayName || m.username}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Leads Target
                </label>
                <input
                  type="number"
                  min={0}
                  value={leadsTarget}
                  onChange={(e) => setLeadsTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Won Deals Target
                </label>
                <input
                  type="number"
                  min={0}
                  value={wonTarget}
                  onChange={(e) => setWonTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Revenue Target ({settings.currencySymbol})
                </label>
                <input
                  type="number"
                  min={0}
                  value={revenueTarget}
                  onChange={(e) => setRevenueTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <button
                type="submit"
                disabled={savingTarget}
                className="px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {savingTarget ? 'Saving...' : 'Save Target'}
              </button>
            </div>
          </form>

          <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Active Targets for {monthKey} ({targets.length})
              </h2>
            </div>

            {targets.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#64748B]">
                No targets set for {monthKey} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                      <th className="py-3 px-5">Member</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-right">Leads Target</th>
                      <th className="py-3 px-4 text-right">Won Target</th>
                      <th className="py-3 px-4 text-right">Revenue Target</th>
                      <th className="py-3 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {targets.map((t) => (
                      <tr key={t.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-5">
                          <div className="font-semibold text-[#0F172A]">
                            {t.userDisplayName}
                          </div>
                          <div className="text-xs text-[#64748B]">
                            @{t.username}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#475569]">
                          {t.departmentName || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          {t.leadsTarget}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#059669]">
                          {t.wonTarget}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#0F172A]">
                          {formatCurrencyValue(
                            t.revenueTarget,
                            settings.currencySymbol,
                            settings.currencyCode
                          )}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteTarget(t.id)}
                            className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {subTab === 'users' && (
        <UserManagementView
          currentUser={currentUser}
          showOwnPasswordSection={false}
          onToast={onToast}
        />
      )}

      {/* Edit Team Member Profile Modal */}
      {editingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingMember(null);
          }}
        >
          <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F172A]">
                Edit Team Member Profile
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMemberProfile} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={memberDisplayName}
                  onChange={(e) => setMemberDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Department
                </label>
                <select
                  value={memberDepartmentId}
                  onChange={(e) => setMemberDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={memberJobTitle}
                  onChange={(e) => setMemberJobTitle(e.target.value)}
                  placeholder="Senior Cloud Executive"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={memberPhone}
                  onChange={(e) => setMemberPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
                >
                  {savingMember ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
