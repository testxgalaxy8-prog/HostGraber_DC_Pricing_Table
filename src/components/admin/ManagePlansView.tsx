import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, FolderPlus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatCurrencyValue } from '../../shared/quotation.ts';
import type {
  CategoryItem,
  HostingPlanFull,
  PortalSettings,
  UserRole,
} from '../../shared/types.ts';
import { PlanEditorModal } from './PlanEditorModal.tsx';

export function ManagePlansView({
  settings,
  categories,
  userRole,
  initialEditPlan,
  onClearInitialEdit,
  onViewPlan,
  onCategoriesChanged,
  onToast,
}: {
  settings: PortalSettings;
  categories: CategoryItem[];
  userRole: UserRole;
  initialEditPlan?: HostingPlanFull | null;
  onClearInitialEdit?: () => void;
  onViewPlan: (plan: HostingPlanFull) => void;
  onCategoriesChanged: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isSuperAdmin = userRole === 'super_admin';
  const [plans, setPlans] = useState<HostingPlanFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [editingPlan, setEditingPlan] = useState<HostingPlanFull | null>(
    initialEditPlan ?? null
  );
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [showCategoriesPanel, setShowCategoriesPanel] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<HostingPlanFull[]>('/api/admin/plans');
      setPlans(list);
      const validIds = new Set(list.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load hosting plans.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (initialEditPlan) {
      setEditingPlan(initialEditPlan);
    }
  }, [initialEditPlan]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (
        categoryFilter !== 'all' &&
        p.categoryName.toLowerCase() !== categoryFilter.toLowerCase()
      ) {
        return false;
      }
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;
      if (q) {
        const hay = `${p.name} ${p.series || ''} ${p.categoryName} ${p.shortDescription || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plans, search, categoryFilter, statusFilter]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const selectedFilteredCount = useMemo(
    () => filteredIds.filter((id) => selectedIdSet.has(id)).length,
    [filteredIds, selectedIdSet]
  );
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected =
    selectedFilteredCount > 0 && selectedFilteredCount < filteredIds.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  useEffect(() => {
    if (selectedIds.length === 0 && confirmBulkDelete) {
      setConfirmBulkDelete(false);
    }
  }, [selectedIds.length, confirmBulkDelete]);

  const toggleSelectPlan = (planId: number) => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) =>
      prev.includes(planId)
        ? prev.filter((id) => id !== planId)
        : [...prev, planId]
    );
  };

  const toggleSelectAllFiltered = () => {
    setConfirmBulkDelete(false);
    if (filteredIds.length === 0) return;
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredIds);
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setConfirmBulkDelete(false);
  };

  const handleToggleStatus = async (plan: HostingPlanFull) => {
    try {
      const updated = await apiFetch<HostingPlanFull>(
        `/api/plans/${plan.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !plan.isActive }),
        }
      );
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      onToast(
        'success',
        updated.isActive ? 'Plan activated.' : 'Plan deactivated.'
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update status.'
      );
    }
  };

  const handleDeletePlan = async (planId: number) => {
    try {
      await apiFetch(`/api/plans/${planId}`, { method: 'DELETE' });
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      setSelectedIds((prev) => prev.filter((id) => id !== planId));
      setConfirmDeleteId(null);
      onToast('success', 'Plan deleted.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete plan.'
      );
    }
  };

  const handleBulkDeletePlans = async () => {
    if (selectedIds.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const res = await apiFetch<{ deletedCount: number; deletedIds: number[] }>(
        '/api/plans/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({ planIds: selectedIds }),
        }
      );
      const deletedSet = new Set(res.deletedIds);
      setPlans((prev) => prev.filter((p) => !deletedSet.has(p.id)));
      setSelectedIds((prev) => prev.filter((id) => !deletedSet.has(id)));
      if (confirmDeleteId !== null && deletedSet.has(confirmDeleteId)) {
        setConfirmDeleteId(null);
      }
      setConfirmBulkDelete(false);
      onToast(
        'success',
        `Deleted ${res.deletedCount} plan${res.deletedCount === 1 ? '' : 's'}.`
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete selected plans.'
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      setNewCategoryName('');
      await onCategoriesChanged();
      onToast('success', 'Category added.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create category.'
      );
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
      await onCategoriesChanged();
      onToast('success', 'Category removed.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete category.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          {isSuperAdmin ? 'Manage Plans' : 'Hosting Plans'}
        </h1>

        {isSuperAdmin && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowCategoriesPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-lg hover:border-[#94A3B8] hover:text-[#0F172A] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderPlus className="w-4 h-4 text-[#059669]" />
              <span>Categories</span>
            </button>
            <button
              type="button"
              onClick={() => setCreatingPlan(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Plan</span>
            </button>
          </div>
        )}
      </div>

      {/* Category Manager Drawer */}
      {isSuperAdmin && showCategoriesPanel && (
        <section className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Manage Product Categories
            </h2>
            <button
              type="button"
              onClick={() => setShowCategoriesPanel(false)}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleAddCategory} className="flex items-center gap-2.5 max-w-md">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name (e.g. Cloud Reseller)"
              className="flex-1 px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
            <button
              type="submit"
              disabled={savingCategory}
              className="px-4 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer whitespace-nowrap"
            >
              {savingCategory ? 'Adding...' : 'Add Category'}
            </button>
          </form>

          <div className="flex flex-wrap gap-2.5 pt-3 border-t border-[#E2E8F0]">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm text-[#334155]"
              >
                <span>{cat.name}</span>
                {userRole === 'super_admin' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    title="Delete category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans by name, series, or category..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
          }
          className="w-full sm:w-auto px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#17C964]"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* Plans Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {isSuperAdmin && selectedIds.length > 0 && (
          <div
            className={`px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 ${
              confirmBulkDelete ? 'bg-[#FEF2F2]' : 'bg-[#F8FAFC]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-[#0F172A]">
                {selectedIds.length} plan{selectedIds.length === 1 ? '' : 's'} selected
              </span>
              {!allFilteredSelected && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  disabled={bulkDeleting}
                  className="font-medium text-[#059669] hover:text-[#047857] hover:underline cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Select all {filtered.length} visible
                </button>
              )}
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1 font-medium text-[#64748B] hover:text-[#0F172A] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {confirmBulkDelete ? (
                <>
                  <span className="text-xs font-medium text-[#991B1B]">
                    Delete {selectedIds.length} selected plan{selectedIds.length === 1 ? '' : 's'} permanently?
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDeletePlans}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-red-700 rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {bulkDeleting
                        ? 'Deleting...'
                        : `Confirm Delete (${selectedIds.length})`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(false)}
                    disabled={bulkDeleting}
                    className="px-3 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] hover:text-[#0F172A] rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-red-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedIds.length})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-[#64748B]">
            Loading hosting plans...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#64748B]">
            No hosting plans found. Click &ldquo;Add Plan&rdquo; or upload an Excel spreadsheet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  {isSuperAdmin && (
                    <th className="py-3 pl-5 pr-2 w-10">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        disabled={bulkDeleting}
                        aria-label="Select all visible plans"
                        className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer align-middle"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Plan Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Monthly Rate</th>
                  <th className="py-3 px-4 text-right">Annually Rate</th>
                  <th className="py-3 px-4 text-right">Triennially Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {filtered.map((plan) => {
                  const m = plan.pricing.find((p) => p.billingCycle === 'monthly');
                  const a = plan.pricing.find((p) => p.billingCycle === 'annually');
                  const t = plan.pricing.find((p) => p.billingCycle === 'triennially');

                  const mVal =
                    m?.currentPrice ?? m?.discountedPrice ?? m?.totalPrice ?? null;
                  const aVal =
                    a?.currentPrice ?? a?.discountedPrice ?? a?.totalPrice ?? null;
                  const tVal =
                    t?.currentPrice ?? t?.discountedPrice ?? t?.totalPrice ?? null;
                  const isSelected = selectedIdSet.has(plan.id);

                  return (
                    <tr
                      key={plan.id}
                      className={`transition-colors ${
                        isSelected
                          ? confirmBulkDelete
                            ? 'bg-[#FEF2F2]/70'
                            : 'bg-[#ECFDF5]/60'
                          : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {isSuperAdmin && (
                        <td className="py-3 pl-5 pr-2 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPlan(plan.id)}
                            disabled={bulkDeleting}
                            aria-label={`Select ${plan.name}`}
                            className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964] cursor-pointer align-middle"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0F172A]">{plan.name}</div>
                        <div className="text-xs text-[#64748B]">
                          {plan.series ? `${plan.series} · ` : ''}
                          {plan.specifications.length} specs · {plan.offers.length} offers
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#475569]">{plan.categoryName}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                        {mVal !== null && mVal > 0
                          ? formatCurrencyValue(
                              mVal,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                        {aVal !== null && aVal > 0
                          ? formatCurrencyValue(
                              aVal,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0F172A]">
                        {tVal !== null && tVal > 0
                          ? formatCurrencyValue(
                              tVal,
                              settings.currencySymbol,
                              settings.currencyCode
                            )
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            plan.isActive ? 'text-[#059669]' : 'text-[#DC2626]'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#64748B] font-mono-tabular whitespace-nowrap">
                        {new Date(plan.updatedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap space-x-3">
                        <button
                          type="button"
                          onClick={() => onViewPlan(plan)}
                          className="text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer"
                        >
                          View
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingPlan(plan)}
                              className="text-xs font-semibold text-[#059669] hover:text-[#047857] hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(plan)}
                              className="text-xs font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
                            >
                              {plan.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            {confirmDeleteId === plan.id ? (
                              <span className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePlan(plan.id)}
                                  className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(plan.id)}
                                className="text-xs font-semibold text-[#DC2626] hover:text-red-700 cursor-pointer"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isSuperAdmin && (creatingPlan || editingPlan) && (
        <PlanEditorModal
          plan={editingPlan}
          categories={categories}
          settings={settings}
          onClose={() => {
            setCreatingPlan(false);
            setEditingPlan(null);
            onClearInitialEdit?.();
          }}
          onSaved={async (saved) => {
            await loadPlans();
            await onCategoriesChanged();
            setCreatingPlan(false);
            setEditingPlan(null);
            onClearInitialEdit?.();
            onToast(
              'success',
              editingPlan
                ? `Updated "${saved.name}" successfully.`
                : `Created "${saved.name}" successfully.`
            );
          }}
        />
      )}
    </div>
  );
}
