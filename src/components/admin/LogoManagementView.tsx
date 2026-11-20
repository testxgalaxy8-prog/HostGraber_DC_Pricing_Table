import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, RotateCcw, Save, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { BrandMark } from '../BrandMark.tsx';
import type { PortalSettings } from '../../shared/types.ts';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

export function LogoManagementView({
  settings,
  onSaved,
  onToast,
}: {
  settings: PortalSettings;
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>(
    settings.logoUrl && !settings.logoUrl.startsWith('data:') ? settings.logoUrl : ''
  );
  const [showCompanyName, setShowCompanyName] = useState<boolean>(
    settings.logoShowCompanyName
  );
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setShowCompanyName(settings.logoShowCompanyName);
    if (!selectedFile) {
      setUrlInput(
        settings.logoUrl && !settings.logoUrl.startsWith('data:')
          ? settings.logoUrl
          : ''
      );
    }
  }, [settings.logoUrl, settings.logoShowCompanyName, selectedFile]);

  const effectivePreviewUrl =
    previewDataUrl ?? (urlInput.trim() || settings.logoUrl || null);

  const hasUnsavedChanges =
    Boolean(selectedFile) ||
    showCompanyName !== settings.logoShowCompanyName ||
    (urlInput.trim() !== '' && urlInput.trim() !== (settings.logoUrl || ''));

  const handleFilePicked = (file: File | undefined | null) => {
    if (!file) return;
    const extAllowed = /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    if (!ALLOWED_MIME_TYPES.has(file.type) && !extAllowed) {
      onToast('error', 'Unsupported format. Please upload PNG, JPG, WEBP, or SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      onToast('error', 'Logo file is larger than 2 MB. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedFile(file);
        setPreviewDataUrl(reader.result);
        setUrlInput('');
      }
    };
    reader.onerror = () => {
      onToast('error', 'Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('logo', selectedFile);
        formData.append('logoShowCompanyName', String(showCompanyName));
        await apiFetch<PortalSettings>('/api/admin/logo/upload', {
          method: 'POST',
          body: formData,
        });
      } else {
        const trimmedUrl = urlInput.trim();
        await apiFetch<PortalSettings>('/api/admin/logo', {
          method: 'PUT',
          body: JSON.stringify({
            logoUrl: trimmedUrl || settings.logoUrl,
            logoShowCompanyName: showCompanyName,
          }),
        });
      }
      setSelectedFile(null);
      setPreviewDataUrl(null);
      await onSaved();
      onToast('success', 'Brand logo updated.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save logo settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await apiFetch<PortalSettings>('/api/admin/logo', {
        method: 'DELETE',
      });
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setUrlInput('');
      setShowCompanyName(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await onSaved();
      onToast('success', 'Restored default HostGraber logo.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to reset brand logo.'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
          Logo Management
        </h1>
        <p className="text-sm text-[#64748B] mt-1">
          Upload a custom logo or set an image URL for the sidebar and admin sign-in screens.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Upload & Configuration Form */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6"
        >
          {/* Dropzone */}
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-2">
              Upload Logo Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => handleFilePicked(e.target.files?.[0])}
              className="sr-only"
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
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
                handleFilePicked(e.dataTransfer.files?.[0]);
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
                {selectedFile ? selectedFile.name : 'Click to browse or drag & drop logo'}
              </div>
              <div className="mt-1 text-xs text-[#64748B]">
                PNG, JPG, WEBP, or SVG up to 2 MB
              </div>
              {selectedFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setPreviewDataUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="mt-3 text-xs font-medium text-[#64748B] hover:text-[#0F172A] underline cursor-pointer"
                >
                  Clear selected file
                </button>
              )}
            </div>
          </div>

          {/* Direct Image URL */}
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1.5">
              Or Logo Image URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setSelectedFile(null);
                setPreviewDataUrl(null);
                setUrlInput(e.target.value);
              }}
              placeholder="https://example.com/logo.png"
              className="w-full px-3.5 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
            <p className="mt-1 text-xs text-[#64748B]">
              Leave empty to keep your uploaded file or use a hosted HTTPS image URL.
            </p>
          </div>

          {/* Sidebar Display Style */}
          <div>
            <div className="text-xs font-medium text-[#334155] mb-2">
              Sidebar Header Layout
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowCompanyName(true)}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  showCompanyName
                    ? 'border-[#17C964] bg-[#ECFDF5]/60'
                    : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="text-sm font-medium text-[#0F172A]">
                  Logo + Company Name
                </div>
                <div className="text-xs text-[#64748B] mt-0.5">
                  Best for square icons &amp; emblems
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowCompanyName(false)}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  !showCompanyName
                    ? 'border-[#17C964] bg-[#ECFDF5]/60'
                    : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="text-sm font-medium text-[#0F172A]">
                  Full Logo Only
                </div>
                <div className="text-xs text-[#64748B] mt-0.5">
                  Best for wide wordmark logos
                </div>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || (!settings.logoUrl && !selectedFile && !urlInput)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{resetting ? 'Resetting...' : 'Reset to Default'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Logo'}</span>
            </button>
          </div>
        </form>

        {/* Live Preview Panel */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
              <ImageIcon className="w-4 h-4 text-[#10B981]" />
              <span>Live Preview</span>
            </div>
            <span className="text-xs text-[#64748B]">
              {hasUnsavedChanges
                ? 'Unsaved preview'
                : settings.logoUrl
                ? 'Custom logo active'
                : 'Default monogram'}
            </span>
          </div>

          {/* Dark Sidebar Header Preview */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#64748B]">
              Dark Sidebar (Expanded)
            </div>
            <div className="h-16 px-4 rounded-lg bg-[#14181F] border border-[#2A303C] flex items-center">
              <BrandMark
                logoUrl={effectivePreviewUrl}
                companyName={settings.companyName}
                showCompanyName={showCompanyName}
                subtitle="Pricing Portal"
                tone="dark"
              />
            </div>
          </div>

          {/* Compact Sidebar Icon Preview */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#64748B]">
              Dark Sidebar (Collapsed)
            </div>
            <div className="w-[72px] h-16 rounded-lg bg-[#14181F] border border-[#2A303C] flex items-center justify-center">
              <BrandMark
                logoUrl={effectivePreviewUrl}
                companyName={settings.companyName}
                compact={true}
                tone="dark"
              />
            </div>
          </div>

          {/* Light Login Card Preview */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#64748B]">
              Light Login Header
            </div>
            <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] flex items-center">
              <BrandMark
                logoUrl={effectivePreviewUrl}
                companyName={settings.companyName}
                showCompanyName={showCompanyName}
                subtitle="Admin Console"
                tone="light"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
