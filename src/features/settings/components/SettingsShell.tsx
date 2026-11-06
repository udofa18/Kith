import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, LogOut, Menu, Search, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { SaveIndicator } from './controls';
import { getSection, SECTION_GROUPS, type SectionId } from '../navigation';
import type { SaveState } from '../useSettings';

const avatarFallback = (seed?: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'kith')}`;

function NavList({
  current,
  onNavigate,
  query,
}: {
  current: SectionId;
  onNavigate: (id: SectionId) => void;
  query: string;
}) {
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SECTION_GROUPS;

    const matches = SECTION_GROUPS.flatMap((group) => group.sections).filter((section) => {
      const haystack = [section.label, section.description, ...section.keywords].join(' ').toLowerCase();
      return haystack.includes(term);
    });

    return matches.length ? [{ label: `${matches.length} result${matches.length === 1 ? '' : 's'}`, sections: matches }] : [];
  }, [query]);

  if (groups.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
        No setting matches “{query.trim()}”.
      </p>
    );
  }

  return (
    <nav className="space-y-5" aria-label="Settings sections">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-faint">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.sections.map((section) => {
              const Icon = section.icon;
              const active = current === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onNavigate(section.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-150',
                    active
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{section.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ProfileCard({ profile }: { profile: Record<string, any> | null }) {
  const avatar = profile?.profileImage?.trim() ? profile.profileImage : avatarFallback(profile?.uid);
  const hidden = profile?.settings?.profile?.visibility === 'hidden';

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border-strong bg-muted">
        <img src={avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {profile?.displayName || 'Your account'}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          @{profile?.username || 'username'}
          {hidden && ' · Hidden'}
        </p>
      </div>
      <ChevronRight size={15} className="shrink-0 text-faint" />
    </div>
  );
}

export default function SettingsShell({
  current,
  onNavigate,
  profile,
  saveState,
  onSignOut,
  children,
}: {
  current: SectionId;
  onNavigate: (id: SectionId) => void;
  profile: Record<string, any> | null;
  saveState: SaveState;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const section = getSection(current);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const navigate = (id: SectionId) => {
    onNavigate(id);
    setDrawerOpen(false);
    setQuery('');
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1180px]">
        {/* Desktop rail */}
        <aside className="hidden w-[258px] shrink-0 lg:block">
          <div className="sticky top-0 flex h-[100dvh] flex-col gap-4 border-r border-border px-4 py-6">
            <div>
              <p className="px-1 text-[9px] font-bold uppercase tracking-[0.2em] text-faint">Kith</p>
              <h1 className="mt-0.5 px-1 font-display text-xl font-semibold tracking-[-0.035em] text-foreground">
                Settings
              </h1>
            </div>

            <ProfileCard profile={profile} />

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a setting"
                aria-label="Find a setting"
                className="h-9 w-full rounded-control border border-border bg-surface pl-9 pr-8 text-xs text-foreground outline-none transition-colors placeholder:text-faint hover:border-border-strong focus:border-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-faint hover:bg-muted hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-2 custom-scrollbar">
              <NavList current={current} onNavigate={navigate} query={query} />
            </div>

            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={onSignOut}
                className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-8">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open settings navigation"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-control border border-border bg-surface text-foreground lg:hidden"
              >
                <Menu size={17} />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">Settings</p>
                <h2 className="truncate font-display text-base font-semibold leading-tight tracking-[-0.03em] text-foreground">
                  {section.label}
                </h2>
              </div>

              <SaveIndicator state={saveState} />
            </div>
          </header>

          <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:pt-7">
            <div className="mb-6">
              <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-3xl">
                {section.label}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {section.description}
              </p>
            </div>
            {children}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-[#0e0b13]/55 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              role="dialog"
              aria-modal="true"
              aria-label="Settings navigation"
              className="relative flex h-full w-[300px] max-w-[86vw] flex-col gap-4 border-r border-border bg-background px-4 pb-6 pt-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-faint">Kith</p>
                  <h1 className="font-display text-xl font-semibold tracking-[-0.035em]">Settings</h1>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close settings navigation"
                  className="grid h-9 w-9 place-items-center rounded-control border border-border bg-surface"
                >
                  <X size={17} />
                </button>
              </div>

              <ProfileCard profile={profile} />

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a setting"
                  aria-label="Find a setting"
                  className="h-9 w-full rounded-control border border-border bg-surface pl-9 pr-8 text-xs outline-none placeholder:text-faint focus:border-primary"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <NavList current={current} onNavigate={navigate} query={query} />
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="flex w-full items-center gap-3 rounded-control border-t border-border px-3 py-3 text-[13px] font-semibold text-destructive"
              >
                <LogOut size={16} /> Sign out
              </button>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
