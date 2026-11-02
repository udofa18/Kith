import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Award,
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  HelpCircle,
  Home,
  Layout,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import KithLogo from './KithLogo';
import { motion, AnimatePresence } from 'motion/react';
import VerifiedBadge from './VerifiedBadge';
import { avatarFor, levelFor } from '../lib/profile';
import { useKithNavData } from '../hooks/useKithNavData';
import { useKithTheme, type Theme } from '../hooks/useKithTheme';

const TONES = {
  feed: '#ff6b4a',
  communities: '#82e6c8',
  marketplace: '#b69cff',
  bounties: '#ffb65c',
  articles: '#f3a6c9',
  events: '#ff9d7a',
  notifications: '#ffcf7a',
  messages: '#9ad8ff',
  admin: '#ff8f8f',
  neutral: '#ffb65c',
};

/* -------------------------------------------------------------------------- */

function XpRing({
  percent,
  size = 44,
  stroke = 2.5,
  track = 'var(--sb-ring-track, rgba(247,242,232,0.14))',
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  track?: string;
  children: ReactNode;
}) {
  const gradientId = useId();
  const radius = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * Math.min(Math.max(percent, 0), 100)) / 100;

  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ffb65c" />
            <stop offset="1" stopColor="#ff6b4a" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function ProfilePopup({
  open,
  user,
  anchorRef,
  communityCount,
  theme,
  onToggleTheme,
  onClose,
  onLogout,
}: {
  open: boolean;
  user: any;
  anchorRef: RefObject<HTMLButtonElement | null>;
  communityCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 640,
  );

  const xp = Number(user?.xp) || 0;
  const level = levelFor(xp);
  const xpPercent = xp % 100;
  const xpToNext = 100 - xpPercent;

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      if (window.innerWidth < 640) {
        setPosition(null);
        return;
      }
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const width = 356;
      const height = panelRef.current?.offsetHeight || 620;
      const left = Math.max(12, Math.min(anchor.right + 12, window.innerWidth - width - 12));
      const top = Math.max(12, Math.min(anchor.top - 8, window.innerHeight - height - 12));
      setPosition({ left, top });
    };

    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      anchorRef.current?.focus();
    };
  }, [open, anchorRef]);

  const menuItems = [
    {
      to: '/dashboard',
      icon: Layout,
      label: 'Dashboard',
      hint: 'Your home base',
    },
    {
      to: '/settings',
      icon: Settings,
      label: 'Account settings',
      hint: 'Profile, privacy, notifications',
    },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="profile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className={`fixed inset-0 z-[120] ${
              isNarrow ? 'bg-[#0e0b13]/45 backdrop-blur-sm' : 'bg-[#0e0b13]/15'
            }`}
          />

          <motion.div
            key="profile-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Your account menu"
            tabIndex={-1}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed z-[121] w-[min(356px,calc(100vw-28px))] overflow-y-auto overflow-x-hidden rounded-[28px] border border-[#211a28]/10 bg-[#f7f2e8] text-[#211a28] shadow-[0_44px_120px_-32px_rgba(14,11,19,0.85)] outline-none no-scrollbar max-h-[calc(100dvh-28px)] sm:max-h-[660px] ${
              isNarrow ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : ''
            }`}
            style={
              isNarrow
                ? undefined
                : {
                    left: position?.left ?? 96,
                    top: position?.top ?? 16,
                    visibility: position ? 'visible' : 'hidden',
                  }
            }
          >
            {/* Warm header */}
            <div className="relative overflow-hidden bg-[#211a28] px-5 pb-5 pt-5 text-[#f7f2e8]">
              <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.34),transparent_68%)] blur-2xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.24),transparent_70%)] blur-2xl" />

              <button
                type="button"
                onClick={onClose}
                aria-label="Close account menu"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-[#f7f2e8]/55 transition-colors hover:bg-[#f7f2e8]/10 hover:text-[#f7f2e8]"
              >
                <X size={15} />
              </button>

              <div className="relative flex items-start gap-3.5">
                <XpRing percent={xpPercent} size={62} stroke={3} track="rgba(247,242,232,0.16)">
                  <img
                    src={avatarFor(user)}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-[46px] w-[46px] rounded-full bg-[#2a2234] object-cover ring-2 ring-[#211a28]"
                  />
                  <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-[#211a28] bg-[#82e6c8]" />
                </XpRing>

                <div className="min-w-0 flex-1 pr-5 pt-0.5">
                  <div className="flex items-center gap-0.5">
                    <p className="truncate font-display text-[17px] font-semibold leading-tight tracking-[-0.035em] text-[#f7f2e8]">
                      {user?.displayName || 'Creator'}
                    </p>
                    <VerifiedBadge
                      verified={user?.verified}
                      size={13}
                      className="shrink-0 text-[#ffb65c]"
                    />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#f7f2e8]/45">{user?.email}</p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#ffb65c]/30 bg-[#ffb65c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffb65c]">
                    <Sparkles size={9} />
                    Level {level}
                  </span>
                </div>
              </div>

              <div className="relative mt-4">
                <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-[#f7f2e8]/40">
                  <span>{xp.toLocaleString()} XP</span>
                  <span>
                    {xpToNext} XP to level {level + 1}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f7f2e8]/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ffb65c] to-[#ff6b4a]"
                    style={{ width: `${xpPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-[#211a28]/[0.045] px-2 py-2.5 text-center">
                  <p className="font-display text-[17px] font-semibold leading-none tracking-[-0.04em] text-[#211a28]">
                    {communityCount}
                  </p>
                  <p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.15em] text-[#211a28]/40">
                    Circles
                  </p>
                </div>
                <div className="rounded-2xl bg-[#211a28]/[0.045] px-2 py-2.5 text-center">
                  <p className="font-display text-[17px] font-semibold leading-none tracking-[-0.04em] text-[#211a28]">
                    {level}
                  </p>
                  <p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.15em] text-[#211a28]/40">
                    Level
                  </p>
                </div>
                <div className="rounded-2xl bg-[#211a28]/[0.045] px-2 py-2.5 text-center">
                  <p className="font-display text-[17px] font-semibold leading-none tracking-[-0.04em] text-[#211a28]">
                    {xp.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.15em] text-[#211a28]/40">
                    Total XP
                  </p>
                </div>
              </div>

              <Link
                to={`/creators/${user?.uid}`}
                onClick={onClose}
                className="group mt-2 flex items-center justify-between rounded-2xl bg-[#211a28] px-4 py-3 text-[#f7f2e8] transition-all hover:bg-[#2c2233]"
              >
                <span className="text-[12.5px] font-semibold">View your portfolio</span>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f7f2e8]/10 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRight size={14} />
                </span>
              </Link>

              <div className="mt-2 space-y-0.5">
                {menuItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-[#211a28]/[0.055]"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#211a28]/[0.05] text-[#211a28]/55 transition-colors group-hover:bg-[#ff6b4a] group-hover:text-[#f7f2e8]">
                      <item.icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[#211a28]">
                        {item.label}
                      </span>
                      <span className="block truncate text-[10px] text-[#211a28]/45">
                        {item.hint}
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-[#211a28]/25 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                ))}
              </div>

              <div className="my-2 h-px bg-[#211a28]/8" />

              <button
                type="button"
                onClick={onToggleTheme}
                className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[#211a28]/[0.055]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#211a28]/[0.05] text-[#211a28]/55 transition-colors group-hover:bg-[#ffb65c] group-hover:text-[#211a28]">
                  {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-[#211a28]">
                    Appearance
                  </span>
                  <span className="block text-[10px] text-[#211a28]/45">
                    {theme === 'dark' ? 'Warm and low-lit' : 'Bright and airy'}
                  </span>
                </span>
                <span className="rounded-full border border-[#211a28]/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#211a28]/45">
                  {theme}
                </span>
              </button>

              <Link
                to="/help"
                onClick={onClose}
                className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-[#211a28]/[0.055]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#211a28]/[0.05] text-[#211a28]/55 transition-colors group-hover:bg-[#b69cff] group-hover:text-[#211a28]">
                  <HelpCircle size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-[#211a28]">
                    Help & support
                  </span>
                  <span className="block text-[10px] text-[#211a28]/45">
                    Need a hand? We are around.
                  </span>
                </span>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-[#211a28]/25 transition-transform group-hover:translate-x-0.5"
                />
              </Link>

              <button
                type="button"
                onClick={onLogout}
                className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[#c9452a]/25 px-4 py-2.5 text-[#b23a24] transition-colors hover:bg-[#c9452a] hover:text-[#f7f2e8]"
              >
                <span className="text-[12.5px] font-semibold">Sign out</span>
                <LogOut size={15} />
              </button>

              <p className="mt-3 text-center text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#211a28]/30">
                Kith · make room for your people
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */

export default function AppSidebar({ user }: { user: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(false);

  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const { theme, toggleTheme } = useKithTheme(user);
  const { unreadNotifications, totalUnreadDMs, joinedCommunities, communityUnreads } =
    useKithNavData(user);

  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // Close the popup whenever the route changes.
  useEffect(() => {
    setShowProfilePopup(false);
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    setShowProfilePopup(false);
    await signOut(auth);
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;
  const isFeedView = (view?: string) => {
    if (location.pathname !== '/feed') return false;
    if (!view) return !searchParams.has('view');
    return searchParams.get('view') === view;
  };

  const xp = Number(user?.xp) || 0;
  const level = levelFor(xp);
  const xpPercent = xp % 100;

  const NavItem = ({
    to,
    icon: Icon,
    label,
    active,
    badge,
    tone = TONES.neutral,
  }: {
    to: string;
    icon: any;
    label: string;
    active: boolean;
    badge?: number;
    tone?: string;
  }) => (
    <Link
      to={to}
      title={isExpanded ? undefined : label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-2xl p-1.5 transition-colors ${
        isExpanded ? '' : 'justify-center'
      } ${active ? 'bg-[var(--sb-active-row)]' : 'hover:bg-[var(--sb-row-hover)]'}`}
    >
      <span
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-[13px] transition-all duration-300 ${
          active ? '' : 'bg-[var(--sb-chip)] group-hover:bg-[var(--sb-chip-hover)]'
        }`}
        style={
          active
            ? {
                background: `linear-gradient(140deg, ${tone}, ${tone}b3)`,
                color: '#1a1210',
                boxShadow: `0 10px 22px -12px ${tone}`,
              }
            : { color: tone }
        }
      >
        <Icon size={18} strokeWidth={2.1} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#ff6b4a] px-1 text-[9px] font-bold leading-none text-[#1a1210] ring-2 ring-[var(--sb-bg)]">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18 }}
            className={`flex-1 truncate text-[13px] tracking-[-0.01em] ${
              active
                ? 'font-semibold text-[var(--sb-text)]'
                : 'font-medium text-[var(--sb-muted)] group-hover:text-[var(--sb-text)]'
            }`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      {isExpanded && active && (
        <span className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6b4a]" />
      )}
    </Link>
  );

  return (
    <aside
      className="app-sidebar relative z-50 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[var(--sb-border)] transition-[width] duration-300 ease-in-out md:flex"
      style={{ width: isExpanded ? 264 : 80 }}
    >
      {/* Warm atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.16),transparent_70%)] blur-2xl" />
        <div className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.14),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative flex h-full min-h-0 flex-col">
        {/* Header / Logo */}
        <div
          className={`shrink-0 p-3 ${
            isExpanded ? 'flex items-center justify-between gap-2' : 'flex flex-col items-center gap-2'
          }`}
        >
          <Link
            to="/"
            className="group flex min-w-0 items-center gap-2.5 rounded-2xl p-1 transition-colors hover:bg-[var(--sb-row-hover)]"
            aria-label="Kith home"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-[#f7f2e8]">
              <KithLogo size={32} />
            </span>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-1.5 whitespace-nowrap font-display text-[21px] font-semibold tracking-[-0.06em] text-[var(--sb-text)]"
                >
                  kith
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" />
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[var(--sb-faint)] transition-colors hover:bg-[var(--sb-chip)] hover:text-[var(--sb-text)]"
          >
            {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* User card / XP */}
        <div className="relative shrink-0 px-3 pb-2 pt-1">
          {user ? (
            <>
              <button
                ref={profileButtonRef}
                type="button"
                onClick={() => setShowProfilePopup((value) => !value)}
                aria-haspopup="dialog"
                aria-expanded={showProfilePopup}
                aria-label={showProfilePopup ? 'Close your account menu' : 'Open your account menu'}
                className={`group relative flex w-full items-center gap-2.5 rounded-[20px] border border-[var(--sb-border)] bg-[var(--sb-chip)] p-2 text-left transition-all hover:border-[#ff6b4a]/25 hover:bg-[var(--sb-chip-hover)] ${
                  isExpanded ? 'justify-start' : 'justify-center'
                }`}
              >
                <span className="relative">
                  <XpRing percent={xpPercent} size={44} stroke={2.5}>
                    <img
                      src={avatarFor(user)}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-[31px] w-[31px] rounded-full bg-[#2a2234] object-cover"
                    />
                  </XpRing>
                  <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--sb-bg)] bg-[#82e6c8]" />
                </span>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18 }}
                      className="min-w-0 flex-1"
                    >
                      <span className="flex items-center gap-0.5">
                        <span className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--sb-text)]">
                          {user?.displayName || 'Creator'}
                        </span>
                        <VerifiedBadge
                          verified={user?.verified}
                          size={12}
                          className="ml-0 shrink-0 text-[#ffb65c]"
                        />
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--sb-muted)]">
                        <Sparkles size={9} className="shrink-0 text-[#ffb65c]" />
                        <span className="truncate">
                          Level {level} · {xp.toLocaleString()} XP
                        </span>
                      </span>
                    </motion.span>
                  )}
                </AnimatePresence>

                {isExpanded && (
                  <ChevronDown
                    size={15}
                    className={`shrink-0 text-[var(--sb-faint)] transition-transform duration-200 ${
                      showProfilePopup ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              <ProfilePopup
                open={showProfilePopup}
                user={user}
                anchorRef={profileButtonRef}
                communityCount={joinedCommunities.length}
                theme={theme}
                onToggleTheme={toggleTheme}
                onClose={() => setShowProfilePopup(false)}
                onLogout={handleLogout}
              />
            </>
          ) : (
            <Link
              to="/login"
              title={isExpanded ? undefined : 'Sign in to Kith'}
              aria-label="Sign in to Kith"
              className={`flex items-center gap-2.5 rounded-2xl bg-[#ff6b4a] p-2 font-semibold text-[#1a1210] shadow-[0_10px_24px_-12px_rgba(255,107,74,0.9)] transition-transform hover:-translate-y-0.5 ${
                isExpanded ? 'w-full' : 'mx-auto w-fit justify-center'
              }`}
            >
              <LogOut size={18} className="shrink-0 rotate-180" />
              {isExpanded && <span className="text-[12.5px]">Sign in to Kith</span>}
            </Link>
          )}
        </div>

        {/* Navigation */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {isExpanded && (
            <p className="px-3 pb-1.5 pt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--sb-muted)]">
              Explore
            </p>
          )}

          <nav className="flex flex-col gap-1" aria-label="Main navigation">
            <NavItem
              to="/feed"
              icon={Home}
              label="Your feed"
              active={isFeedView()}
              tone={TONES.feed}
            />
            <NavItem
              to="/feed?view=communities"
              icon={Globe}
              label="Communities"
              active={isFeedView('communities')}
              tone={TONES.communities}
            />
            <NavItem
              to="/marketplace"
              icon={Store}
              label="Marketplace"
              active={isActive('/marketplace')}
              tone={TONES.marketplace}
            />
            <NavItem
              to="/challenges"
              icon={Award}
              label="Bounties"
              active={isActive('/challenges')}
              tone={TONES.bounties}
            />
            <NavItem
              to="/articles"
              icon={FileText}
              label="Articles"
              active={isActive('/articles')}
              tone={TONES.articles}
            />
            <NavItem
              to="/events"
              icon={Calendar}
              label="Events"
              active={isActive('/events')}
              tone={TONES.events}
            />
          </nav>

          {user && (
            <>
              <div className="mx-2 my-2 h-px bg-[var(--sb-divider)]" />

              {isExpanded && (
                <p className="px-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--sb-muted)]">
                  Yours
                </p>
              )}

              <nav className="flex flex-col gap-1" aria-label="Your activity">
                <NavItem
                  to="/feed?view=notifications"
                  icon={Bell}
                  label="Notifications"
                  active={isFeedView('notifications')}
                  badge={unreadNotifications}
                  tone={TONES.notifications}
                />
                <NavItem
                  to="/feed?view=messages"
                  icon={MessageSquare}
                  label="Messages"
                  active={isFeedView('messages')}
                  badge={totalUnreadDMs}
                  tone={TONES.messages}
                />
                {(user.role === 'admin' || user.email === 'danieludofa452@gmail.com') && (
                  <NavItem
                    to="/admin"
                    icon={Shield}
                    label="Admin panel"
                    active={isActive('/admin')}
                    tone={TONES.admin}
                  />
                )}
              </nav>

              {joinedCommunities.length > 0 && (
                <>
                  <div className="mx-2 my-2 h-px bg-[var(--sb-divider)]" />

                  {isExpanded && (
                    <div className="flex items-center justify-between px-3 pb-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--sb-muted)]">
                        Your circles
                      </p>
                      <span className="text-[9px] font-bold text-[var(--sb-faint)]">
                        {joinedCommunities.length}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    {joinedCommunities.map((community) => {
                      const unreadCount = communityUnreads[community.id] || 0;
                      const selected =
                        searchParams.get('view') === 'community' &&
                        searchParams.get('id') === community.id;

                      return (
                        <Link
                          key={community.id}
                          to={`/feed?view=community&id=${community.id}`}
                          title={isExpanded ? undefined : community.name}
                          aria-label={community.name}
                          className={`group relative flex items-center gap-2.5 rounded-2xl p-1.5 transition-colors ${
                            isExpanded ? '' : 'justify-center'
                          } ${
                            selected
                              ? 'bg-[var(--sb-active-row)]'
                              : 'hover:bg-[var(--sb-row-hover)]'
                          }`}
                        >
                          <span
                            className={`relative block shrink-0 overflow-hidden rounded-[12px] border transition-all ${
                              isExpanded ? 'h-9 w-9' : 'h-10 w-10'
                            } ${
                              selected
                                ? 'border-[#ff6b4a]/60 shadow-[0_0_0_3px_rgba(255,107,74,0.12)]'
                                : 'border-[var(--sb-border)]'
                            }`}
                          >
                            <img
                              src={
                                community.image && String(community.image).trim() !== ''
                                  ? community.image
                                  : `https://picsum.photos/seed/${community.id}/100/100`
                              }
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            {!isExpanded && unreadCount > 0 && (
                              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff6b4a] px-1 text-[8px] font-bold leading-none text-[#1a1210] ring-2 ring-[var(--sb-bg)]">
                                {unreadCount > 9 ? '9+' : unreadCount}
                              </span>
                            )}
                          </span>

                          {isExpanded && (
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--sb-muted)] transition-colors group-hover:text-[var(--sb-text)]">
                              {community.name}
                            </span>
                          )}

                          {isExpanded && unreadCount > 0 && (
                            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#ff6b4a] px-1 text-[9px] font-bold leading-none text-[#1a1210]">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {user && isExpanded && joinedCommunities.length === 0 && (
            <div className="mt-3 rounded-2xl border border-dashed border-[var(--sb-border)] px-3 py-3">
              <div className="flex items-center gap-2 text-[var(--sb-muted)]">
                <Users size={14} className="text-[#82e6c8]" />
                <span className="text-[11px] font-semibold">Find your people</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--sb-muted)]">
                Join a circle and it will live here.
              </p>
              <Link
                to="/feed?view=communities"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#ffb65c] hover:text-[#ff6b4a]"
              >
                Browse communities
                <ChevronRight size={11} />
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--sb-divider)] p-3">
          {isExpanded ? (
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--sb-border)] bg-[var(--sb-chip)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sb-chip-hover)]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--sb-chip-hover)] text-[#ffb65c]">
                  {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                </span>
                <span className="truncate text-[11px] font-semibold text-[var(--sb-text)]">
                  Appearance
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-[var(--sb-border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--sb-muted)]">
                {theme}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--sb-chip)] text-[var(--sb-faint)] transition-colors hover:bg-[var(--sb-chip-hover)] hover:text-[var(--sb-text)]"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
