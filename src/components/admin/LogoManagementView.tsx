import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, RotateCcw, Save, Upload } from 'lucide-react';
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

type LogoTarget = 'brand' | 'pdf';

export function LogoManagementView({
  settings,
  embedded = false,
  readOnly = false,
  onSaved,
  onToast,
}: {
  settings: PortalSettings;
  embedded?: boolean;
  readOnly?: boolean;
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTarget, setActiveTarget] = useState<LogoTarget>('brand');

  // Brand logo state
  const [selectedBrandFile, setSelectedBrandFile] = useState<File | null>(null);
  const [brandPreviewDataUrl, setBrandPreviewDataUrl] = useState<string | null>(null);
  const [brandUrlInput, setBrandUrlInput] = useState<string>(
    settings.logoUrl && !settings.logoUrl.startsWith('data:') ? settings.logoUrl : ''
  );
  const [showCompanyName, setShowCompanyName] = useState<boolean>(
    settings.logoShowCompanyName
  );

  // PDF quotation logo state
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [pdfPreviewDataUrl, setPdfPreviewDataUrl] = useState<string | null>(null);
  const [pdfUrlInput, setPdfUrlInput] = useState<string>(
    settings.pdfLogoUrl && !settings.pdfLogoUrl.startsWith('data:')
      ? settings.pdfLogoUrl
      : ''
  );

  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setShowCompanyName(settings.logoShowCompanyName);
    if (!selectedBrandFile) {
      setBrandUrlInput(
        settings.logoUrl && !settings.logoUrl.startsWith('data:') ? settings.logoUrl : ''
      );
    }
    if (!selectedPdfFile) {
      setPdfUrlInput(
        settings.pdfLogoUrl && !settings.pdfLogoUrl.startsWith('data:')
          ? settings.pdfLogoUrl
          : ''
      );
    }
  }, [
    settings.logoUrl,
    settings.pdfLogoUrl,
    settings.logoShowCompanyName,
    selectedBrandFile,
    selectedPdfFile,
  ]);

  const effectiveBrandPreviewUrl =
    brandPreviewDataUrl ?? (brandUrlInput.trim() || settings.logoUrl || null);

  const effectivePdfPreviewUrl =
    pdfPreviewDataUrl ??
    (pdfUrlInput.trim() || settings.pdfLogoUrl || effectiveBrandPreviewUrl);

  const isBrandTab = activeTarget === 'brand';
  const currentSelectedFile = isBrandTab ? selectedBrandFile : selectedPdfFile;
  const currentUrlInput = isBrandTab ? brandUrlInput : pdfUrlInput;

  const hasUnsavedChanges = isBrandTab
    ? Boolean(selectedBrandFile) ||
      showCompanyName !== settings.logoShowCompanyName ||
      (brandUrlInput.trim() !== '' &&
        brandUrlInput.trim() !== (settings.logoUrl || ''))
    : Boolean(selectedPdfFile) ||
      (pdfUrlInput.trim() !== '' &&
        pdfUrlInput.trim() !== (settings.pdfLogoUrl || ''));

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
        if (isBrandTab) {
          setSelectedBrandFile(file);
          setBrandPreviewDataUrl(reader.result);
          setBrandUrlInput('');
        } else {
          setSelectedPdfFile(file);
          setPdfPreviewDataUrl(reader.result);
          setPdfUrlInput('');
        }
      }
    };
    reader.onerror = () => {
      onToast('error', 'Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      if (isBrandTab) {
        if (selectedBrandFile) {
          const formData = new FormData();
          formData.append('target', 'brand');
          formData.append('logo', selectedBrandFile);
          formData.append('logoShowCompanyName', String(showCompanyName));
          await apiFetch<PortalSettings>('/api/admin/logo/upload', {
            method: 'POST',
            body: formData,
          });
        } else {
          const trimmedUrl = brandUrlInput.trim();
          await apiFetch<PortalSettings>('/api/admin/logo', {
            method: 'PUT',
            body: JSON.stringify({
              target: 'brand',
              logoUrl: trimmedUrl || settings.logoUrl,
              logoShowCompanyName: showCompanyName,
            }),
          });
        }
        setSelectedBrandFile(null);
        setBrandPreviewDataUrl(null);
        await onSaved();
        onToast('success', 'Brand logo updated.');
      } else {
        if (selectedPdfFile) {
          const formData = new FormData();
          formData.append('target', 'pdf');
          formData.append('logo', selectedPdfFile);
          await apiFetch<PortalSettings>('/api/admin/logo/upload', {
            method: 'POST',
            body: formData,
          });
        } else {
          const trimmedUrl = pdfUrlInput.trim();
          await apiFetch<PortalSettings>('/api/admin/logo', {
            method: 'PUT',
            body: JSON.stringify({
              target: 'pdf',
              pdfLogoUrl: trimmedUrl || settings.pdfLogoUrl,
            }),
          });
        }
        setSelectedPdfFile(null);
        setPdfPreviewDataUrl(null);
        await onSaved();
        onToast('success', 'PDF quotation logo updated.');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
    if (readOnly) return;
    setResetting(true);
    try {
      await apiFetch<PortalSettings>(`/api/admin/logo?target=${activeTarget}`, {
        method: 'DELETE',
      });
      if (isBrandTab) {
        setSelectedBrandFile(null);
        setBrandPreviewDataUrl(null);
        setBrandUrlInput('');
        setShowCompanyName(true);
      } else {
        setSelectedPdfFile(null);
        setPdfPreviewDataUrl(null);
        setPdfUrlInput('');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await onSaved();
      onToast(
        'success',
        isBrandTab
          ? 'Restored default HostGraber logo.'
          : 'PDF quotation logo reset to use the Brand Logo.'
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Failed to reset logo.'
      );
    } finally {
      setResetting(false);
    }
  };

  const canReset = isBrandTab
    ? Boolean(settings.logoUrl || selectedBrandFile || brandUrlInput)
    : Boolean(settings.pdfLogoUrl || selectedPdfFile || pdfUrlInput);

  return (
    <div className="space-y-6 max-w-5xl">
      {!embedded && (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
            Logo Management
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Sidebar, login &amp; PDF quotation branding
          </p>
        </div>
      )}

      {/* Target Switcher */}
      <div className="inline-flex flex-wrap gap-2 p-1 bg-white border border-[#E2E8F0] rounded-xl">
        <button
          type="button"
          onClick={() => {
            setActiveTarget('brand');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            isBrandTab
              ? 'bg-[#17C964] text-[#04120A]'
              : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Brand Logo (Sidebar &amp; Login)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTarget('pdf');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            !isBrandTab
              ? 'bg-[#17C964] text-[#04120A]'
              : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>PDF Quotation Logo</span>
          {settings.pdfLogoUrl && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#0F172A]/10 text-[#0F172A]">
              Custom
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Upload & Configuration Form */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6"
        >
          {!isBrandTab && (
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475569]">
              {settings.pdfLogoUrl
                ? 'Custom PDF logo active.'
                : 'Currently inheriting the Brand Logo for PDF quotations.'}
            </div>
          )}

          {/* Dropzone */}
          <div>
            <label className="block text-xs font-medium text-[#334155] mb-2">
              {isBrandTab ? 'Upload Brand Logo Image' : 'Upload PDF Quotation Logo'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              disabled={readOnly}
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => handleFilePicked(e.target.files?.[0])}
              className="sr-only"
            />
            <div
              role="button"
              tabIndex={readOnly ? -1 : 0}
              onClick={() => {
                if (!readOnly) fileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setDragActive(false);
                handleFilePicked(e.dataTransfer.files?.[0]);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                readOnly
                  ? 'border-[#E2E8F0] bg-[#F8FAFC] opacity-60 cursor-not-allowed'
                  : dragActive
                    ? 'border-[#17C964] bg-[#ECFDF5]/60 cursor-pointer'
                    : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#94A3B8] cursor-pointer'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center mx-auto text-[#059669]">
                <Upload className="w-5 h-5" />
              </div>
              <div className="mt-3 text-sm font-medium text-[#0F172A]">
                {currentSelectedFile
                  ? currentSelectedFile.name
                  : 'Click to browse or drag & drop logo'}
              </div>
              <div className="mt-1 text-xs text-[#64748B]">
                PNG, JPG, WEBP, or SVG up to 2 MB
              </div>
              {currentSelectedFile && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBrandTab) {
                      setSelectedBrandFile(null);
                      setBrandPreviewDataUrl(null);
                    } else {
                      setSelectedPdfFile(null);
                      setPdfPreviewDataUrl(null);
                    }
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
              {isBrandTab ? 'Or Brand Logo Image URL' : 'Or PDF Logo Image URL'}
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={currentUrlInput}
              onChange={(e) => {
                if (isBrandTab) {
                  setSelectedBrandFile(null);
                  setBrandPreviewDataUrl(null);
                  setBrandUrlInput(e.target.value);
                } else {
                  setSelectedPdfFile(null);
                  setPdfPreviewDataUrl(null);
                  setPdfUrlInput(e.target.value);
                }
              }}
              placeholder="https://example.com/logo.png"
              className="w-full px-3.5 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] disabled:opacity-60 focus:outline-none focus:bg-white focus:border-[#17C964]"
            />
          </div>

          {/* Sidebar Display Style (only on Brand tab) */}
          {isBrandTab && (
            <div>
              <div className="text-xs font-medium text-[#334155] mb-2">
                Sidebar &amp; PDF Header Layout
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setShowCompanyName(true)}
                  className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                    showCompanyName
                      ? 'border-[#17C964] bg-[#ECFDF5]/60'
                      : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'
                  } ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
                  disabled={readOnly}
                  onClick={() => setShowCompanyName(false)}
                  className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                    !showCompanyName
                      ? 'border-[#17C964] bg-[#ECFDF5]/60'
                      : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'
                  } ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
          )}

          {/* Actions */}
          {!readOnly && (
            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting || !canReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {resetting
                    ? 'Resetting...'
                    : isBrandTab
                      ? 'Reset to Default'
                      : 'Use Brand Logo'}
                </span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Saving...'
                    : isBrandTab
                      ? 'Save Brand Logo'
                      : 'Save PDF Logo'}
                </span>
              </button>
            </div>
          )}
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
                : settings.pdfLogoUrl && !isBrandTab
                  ? 'Custom PDF logo active'
                  : settings.logoUrl
                    ? 'Custom logo active'
                    : 'Default monogram'}
            </span>
          </div>

          {/* PDF Quotation Banner Preview */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#64748B] flex items-center justify-between">
              <span>PDF Quotation Header</span>
              <span className="text-[11px] text-[#059669]">
                {pdfPreviewDataUrl || pdfUrlInput.trim() || settings.pdfLogoUrl
                  ? 'Custom PDF Logo'
                  : 'Using Brand Logo'}
              </span>
            </div>
            <div className="rounded-lg overflow-hidden border border-[#2A303C]">
              <div className="px-4 py-3.5 bg-[#14181F] flex items-center justify-between gap-3">
                <BrandMark
                  logoUrl={effectivePdfPreviewUrl}
                  companyName={settings.companyName}
                  showCompanyName={showCompanyName}
                  subtitle={settings.companyWebsite || 'Pricing Quotation'}
                  tone="dark"
                />
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-bold tracking-wide text-[#17C964]">
                    PLAN QUOTATION
                  </div>
                  <div className="text-[10px] text-[#94A3B8]">A4 PDF Export</div>
                </div>
              </div>
              <div className="h-1 bg-[#17C964]" />
            </div>
          </div>

          {/* Dark Sidebar Header Preview */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#64748B]">
              Dark Sidebar (Expanded)
            </div>
            <div className="h-16 px-4 rounded-lg bg-[#14181F] border border-[#2A303C] flex items-center">
              <BrandMark
                logoUrl={effectiveBrandPreviewUrl}
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
                logoUrl={effectiveBrandPreviewUrl}
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
                logoUrl={effectiveBrandPreviewUrl}
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
