import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Copy,
  FileText,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { copyTextToClipboard } from '../../lib/clipboard.ts';
import { KNOWLEDGEBASE_CATEGORIES } from '../../shared/leads.ts';
import type {
  KnowledgebaseArticle,
  KnowledgebaseCategory,
  UserRole,
} from '../../shared/types.ts';
import {
  RichTextEditor,
  sanitizeKnowledgebaseHtml,
} from './RichTextEditor.tsx';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toArticleHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeKnowledgebaseHtml(trimmed);
  }
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
  return sanitizeKnowledgebaseHtml(paragraphs);
}

function extractPlainText(content: string): string {
  if (!content) return '';
  if (!/<[a-z][\s\S]*>/i.test(content)) return content;
  const parsed = new DOMParser().parseFromString(
    sanitizeKnowledgebaseHtml(content),
    'text/html'
  );
  return (parsed.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function KnowledgebaseView({
  initialCategory = 'all',
  userRole,
  onToast,
}: {
  initialCategory?: KnowledgebaseCategory | 'all';
  userRole: UserRole;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const isSuperAdmin = userRole === 'super_admin';

  const [articles, setArticles] = useState<KnowledgebaseArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<
    KnowledgebaseCategory | 'all'
  >(initialCategory);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [editingArticle, setEditingArticle] =
    useState<KnowledgebaseArticle | null>(null);
  const [formCategory, setFormCategory] =
    useState<KnowledgebaseCategory>('product_documentation');
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    setCategoryFilter(initialCategory);
  }, [initialCategory]);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiFetch<KnowledgebaseArticle[]>('/api/knowledgebase');
      setArticles(rows);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load knowledgebase.'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles
      .filter((a) => categoryFilter === 'all' || a.category === categoryFilter)
      .filter((a) => {
        if (!q) return true;
        const plain = extractPlainText(a.content);
        return `${a.title} ${a.summary || ''} ${plain} ${a.tags || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [articles, categoryFilter, search]);

  const activeArticle =
    filteredArticles.find((a) => a.id === selectedId) ||
    filteredArticles[0] ||
    null;

  const activeHtml = useMemo(
    () => (activeArticle ? toArticleHtml(activeArticle.content) : ''),
    [activeArticle]
  );

  const openCreateModal = () => {
    if (!isSuperAdmin) return;
    setEditingArticle(null);
    setFormCategory(
      categoryFilter === 'all' ? 'product_documentation' : categoryFilter
    );
    setFormTitle('');
    setFormSummary('');
    setFormContent('');
    setFormTags('');
    setFormPinned(false);
    setEditorResetKey((k) => k + 1);
    setModalOpen(true);
  };

  const openEditModal = (article: KnowledgebaseArticle) => {
    if (!isSuperAdmin) return;
    setEditingArticle(article);
    setFormCategory(article.category);
    setFormTitle(article.title);
    setFormSummary(article.summary || '');
    setFormContent(toArticleHtml(article.content));
    setFormTags(article.tags || '');
    setFormPinned(article.isPinned);
    setEditorResetKey((k) => k + 1);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const sanitized = sanitizeKnowledgebaseHtml(formContent).trim();
    const hasMeaningfulText = extractPlainText(sanitized).length > 0;
    const hasImage = /<img\b/i.test(sanitized);

    if (!formTitle.trim() || (!hasMeaningfulText && !hasImage)) {
      onToast('error', 'Title and article content are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: formCategory,
        title: formTitle.trim(),
        summary: formSummary.trim() || null,
        content: sanitized,
        tags: formTags.trim() || null,
        isPinned: formPinned,
      };
      if (editingArticle) {
        const updated = await apiFetch<KnowledgebaseArticle>(
          `/api/knowledgebase/${editingArticle.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        setArticles((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a))
        );
        setSelectedId(updated.id);
        onToast('success', 'Article updated.');
      } else {
        const created = await apiFetch<KnowledgebaseArticle>(
          '/api/knowledgebase',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        setArticles((prev) => [created, ...prev]);
        setSelectedId(created.id);
        onToast('success', 'Article published.');
      }
      setModalOpen(false);
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save article.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!isSuperAdmin) return;
    try {
      await apiFetch(`/api/knowledgebase/${id}`, { method: 'DELETE' });
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setConfirmDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      onToast('success', 'Article deleted.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete article.'
      );
    }
  };

  const handleCopy = async (article: KnowledgebaseArticle) => {
    const plain = extractPlainText(article.content);
    const ok = await copyTextToClipboard(`${article.title}\n\n${plain}`);
    onToast(ok ? 'success' : 'error', ok ? 'Article copied.' : 'Copy failed.');
  };

  const categoryLabel = (id: KnowledgebaseCategory) =>
    KNOWLEDGEBASE_CATEGORIES.find((c) => c.id === id)?.label || id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Knowledgebase
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {articles.length} {articles.length === 1 ? 'article' : 'articles'} · Product guides &amp; playbooks
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Article</span>
          </button>
        )}
      </div>

      {/* Category Filter Tabs & Search */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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
            All ({articles.length})
          </button>
          {KNOWLEDGEBASE_CATEGORIES.map((cat) => {
            const count = articles.filter((a) => a.category === cat.id).length;
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

        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
          Loading articles...
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <div className="text-sm font-semibold text-[#0F172A]">
            No articles match this filter
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Article</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Article Sidebar List */}
          <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden">
            {filteredArticles.map((article) => {
              const isSelected = activeArticle?.id === article.id;
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(article.id);
                    setConfirmDeleteId(null);
                  }}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#ECFDF5]/70 text-[#047857]'
                      : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-[#0F172A] leading-snug">
                      {article.title}
                    </span>
                    {article.isPinned && (
                      <Pin className="w-3.5 h-3.5 text-[#059669] shrink-0 mt-0.5" />
                    )}
                  </div>
                  {article.summary && (
                    <p className="text-xs text-[#64748B] mt-1 line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                  <div className="mt-1.5 text-[11px] text-[#64748B] truncate">
                    {categoryLabel(article.category)}
                    {article.tags ? ` · ${article.tags}` : ''}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Document Reader View */}
          {activeArticle && (
            <article className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="px-6 py-5 bg-[#F8FAFC]/70 border-b border-[#E2E8F0] flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                    <span className="inline-flex items-center gap-1 font-medium text-[#059669]">
                      <FileText className="w-3.5 h-3.5" />
                      {categoryLabel(activeArticle.category)}
                    </span>
                    {activeArticle.isPinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-[#0F172A]">Pinned</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {new Date(activeArticle.updatedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeArticle.updatedBy}</span>
                  </div>

                  <h2 className="text-xl font-bold text-[#0F172A] leading-snug">
                    {activeArticle.title}
                  </h2>

                  {activeArticle.summary && (
                    <p className="text-sm text-[#475569] leading-relaxed">
                      {activeArticle.summary}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(activeArticle)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditModal(activeArticle)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      {confirmDeleteId === activeArticle.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(activeArticle.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(activeArticle.id)}
                          className="p-1.5 text-[#64748B] hover:text-[#DC2626] bg-white border border-[#CBD5E1] hover:border-red-200 rounded-lg cursor-pointer"
                          aria-label="Delete article"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="px-6 py-6 sm:px-8">
                <div
                  className="kb-prose max-w-[74ch]"
                  dangerouslySetInnerHTML={{ __html: activeHtml }}
                />
              </div>

              {activeArticle.tags && (
                <div className="px-6 py-3 bg-[#F8FAFC]/60 border-t border-[#E2E8F0] text-xs text-[#64748B]">
                  Tags: <span className="text-[#334155]">{activeArticle.tags}</span>
                </div>
              )}
            </article>
          )}
        </div>
      )}

      {/* Word-Style Create / Edit Modal (Super Admin Only) */}
      {isSuperAdmin && modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-4xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden max-h-[94vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F172A]">
                {editingArticle ? 'Edit Article' : 'New Article'}
              </h3>
              <button
                type="button"
                disabled={saving}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as KnowledgebaseCategory)
                    }
                    className="w-full h-9 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  >
                    {KNOWLEDGEBASE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Cloud VPS Discovery & Migration Playbook"
                    className="w-full h-9 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Summary
                  </label>
                  <input
                    type="text"
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    placeholder="Short one-line summary"
                    className="w-full h-9 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="vps, migration, billing"
                    className="w-full h-9 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Article Content *
                </label>
                <RichTextEditor
                  value={formContent}
                  resetKey={editorResetKey}
                  onChange={setFormContent}
                  onError={(msg) => onToast('error', msg)}
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#334155] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formPinned}
                    onChange={(e) => setFormPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-[#CBD5E1] accent-[#17C964]"
                  />
                  <span>Pin to top</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    {saving
                      ? 'Saving...'
                      : editingArticle
                        ? 'Save Changes'
                        : 'Publish Article'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
