import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { copyTextToClipboard } from '../../lib/clipboard.ts';
import { COMMUNICATION_CATEGORIES } from '../../shared/leads.ts';
import type {
  CommunicationCategory,
  CommunicationTemplate,
  UserRole,
} from '../../shared/types.ts';

export function CommunicationCenterView({
  initialCategory = 'all',
  userRole,
  onToast,
}: {
  initialCategory?: CommunicationCategory | 'all';
  userRole: UserRole;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isSuperAdmin = userRole === 'super_admin';
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<
    CommunicationCategory | 'all'
  >(initialCategory);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunicationTemplate | null>(
    null
  );
  const [formCategory, setFormCategory] =
    useState<CommunicationCategory>('whatsapp_templates');
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    setCategoryFilter(initialCategory);
  }, [initialCategory]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiFetch<CommunicationTemplate[]>(
        '/api/communication-templates'
      );
      setTemplates(rows);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load templates.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
      .filter((t) => {
        if (!q) return true;
        return `${t.title} ${t.subject || ''} ${t.content} ${t.tags || ''}`
          .toLowerCase()
          .includes(q);
      });
  }, [templates, categoryFilter, search]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormCategory(
      categoryFilter === 'all' ? 'whatsapp_templates' : categoryFilter
    );
    setFormTitle('');
    setFormSubject('');
    setFormContent('');
    setFormTags('');
    setModalOpen(true);
  };

  const openEditModal = (item: CommunicationTemplate) => {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormTitle(item.title);
    setFormSubject(item.subject || '');
    setFormContent(item.content);
    setFormTags(item.tags || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      onToast('error', 'Template title and message content are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: formCategory,
        title: formTitle.trim(),
        subject:
          formCategory === 'email_templates' && formSubject.trim()
            ? formSubject.trim()
            : null,
        content: formContent.trim(),
        tags: formTags.trim() || null,
      };
      if (editingItem) {
        const updated = await apiFetch<CommunicationTemplate>(
          `/api/communication-templates/${editingItem.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
        onToast('success', 'Template updated.');
      } else {
        const created = await apiFetch<CommunicationTemplate>(
          '/api/communication-templates',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        setTemplates((prev) => [created, ...prev]);
        onToast('success', 'Template created.');
      }
      setModalOpen(false);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save template.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/communication-templates/${id}`, {
        method: 'DELETE',
      });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
      onToast('success', 'Template deleted.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete template.'
      );
    }
  };

  const handleCopy = async (item: CommunicationTemplate) => {
    const text = item.subject
      ? `Subject: ${item.subject}\n\n${item.content}`
      : item.content;
    const ok = await copyTextToClipboard(text);
    onToast(ok ? 'success' : 'error', ok ? 'Template copied.' : 'Copy failed.');
  };

  const categoryLabel = (id: CommunicationCategory) =>
    COMMUNICATION_CATEGORIES.find((c) => c.id === id)?.label || id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Communication Center
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Templates &amp; canned responses · Variables:{' '}
            <code className="font-mono text-[#0F172A]">{'{contact_name}'}</code>,{' '}
            <code className="font-mono text-[#0F172A]">{'{lead_id}'}</code>,{' '}
            <code className="font-mono text-[#0F172A]">{'{company_name}'}</code>
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template</span>
          </button>
        )}
      </div>

      {/* Category Filter Tabs & Search */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              categoryFilter === 'all'
                ? 'bg-[#17C964] text-[#04120A] font-semibold'
                : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            All ({templates.length})
          </button>
          {COMMUNICATION_CATEGORIES.map((cat) => {
            const count = templates.filter((t) => t.category === cat.id).length;
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#17C964] text-[#04120A] font-semibold'
                    : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by title, message, or tag..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
          Loading templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-3">
          <MessageSquareText className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <div className="text-sm font-semibold text-[#0F172A]">
            No templates found
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Template</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-[#64748B]">
                      {categoryLabel(item.category)}
                      {item.tags ? ` · ${item.tags}` : ''}
                    </div>
                    <h2 className="text-base font-semibold text-[#0F172A] mt-0.5">
                      {item.title}
                    </h2>
                  </div>
                </div>

                {item.subject && (
                  <div className="text-xs text-[#334155] font-medium">
                    Subject: {item.subject}
                  </div>
                )}

                <p className="text-xs text-[#475569] leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#64748B]">
                  Updated by {item.updatedBy}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      {confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="px-2 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-1.5 text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 text-[#64748B] hover:text-[#DC2626] border border-[#E2E8F0] hover:border-red-200 rounded-lg cursor-pointer"
                          aria-label="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal (Super Admin Only) */}
      {isSuperAdmin && modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F172A]">
                {editingItem ? 'Edit Template' : 'New Communication Template'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="flex-1 overflow-y-auto p-5 space-y-4 text-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as CommunicationCategory)
                    }
                    className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  >
                    {COMMUNICATION_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="followup, quote, whatsapp"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Template Title *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Cloud VPS Quotation Follow-up"
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>

              {formCategory === 'email_templates' && (
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Email Subject Line
                  </label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="HostGraber Server Quotation — Ref {lead_id}"
                    className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Message Content *
                </label>
                <textarea
                  required
                  rows={7}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Hi {contact_name}, thanks for contacting {company_name} (Ref: {lead_id})..."
                  className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
