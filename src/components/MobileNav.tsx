import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  Award,
  Bell,
  Calendar,
  ChevronRight,
  FileText,
  Globe,
  HelpCircle,
  Home,
  Layout,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Store,
  Sun,
  X,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import VerifiedBadge from './VerifiedBadge';
import { avatarFor, levelFor } from '../lib/profile';
import { useKithNavData } from '../hooks/useKithNavData';
import { useKithTheme } from '../hooks/useKithTheme';
import { useLiveStatus } from '../contexts/LiveStatusContext';

const TONES = {
  feed: '#ff6b4a',
  circles: '#82e6c8',
  market: '#b69cff',
  messages: '#9ad8ff',
  more: '#ffb65c',
  notifications: '#ffcf7a',
  bounties: '#ffb65c',
  articles: '#f3a6c9',
  events: '#ff9d7a',
  settings: '#b69cff',
  help: '#82e6c8',
  admin: '#ff8f8f',
};

type TabProps = {
  to?: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  tone: string;
  badge?: number;
  onClick?: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  expanded?: boolean;
};

function Tab({
  to,
  icon: Icon,
  label,
  active,
  tone,
  badge,
  onClick,
  buttonRef,
  expanded,
}: TabProps) {
  const content = (
    <>
      <span
        className="relative grid h-8 w-8 place-items-center rounded-[11px] transition-all duration-300"
        style={
          active
            ? {
                background: `linear-gradient(140deg, ${tone}, ${tone}b3)`,
                color: '#1a1210',
                boxShadow: `0 10px 20px -12px ${tone}`,
              }
            : { color: 'var(--mn-muted)' }
        }
      >
        <Icon size={19} strokeWidth={active ? 2.3 : 2} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff6b4a] px-1 text-[8px] font-bold leading-none text-[#1a1210] ring-2 ring-[var(--mn-bg)]">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span
        className={`mt-0.5 text-[9.5px] leading-none tracking-[-0.01em] ${
          active ? 'font-bold' : 'font-semibold'
        }`}
        style={{ color: active ? 'var(--mn-text)' : 'var(--mn-muted)' }}
      >
        {label}
      </span>
    </>
  );

  const className =
    'group relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors';

  if (onClick) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={to || '/'}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {content}
    </Link>
  );
}

export default function MobileNav({ user }: { user: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { theme, toggleTheme } = useKithTheme(user);
  const { unreadNotifications, totalUnreadDMs, joinedCommunities, communityUnreads } =
    useKithNavData(user);

  const xp = Number(user?.xp) || 0;
  const level = levelFor(xp);
  const xpPercent = xp % 100;
  const myLiveEvent = useLiveStatus().myLiveEvent;
  const isAdmin = user && (user.role === 'admin' || user.email === 'danieludofa452@gmail.com');

  const view = searchParams.get('view');
  const isFeedHome = location.pathname === '/feed' && (!view || view === 'feed');
  const isCircles =
    location.pathname === '/feed' && (view === 'communities' || view === 'community');
  const isMessages = location.pathname === '/feed' && view === 'messages';
  const isMarket = location.pathname === '/marketplace' || location.pathname.startsWith('/products/');
  const isMoreSection = !isFeedHome && !isCircles && !isMessages && !isMarket;

  const closeMore = () => setMoreOpen(false);

  // A navigation inside the sheet should always put it away.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMore();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      moreButtonRef.current?.focus();
    };
  }, [moreOpen]);

  const handleLogout = async () => {
    closeMore();
    await signOut(auth);
    navigate('/');
  };

  const secondaryItems: Array<{
    to: string;
    icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
    label: string;
    hint: string;
    tone: string;
    badge?: number;
  }> = [
    ...(user
      ? [
          {
            to: '/feed?view=notifications',
            icon: Bell,
            label: 'Notifications',
            hint: 'What is new for you',
            tone: TONES.notifications,
            badge: unreadNotifications,
          },
          {
            to: '/dashboard',
            icon: Layout,
            label: 'Dashboard',
            hint: 'Your home base',
            tone: TONES.feed,
          },
        ]
      : []),
    {
      to: '/challenges',
      icon: Award,
      label: 'Bounties',
      hint: 'Open briefs',
      tone: TONES.bounties,
    },
    {
      to: '/articles',
      icon: FileText,
      label: 'Articles',
      hint: 'Ideas and craft',
      tone: TONES.articles,
    },
    {
      to: '/events',
      icon: Calendar,
      label: 'Events',
      hint: 'Meet in real time',
      tone: TONES.events,
    },
    ...(user
      ? [
          {
            to: '/settings',
            icon: Settings,
            label: 'Settings',
            hint: 'Profile and privacy',
            tone: TONES.settings,
          },
        ]
      : []),
    {
      to: '/help',
      icon: HelpCircle,
      label: 'Help',
      hint: 'We are around',
      tone: TONES.help,
    },
    ...(isAdmin
      ? [
          {
            to: '/admin',
            icon: Shield,
            label: 'Admin',
            hint: 'Keep things tidy',
            tone: TONES.admin,
          },
        ]
      : []),
  ];

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="mobile-nav md:hidden relative z-40 shrink-0 border-t border-[var(--mn-border)]"
      >
        <div className="grid grid-cols-5 items-center gap-0.5 px-2 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))]">
          <Tab to="/feed" icon={Home} label="Feed" active={isFeedHome} tone={TONES.feed} />
          <Tab
            to="/feed?view=communities"
            icon={Globe}
            label="Circles"
            active={isCircles}
            tone={TONES.circles}
          />
          <Tab
            to="/marketplace"
            icon={Store}
            label="Market"
            active={isMarket}
            tone={TONES.market}
          />
          <Tab
            to="/feed?view=messages"
            icon={MessageSquare}
            label="Messages"
            active={isMessages}
            tone={TONES.messages}
            badge={totalUnreadDMs}
          />
          <Tab
            icon={moreOpen ? X : Sparkles}
            label="More"
            active={moreOpen || isMoreSection}
            tone={TONES.more}
            badge={!isMoreSection ? unreadNotifications : 0}
            onClick={() => setMoreOpen((value) => !value)}
            buttonRef={moreButtonRef}
            expanded={moreOpen}
          />
        </div>
      </nav>

      {createPortal(
        <AnimatePresence>
          {moreOpen && (
            <>
              <motion.div
                key="mobile-more-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={closeMore}
                className="fixed inset-0 z-[120] bg-[#0e0b13]/45 backdrop-blur-sm md:hidden"
              />

              <motion.div
                key="mobile-more-sheet"
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="More from Kith"
                tabIndex={-1}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="mobile-nav fixed inset-x-0 bottom-0 z-[121] max-h-[88dvh] overflow-y-auto rounded-t-[30px] border-t border-[var(--mn-border)] bg-[var(--mn-bg)] text-[var(--mn-text)] shadow-[0_-30px_90px_-20px_rgba(14,11,19,0.8)] outline-none no-scrollbar md:hidden"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--mn-bg)]/95 px-5 pb-2 pt-2.5 backdrop-blur-md">
                  <span className="mx-auto absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--mn-muted)]/30" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--mn-muted)]">
                    More from Kith
                  </span>
                  <button
                    type="button"
                    onClick={closeMore}
                    aria-label="Close menu"
                    className="grid h-8 w-8 place-items-center rounded-full text-[var(--mn-muted)] transition-colors hover:bg-[var(--mn-chip)] hover:text-[var(--mn-text)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="px-4 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  {user ? (
                    <div className="relative overflow-hidden rounded-[24px] bg-[#211a28] px-4 pb-4 pt-4 text-[#f7f2e8]">
                      <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.34),transparent_68%)] blur-2xl" />
                      <div className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.24),transparent_70%)] blur-2xl" />

                      <div className="relative flex items-center gap-3">
                        <span className="relative shrink-0">
                          <img
                            src={avatarFor(user)}
                            alt=""
                            referrerPolicy="no-referrer"
                            className={`h-12 w-12 rounded-full bg-[#2a2234] object-cover ring-2 ${myLiveEvent ? 'ring-red-500' : 'ring-[#f7f2e8]/15'}`}
                          />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#211a28] ${myLiveEvent ? 'animate-pulse bg-red-500' : 'bg-[#82e6c8]'}`} />
                          {myLiveEvent && (
                            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-[1px] text-[7px] font-black uppercase tracking-[0.12em] text-white">
                              Live
                            </span>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="truncate font-display text-[17px] font-semibold tracking-[-0.035em] text-[#f7f2e8]">
                              {user?.displayName || 'Creator'}
                            </p>
                            <VerifiedBadge
                              verified={user?.verified}
                              size={13}
                              className="shrink-0 text-[#ffb65c]"
                            />
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-[#f7f2e8]/45">
                            {user?.email}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#ffb65c]/12 px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em] text-[#ffb65c]">
                              <Sparkles size={8} />
                              Level {level}
                            </span>
                            <span className="text-[9px] font-semibold text-[#f7f2e8]/45">
                              {xp.toLocaleString()} XP
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-[#f7f2e8]/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#ffb65c] to-[#ff6b4a]"
                          style={{ width: `${xpPercent}%` }}
                        />
                      </div>

                      <Link
                        to={`/creators/${user?.uid}`}
                        onClick={closeMore}
                        className="relative mt-3 flex items-center justify-between rounded-2xl bg-[#f7f2e8] px-3.5 py-2.5 text-[#211a28] transition-transform active:scale-[0.99]"
                      >
                        <span className="text-[12px] font-semibold">View your portfolio</span>
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#211a28] text-[#f7f2e8]">
                          <ArrowUpRight size={13} />
                        </span>
                      </Link>

                      {myLiveEvent && (
                        <Link
                          to={`/live/${myLiveEvent.id}`}
                          onClick={closeMore}
                          className="relative mt-2 flex items-center justify-between rounded-2xl bg-[#ff6b4a] px-3.5 py-2.5 text-[#1a1210]"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-[#1a1210]" />
                            <span className="truncate">You're live now</span>
                          </span>
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1210]/10">
                            <ArrowUpRight size={13} />
                          </span>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <Link
                      to="/login"
                      onClick={closeMore}
                      className="relative block overflow-hidden rounded-[24px] bg-[#211a28] px-4 py-4 text-[#f7f2e8]"
                    >
                      <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.34),transparent_68%)] blur-2xl" />
                      <p className="relative font-display text-[20px] font-semibold tracking-[-0.04em]">
                        Your people are here.
                      </p>
                      <p className="relative mt-1 max-w-[26ch] text-[11px] leading-relaxed text-[#f7f2e8]/55">
                        Sign in to follow circles, keep up with messages, and share your work.
                      </p>
                      <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#ff6b4a] px-3 py-1.5 text-[11px] font-bold text-[#1a1210]">
                        <LogIn size={13} />
                        Sign in to Kith
                      </span>
                    </Link>
                  )}

                  {user && joinedCommunities.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between px-1 pb-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--mn-muted)]">
                          Your circles
                        </p>
                        <Link
                          to="/feed?view=communities"
                          onClick={closeMore}
                          className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-[#ff6b4a]"
                        >
                          See all
                          <ChevronRight size={11} />
                        </Link>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {joinedCommunities.map((community) => {
                          const unread = communityUnreads[community.id] || 0;
                          return (
                            <Link
                              key={community.id}
                              to={`/feed?view=community&id=${community.id}`}
                              onClick={closeMore}
                              className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-chip)] px-2 py-2.5 text-center transition-colors hover:bg-[var(--mn-chip-hover)]"
                            >
                              <span className="relative">
                                <img
                                  src={
                                    community.image && String(community.image).trim() !== ''
                                      ? community.image
                                      : `https://picsum.photos/seed/${community.id}/100/100`
                                  }
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="h-9 w-9 rounded-[11px] object-cover"
                                />
                                {unread > 0 && (
                                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff6b4a] px-1 text-[8px] font-bold leading-none text-[#1a1210] ring-2 ring-[var(--mn-bg)]">
                                    {unread > 9 ? '9+' : unread}
                                  </span>
                                )}
                              </span>
                              <span className="w-full truncate text-[9.5px] font-semibold text-[var(--mn-text)]">
                                {community.name}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {secondaryItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={closeMore}
                        className="group relative flex items-center gap-2.5 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-chip)] px-2.5 py-2.5 transition-colors hover:bg-[var(--mn-chip-hover)]"
                      >
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]"
                          style={{ backgroundColor: `${item.tone}1f`, color: item.tone }}
                        >
                          <item.icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-semibold text-[var(--mn-text)]">
                            {item.label}
                          </span>
                          <span className="block truncate text-[9px] text-[var(--mn-muted)]">
                            {item.hint}
                          </span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[#ff6b4a] px-1 text-[8px] font-bold leading-none text-[#1a1210]">
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-chip)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--mn-chip-hover)]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--mn-chip-hover)] text-[#ffb65c]">
                        {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                      </span>
                      <span>
                        <span className="block text-[11.5px] font-semibold text-[var(--mn-text)]">
                          Appearance
                        </span>
                        <span className="block text-[9px] text-[var(--mn-muted)]">
                          {theme === 'dark' ? 'Warm and low-lit' : 'Bright and airy'}
                        </span>
                      </span>
                    </span>
                    <span className="rounded-full border border-[var(--mn-border)] px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-[var(--mn-muted)]">
                      {theme}
                    </span>
                  </button>

                  {user ? (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[#c9452a]/30 px-3.5 py-2.5 text-[#c9452a] transition-colors hover:bg-[#c9452a] hover:text-[#f7f2e8]"
                    >
                      <span className="text-[11.5px] font-semibold">Sign out</span>
                      <LogOut size={15} />
                    </button>
                  ) : (
                    <Link
                      to="/login"
                      onClick={closeMore}
                      className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[#ff6b4a]/30 px-3.5 py-2.5 text-[#ff6b4a] transition-colors hover:bg-[#ff6b4a] hover:text-[#1a1210]"
                    >
                      <span className="text-[11.5px] font-semibold">Sign in to Kith</span>
                      <LogIn size={15} />
                    </Link>
                  )}

                  <p className="mt-3 text-center text-[8.5px] font-bold uppercase tracking-[0.2em] text-[var(--mn-muted)]/60">
                    Kith · make room for your people
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
