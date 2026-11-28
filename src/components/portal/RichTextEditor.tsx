import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_KB_IMAGE_BYTES = 3 * 1024 * 1024;

export function sanitizeKnowledgebaseHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'div',
      'span',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'del',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'a',
      'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'align'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  });
}

function isSafeMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/knowledgebase/images/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function RichTextEditor({
  value,
  resetKey,
  placeholder = 'Write your article, technical runbook, or sales guide...',
  onChange,
  onError,
}: {
  value: string;
  resetKey: string | number;
  placeholder?: string;
  onChange: (html: string) => void;
  onError: (message: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedRef = useRef<string>(value);

  const [blockType, setBlockType] = useState<'P' | 'H1' | 'H2' | 'H3'>('P');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedRef.current || el.innerHTML !== value) {
      el.innerHTML = value || '';
      lastEmittedRef.current = value;
    }
  }, [resetKey, value]);

  const emitHtml = () => {
    const el = editorRef.current;
    if (!el) return;
    const textOnly = (el.textContent || '').trim();
    const hasImages = Boolean(el.querySelector('img'));
    const next = !textOnly && !hasImages ? '' : el.innerHTML;
    lastEmittedRef.current = next;
    onChange(next);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (!savedRangeRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  };

  const execCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitHtml();
  };

  const handleBlockChange = (nextTag: 'P' | 'H1' | 'H2' | 'H3') => {
    setBlockType(nextTag);
    execCommand('formatBlock', `<${nextTag}>`);
  };

  const syncActiveBlock = () => {
    saveSelection();
    const raw = (document.queryCommandValue('formatBlock') || '')
      .toUpperCase()
      .replace(/[<>]/g, '');
    if (raw === 'H1' || raw === 'H2' || raw === 'H3') {
      setBlockType(raw);
    } else {
      setBlockType('P');
    }
  };

  const insertSafeHtmlAtCaret = (html: string) => {
    restoreSelection();
    const clean = sanitizeKnowledgebaseHtml(html);
    document.execCommand('insertHTML', false, clean);
    emitHtml();
  };

  const handleApplyLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkUrl.trim();
    if (!isSafeMediaUrl(trimmed)) {
      onError('Enter a valid http:// or https:// link.');
      return;
    }
    restoreSelection();
    const sel = window.getSelection();
    const hasText = Boolean(sel && sel.toString().trim().length > 0);
    if (hasText) {
      document.execCommand('createLink', false, trimmed);
    } else {
      const safeHref = trimmed.replace(/"/g, '&quot;');
      insertSafeHtmlAtCaret(
        `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${trimmed}</a> `
      );
    }
    setLinkPopoverOpen(false);
    setLinkUrl('https://');
    emitHtml();
  };

  const uploadAndInsertImage = async (file: File) => {
    const extOk = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!ALLOWED_IMAGE_MIMES.has(file.type) && !extOk) {
      onError('Only PNG, JPG, WEBP, or GIF images are supported.');
      return;
    }
    if (file.size > MAX_KB_IMAGE_BYTES) {
      onError('Image must be 3 MB or smaller.');
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiFetch<{ url: string }>('/api/knowledgebase/images', {
        method: 'POST',
        body: formData,
      });
      const safeAlt = (imageAltInput.trim() || file.name.replace(/\.[^.]+$/, '')).replace(
        /"/g,
        '&quot;'
      );
      insertSafeHtmlAtCaret(
        `<p><img src="${res.url}" alt="${safeAlt}" /></p><p><br /></p>`
      );
      setImagePopoverOpen(false);
      setImageUrlInput('');
      setImageAltInput('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInsertImageUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = imageUrlInput.trim();
    if (!isSafeMediaUrl(trimmed)) {
      onError('Enter a valid https:// or http:// image URL.');
      return;
    }
    const safeSrc = trimmed.replace(/"/g, '&quot;');
    const safeAlt = (imageAltInput.trim() || 'Article image').replace(/"/g, '&quot;');
    insertSafeHtmlAtCaret(
      `<p><img src="${safeSrc}" alt="${safeAlt}" /></p><p><br /></p>`
    );
    setImagePopoverOpen(false);
    setImageUrlInput('');
    setImageAltInput('');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.files || []);
    const imgFile = files.find((f) => f.type.startsWith('image/'));
    if (imgFile) {
      e.preventDefault();
      saveSelection();
      void uploadAndInsertImage(imgFile);
    }
  };

  const btnClass =
    'p-1.5 rounded-md text-[#334155] hover:text-[#0F172A] hover:bg-white border border-transparent hover:border-[#CBD5E1] transition-colors cursor-pointer';

  return (
    <div className="border border-[#CBD5E1] rounded-xl overflow-hidden bg-white focus-within:border-[#17C964]">
      {/* Word-Style Toolbar Ribbon */}
      <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-2.5 py-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('undo')}
          title="Undo"
          aria-label="Undo"
          className={btnClass}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('redo')}
          title="Redo"
          aria-label="Redo"
          className={btnClass}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-[#CBD5E1] mx-1" aria-hidden="true" />

        <select
          value={blockType}
          onChange={(e) =>
            handleBlockChange(e.target.value as 'P' | 'H1' | 'H2' | 'H3')
          }
          aria-label="Text style"
          className="h-7 px-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] cursor-pointer focus:outline-none focus:border-[#17C964]"
        >
          <option value="P">Normal Text</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
        </select>

        <span className="h-4 w-px bg-[#CBD5E1] mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('bold')}
          title="Bold"
          aria-label="Bold"
          className={btnClass}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('italic')}
          title="Italic"
          aria-label="Italic"
          className={btnClass}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('underline')}
          title="Underline"
          aria-label="Underline"
          className={btnClass}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('strikeThrough')}
          title="Strikethrough"
          aria-label="Strikethrough"
          className={btnClass}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-[#CBD5E1] mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('insertUnorderedList')}
          title="Bullet List"
          aria-label="Bullet List"
          className={btnClass}
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('insertOrderedList')}
          title="Numbered List"
          aria-label="Numbered List"
          className={btnClass}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('formatBlock', '<BLOCKQUOTE>')}
          title="Quote Block"
          aria-label="Quote Block"
          className={btnClass}
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('insertHorizontalRule')}
          title="Divider Line"
          aria-label="Divider Line"
          className={btnClass}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-[#CBD5E1] mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('justifyLeft')}
          title="Align Left"
          aria-label="Align Left"
          className={btnClass}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('justifyCenter')}
          title="Align Center"
          aria-label="Align Center"
          className={btnClass}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('justifyRight')}
          title="Align Right"
          aria-label="Align Right"
          className={btnClass}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-[#CBD5E1] mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            saveSelection();
            setImagePopoverOpen(false);
            setLinkPopoverOpen((v) => !v);
          }}
          title="Insert Link"
          aria-label="Insert Link"
          className={`${btnClass} ${linkPopoverOpen ? 'bg-white border-[#17C964] text-[#059669]' : ''}`}
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            saveSelection();
            setLinkPopoverOpen(false);
            setImagePopoverOpen((v) => !v);
          }}
          title="Insert Image"
          aria-label="Insert Image"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
            imagePopoverOpen
              ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
              : 'bg-white border-[#CBD5E1] text-[#334155] hover:text-[#0F172A]'
          }`}
        >
          <ImagePlus className="w-3.5 h-3.5 text-[#059669]" />
          <span>Add Image</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('removeFormat')}
          title="Clear Formatting"
          aria-label="Clear Formatting"
          className={`${btnClass} ml-auto`}
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline Link Insertion Bar */}
      {linkPopoverOpen && (
        <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center gap-2 text-xs">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyLink(e);
              }
            }}
            placeholder="https://hostgraber.com/docs"
            className="flex-1 min-w-[200px] h-8 px-2.5 bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:border-[#17C964]"
          />
          <button
            type="button"
            onClick={handleApplyLink}
            className="h-8 px-3 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-md cursor-pointer"
          >
            Insert Link
          </button>
          <button
            type="button"
            onClick={() => setLinkPopoverOpen(false)}
            className="h-8 px-2.5 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline Image Insertion Bar */}
      {imagePopoverOpen && (
        <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAndInsertImage(file);
                }}
                className="sr-only"
              />
              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-8 px-3 font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-md cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploadingImage ? 'Uploading...' : 'Upload Image File'}
                </span>
              </button>
              <span className="text-[#64748B]">PNG, JPG, WEBP, GIF (max 3 MB)</span>
            </div>
            <button
              type="button"
              onClick={() => setImagePopoverOpen(false)}
              className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E2E8F0]">
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInsertImageUrl(e);
                }
              }}
              placeholder="Or paste HTTPS image URL..."
              className="flex-1 min-w-[200px] h-8 px-2.5 bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:border-[#17C964]"
            />
            <input
              type="text"
              value={imageAltInput}
              onChange={(e) => setImageAltInput(e.target.value)}
              placeholder="Caption / Alt text (optional)"
              className="w-44 h-8 px-2.5 bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:border-[#17C964]"
            />
            <button
              type="button"
              onClick={handleInsertImageUrl}
              className="h-8 px-3 font-semibold text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-md cursor-pointer"
            >
              Insert URL
            </button>
          </div>
        </div>
      )}

      {/* Document Canvas */}
      <div className="bg-[#F1F5F9]/60 p-3 sm:p-4 max-h-[380px] overflow-y-auto">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitHtml}
          onBlur={() => {
            saveSelection();
            emitHtml();
          }}
          onKeyUp={syncActiveBlock}
          onMouseUp={syncActiveBlock}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className="kb-prose min-h-[240px] bg-white border border-[#E2E8F0] rounded-lg px-6 py-5 shadow-xs focus:outline-none"
        />
      </div>
    </div>
  );
}
