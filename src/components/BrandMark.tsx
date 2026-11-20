import { useEffect, useState } from 'react';

interface BrandMarkProps {
  logoUrl?: string | null;
  companyName?: string;
  showCompanyName?: boolean;
  subtitle?: string | null;
  compact?: boolean;
  tone?: 'dark' | 'light';
}

export function BrandMark({
  logoUrl,
  companyName = 'HostGraber',
  showCompanyName = true,
  subtitle = 'Pricing Portal',
  compact = false,
  tone = 'dark',
}: BrandMarkProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const cleanName = (companyName || 'HostGraber').trim() || 'HostGraber';
  const hasCustomLogo = Boolean(logoUrl && !imgError);

  const renderMonogram = () => {
    const words = cleanName.split(/\s+/).filter(Boolean);
    const initials =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : cleanName.slice(0, 2).toUpperCase();

    return (
      <div className="w-8 h-8 rounded-lg bg-[#17C964] text-[#04120A] font-display font-bold text-sm flex items-center justify-center shrink-0">
        {initials}
      </div>
    );
  };

  const renderBrandTitle = () => {
    if (cleanName.toLowerCase() === 'hostgraber') {
      return (
        <>
          <span>Host</span>
          <span className={tone === 'dark' ? 'text-[#17C964]' : 'text-[#10B981]'}>
            Graber
          </span>
        </>
      );
    }
    return <span>{cleanName}</span>;
  };

  if (compact) {
    if (hasCustomLogo) {
      return (
        <img
          src={logoUrl!}
          alt={cleanName}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-8 h-8 rounded-md object-contain shrink-0"
        />
      );
    }
    return renderMonogram();
  }

  if (hasCustomLogo && !showCompanyName) {
    return (
      <div className="flex items-center min-w-0">
        <img
          src={logoUrl!}
          alt={cleanName}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-9 max-w-[168px] w-auto object-contain shrink-0"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      {hasCustomLogo ? (
        <img
          src={logoUrl!}
          alt={cleanName}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-8 h-8 rounded-md object-contain shrink-0"
        />
      ) : (
        renderMonogram()
      )}
      <div className="min-w-0">
        <div
          className={`text-[15px] font-bold tracking-tight truncate font-display leading-tight ${
            tone === 'dark' ? 'text-white' : 'text-[#0F172A]'
          }`}
        >
          {renderBrandTitle()}
        </div>
        {subtitle && (
          <div
            className={`text-[11px] truncate leading-tight mt-0.5 ${
              tone === 'dark' ? 'text-[#94A3B8]' : 'text-[#64748B]'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
