import { useState } from 'react';

export function getUserInitials(name: string | null | undefined): string {
  const clean = (name || '').trim();
  if (!clean) return 'HG';
  return (
    clean
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'HG'
  );
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'w-6 h-6 text-[10px] rounded-md',
  sm: 'w-8 h-8 text-xs rounded-lg',
  md: 'w-10 h-10 text-xs rounded-lg',
  lg: 'w-14 h-14 text-base rounded-xl',
  xl: 'w-20 h-20 text-xl rounded-2xl',
};

export function UserAvatar({
  avatarUrl,
  name,
  size = 'md',
  className = '',
}: {
  avatarUrl?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(avatarUrl) && !imgError;

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-[#14181F] text-[#17C964] font-mono-tabular font-bold flex items-center justify-center border border-[#E2E8F0] select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getUserInitials(name)}</span>
      )}
    </div>
  );
}
