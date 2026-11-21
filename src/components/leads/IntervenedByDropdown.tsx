import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Lock, Search, Unlock } from 'lucide-react';
import type {
  LeadColleagueOption,
  LeadInterventionScope,
} from '../../shared/types.ts';

const AVATAR_TONES = [
  'bg-[#FEF3C7] text-[#B45309]',
  'bg-[#EDE9FE] text-[#6D28D9]',
  'bg-[#DBEAFE] text-[#1D4ED8]',
  'bg-[#FCE7F3] text-[#BE185D]',
  'bg-[#DCFCE7] text-[#15803D]',
  'bg-[#FFEDD5] text-[#C2410C]',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getToneClass(id: number): string {
  return AVATAR_TONES[Math.abs(id) % AVATAR_TONES.length];
}

export function IntervenedByDropdown({
  scope,
  targetUserId,
  myLeadCount,
  currentCount,
  colleagues,
  onSelectScope,
  onRequestUnlock,
  onLockColleague,
}: {
  scope: LeadInterventionScope;
  targetUserId: number | null;
  myLeadCount: number;
  currentCount: number;
  colleagues: LeadColleagueOption[];
  onSelectScope: (nextScope: LeadInterventionScope, nextUserId: number | null) => void;
  onRequestUnlock: (colleague: LeadColleagueOption) => void;
  onLockColleague: (colleague: LeadColleagueOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 20);
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unlockedOthersCount = useMemo(
    () =>
      colleagues
        .filter((c) => c.unlocked)
        .reduce((sum, c) => sum + c.leadCount, 0),
    [colleagues]
  );

  const anyCount = myLeadCount + unlockedOthersCount;

  const activeColleague = useMemo(
    () =>
      scope === 'user' && targetUserId
        ? colleagues.find((c) => c.id === targetUserId) ?? null
        : null,
    [scope, targetUserId, colleagues]
  );

  const activeLabel =
    scope === 'me'
      ? 'Me'
      : scope === 'any'
        ? 'Any'
        : scope === 'other'
          ? 'Other'
          : activeColleague?.displayName || 'Colleague';

  const filteredColleagues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return colleagues;
    return colleagues.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q)
    );
  }, [colleagues, query]);

  const showMeOption = !query.trim() || 'intervened by me'.includes(query.trim().toLowerCase());
  const showAnyOption = !query.trim() || 'intervened by any'.includes(query.trim().toLowerCase());
  const showOtherOption = !query.trim() || 'intervened by other'.includes(query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
          scope !== 'me'
            ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
            : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#0F172A] hover:bg-white hover:border-[#94A3B8]'
        }`}
      >
        <span>
          Intervened By {activeLabel} ({currentCount})
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-40 overflow-hidden">
          <div className="p-2.5 border-b border-[#F1F5F9]">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="w-full pl-3 pr-8 py-2 text-xs bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:bg-white focus:border-[#17C964]"
              />
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            {showMeOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectScope('me', null);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 flex items-center justify-between gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                  scope === 'me'
                    ? 'bg-[#F1F5F9] font-semibold text-[#0F172A]'
                    : 'text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-[#FEF2F2] text-[#DC2626] text-[11px] font-bold flex items-center justify-center shrink-0">
                    ME
                  </span>
                  <span className="truncate">Intervened By Me</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-tabular text-[11px] text-[#64748B]">
                    {myLeadCount}
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#17C964]" />
                </span>
              </button>
            )}

            {showAnyOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectScope('any', null);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 flex items-center justify-between gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                  scope === 'any'
                    ? 'bg-[#F1F5F9] font-semibold text-[#0F172A]'
                    : 'text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-[#FEF2F2] text-[#DC2626] text-[11px] font-bold flex items-center justify-center shrink-0">
                    AY
                  </span>
                  <span className="truncate">Intervened By Any</span>
                </span>
                <span className="font-mono-tabular text-[11px] text-[#64748B] shrink-0">
                  {anyCount}
                </span>
              </button>
            )}

            {showOtherOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectScope('other', null);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 flex items-center justify-between gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                  scope === 'other'
                    ? 'bg-[#F1F5F9] font-semibold text-[#0F172A]'
                    : 'text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-[#FEF2F2] text-[#DC2626] text-[11px] font-bold flex items-center justify-center shrink-0">
                    OT
                  </span>
                  <span className="truncate">Intervened By Other</span>
                </span>
                <span className="font-mono-tabular text-[11px] text-[#64748B] shrink-0">
                  {unlockedOthersCount}
                </span>
              </button>
            )}

            {filteredColleagues.length > 0 && (
              <div className="my-1 border-t border-[#F1F5F9]" />
            )}

            {filteredColleagues.map((colleague) => {
              const isSelected = scope === 'user' && targetUserId === colleague.id;
              return (
                <div
                  key={colleague.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-[#ECFDF5] font-semibold text-[#065F46]'
                      : 'text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (colleague.unlocked) {
                        onSelectScope('user', colleague.id);
                      } else {
                        onRequestUnlock(colleague);
                      }
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <span
                      className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${getToneClass(
                        colleague.id
                      )}`}
                    >
                      {getInitials(colleague.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        Intervened By {colleague.displayName}
                      </span>
                      <span className="block text-[10px] text-[#64748B] font-normal">
                        {colleague.unlocked
                          ? 'Unlocked in this session'
                          : colleague.hasSecurityCode
                            ? 'Security code required'
                            : 'No security code set yet'}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-tabular text-[11px] text-[#64748B]">
                      {colleague.leadCount}
                    </span>
                    {colleague.unlocked ? (
                      <button
                        type="button"
                        title="Unlocked — click to lock colleague access"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLockColleague(colleague);
                        }}
                        className="p-1 rounded hover:bg-[#D1FAE5] cursor-pointer flex items-center justify-center"
                        aria-label={`Lock ${colleague.displayName}'s leads`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#17C964] block" />
                      </button>
                    ) : colleague.hasSecurityCode ? (
                      <Lock className="w-3.5 h-3.5 text-[#64748B]" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-[#94A3B8]" />
                    )}
                  </div>
                </div>
              );
            })}

            {filteredColleagues.length === 0 && query.trim() && (
              <div className="px-3 py-4 text-center text-xs text-[#64748B]">
                No team member matching &ldquo;{query.trim()}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
