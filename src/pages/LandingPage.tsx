import React, { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Compass,
  Globe,
  Hash,
  Heart,
  Home,
  Layers,
  Lock,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  Mic,
  Monitor,
  MoreHorizontal,
  Newspaper,
  Phone,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  Trophy,
  Users,
  Video,
  Volume2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import KithLogo from '../components/KithLogo';
import KithStamp from '../components/KithStamp';

type IconType = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

const photos = {
  friends:
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
  dinner:
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80',
  workshop:
    'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1000&q=80',
  festival:
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1000&q=80',
  stage:
    'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1200&q=80',
  crowd:
    'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80',
  maker:
    'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1200&q=80',
  friendsTable:
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80',
  community:
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=80',
};

const faces = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
];

const navLinks = [
  { label: 'Communities', to: '/feed?view=communities' },
  { label: 'Events', to: '/events' },
  { label: 'Marketplace', to: '/marketplace' },
  { label: 'Journal', to: '/articles' },
];

const marqueeWords = [
  'Communities',
  'Live rooms',
  'Events',
  'Bounties',
  'Marketplace',
  'Journal',
  'Voice',
  'Stories',
  'Direct messages',
  'XP & badges',
  'Memberships',
  'Co-working',
];

const faqs = [
  {
    q: 'Is Kith free to use?',
    a: 'Yes. Joining, following people and most community activity are free. Some hosts charge for membership, events or the things they sell — you always see the price before you join.',
  },
  {
    q: 'What can I actually do inside a community?',
    a: 'Chat in channels, write longer posts, read announcements, drop into voice rooms, watch a live stage, RSVP to community events and climb the leaderboard. Every community can shape its own mix.',
  },
  {
    q: 'Can I sell my work here?',
    a: 'You can open a creator storefront for ebooks, courses, apps, design assets, music and video. Checkout is built in, and your dashboard keeps sales, purchases and earnings in one view.',
  },
  {
    q: 'Can I host my own event?',
    a: 'Yes — online or in person, free or ticketed. You can add co-hosts, collect registrations, send reminders, and go live from the event page when it starts.',
  },
  {
    q: 'How do challenges work?',
    a: 'Hosts post build, design, content or problem-solving bounties with a prize pool and a deadline. You join, submit your work, and can be judged by the host or voted on by the community.',
  },
  {
    q: 'Do I have to be a creator to join?',
    a: 'Not at all. Plenty of people are here to read, lurk, learn, RSVP and hang out. You can make a quiet profile and only join in when you feel like it.',
  },
];

const steps = [
  {
    n: '01',
    icon: Compass,
    title: 'Find what you love',
    copy: 'Browse communities for design, tech, food, faith, fitness, film, books — or the thing only your group understands.',
  },
  {
    n: '02',
    icon: MessageCircle,
    title: 'Say hello',
    copy: 'Join in a tap, follow the rooms that matter, and set up a profile that feels like you — not a résumé.',
  },
  {
    n: '03',
    icon: Sparkles,
    title: 'Make something together',
    copy: 'RSVP, go live, enter a bounty, open a shop, or host the first meetup. Small rituals turn into real belonging.',
  },
];

function Reveal({
  children,
  delay = 0,
  y = 26,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c] ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6b4a]" />
      {children}
    </p>
  );
}

function Face({
  src,
  size = 30,
  className = '',
}: {
  src: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full bg-[#2a2234] object-cover ${className}`}
      referrerPolicy="no-referrer"
    />
  );
}

function FaceStack({
  size = 32,
  count = 4,
  className = '',
}: {
  size?: number;
  count?: number;
  className?: string;
}) {
  return (
    <div className={`flex -space-x-2.5 ${className}`}>
      {faces.slice(0, count).map((face) => (
        <Face key={face} src={face} size={size} className="ring-2 ring-[#0e0b13]" />
      ))}
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#ffffff0d] bg-[#0e0b13]/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-8 px-5 md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[#f7f2e8]">
            <KithLogo size={30} />
          </span>
          <span className="font-display text-[22px] font-semibold tracking-[-0.05em] text-[#f7f2e8]">
            kith
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="text-sm text-[#f7f2e8]/55 transition-colors hover:text-[#f7f2e8]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm text-[#f7f2e8]/60 transition-colors hover:text-[#f7f2e8]"
          >
            Sign in
          </Link>
          <Link
            to="/login?mode=signup"
            className="group inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-5 py-2.5 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
          >
            Join Kith
            <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-[#ffffff14] text-[#f7f2e8] md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden border-t border-[#ffffff0d] md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm text-[#f7f2e8]/70 transition-colors hover:bg-[#ffffff08] hover:text-[#f7f2e8]"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[#ffffff16] px-4 py-2.5 text-center text-sm text-[#f7f2e8]/70"
                >
                  Sign in
                </Link>
                <Link
                  to="/login?mode=signup"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-[#f7f2e8] px-4 py-2.5 text-center text-sm font-semibold text-[#171120]"
                >
                  Join Kith
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function HeroApp() {
  const stories = ['Maya', 'Noah', 'Amara', 'Theo', 'Sana'];
  const channelRows = [
    { icon: Hash, label: 'introductions', meta: '3 new' },
    { icon: Hash, label: 'work-in-progress', meta: '18 new' },
    { icon: Megaphone, label: 'announcements', meta: '2 new', locked: true },
    { icon: MessageCircle, label: 'the lounge', meta: 'just now' },
  ];

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[#ffffff16] bg-[#f7f2e8] text-[#211a28] shadow-[0_50px_140px_-40px_rgba(0,0,0,0.85)]">
      <div className="flex h-10 items-center gap-2 border-b border-[#211a28]/10 bg-[#efe8da] px-3.5">
        <span className="h-2 w-2 rounded-full bg-[#ff6b4a]" />
        <span className="h-2 w-2 rounded-full bg-[#ffb65c]" />
        <span className="h-2 w-2 rounded-full bg-[#82e6c8]" />
        <div className="mx-auto flex h-6 w-[48%] items-center justify-center gap-1.5 rounded-full bg-[#211a28]/[0.055] text-[9px] font-semibold text-[#211a28]/45">
          <Lock size={8} />
          kith.community/home
        </div>
        <Bell size={12} className="text-[#211a28]/45" />
      </div>

      <div className="flex min-h-[438px]">
        <div className="hidden w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-[#211a28]/8 bg-[#f1ebdd] py-3 sm:flex">
          <span className="mb-1.5 grid h-8 w-8 place-items-center rounded-[10px] bg-[#211a28]">
            <KithLogo size={20} />
          </span>
          {[Home, Compass, MessagesSquare, CalendarDays, Trophy].map((Icon, i) => (
            <span
              key={i}
              className={`grid h-8 w-8 place-items-center rounded-[9px] ${
                i === 0 ? 'bg-[#211a28]/10 text-[#211a28]' : 'text-[#211a28]/40'
              }`}
            >
              <Icon size={14} />
            </span>
          ))}
          <div className="mt-auto">
            <Face src={faces[2]} size={30} className="ring-2 ring-[#efe8da]" />
          </div>
        </div>

        <div className="min-w-0 flex-1 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#ff6b4a]">
                Tuesday, 8:42 pm
              </p>
              <p className="mt-1 font-display text-[17px] font-semibold tracking-[-0.035em]">
                Evening, Maya.
              </p>
              <p className="text-[10px] text-[#211a28]/50">Here&apos;s what your people are up to.</p>
            </div>
            <div className="flex gap-1.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#211a28]/[0.06]">
                <Search size={12} />
              </span>
              <span className="relative grid h-7 w-7 place-items-center rounded-full bg-[#211a28]/[0.06]">
                <Bell size={12} />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff6b4a] ring-2 ring-[#f7f2e8]" />
              </span>
            </div>
          </div>

          <div className="mt-4 flex gap-2.5 overflow-hidden">
            {stories.map((name, i) => (
              <div key={name} className="flex w-[42px] shrink-0 flex-col items-center gap-1">
                <span className="rounded-full bg-[conic-gradient(from_180deg,#ff6b4a,#ffb65c,#b69cff,#ff6b4a)] p-[2px]">
                  <span className="block rounded-full bg-[#f7f2e8] p-[2px]">
                    <Face src={faces[i]} size={34} />
                  </span>
                </span>
                <span className="w-full truncate text-center text-[8px] font-medium text-[#211a28]/55">
                  {name}
                </span>
              </div>
            ))}
            <div className="flex w-[42px] shrink-0 flex-col items-center gap-1">
              <span className="grid h-[40px] w-[40px] place-items-center rounded-full border border-dashed border-[#211a28]/20 text-[#211a28]/40">
                <Plus size={14} />
              </span>
              <span className="text-[8px] text-[#211a28]/45">Add</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#211a28]/10 bg-white/55 px-2.5 py-2">
            <Face src={faces[0]} size={24} />
            <span className="flex-1 truncate text-[10px] text-[#211a28]/45">
              Share something with your circle…
            </span>
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#211a28]/[0.05] text-[#211a28]/45">
              <Video size={11} />
            </span>
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#211a28]/[0.05] text-[#211a28]/45">
              <Camera size={11} />
            </span>
          </div>

          <div className="mt-3 rounded-2xl border border-[#211a28]/10 bg-white/60 p-3">
            <div className="flex items-center gap-2">
              <Face src={faces[0]} size={26} />
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold">
                  Maya Chen <span className="font-normal text-[#211a28]/40">in Slow Design Club</span>
                </p>
                <p className="text-[8px] text-[#211a28]/45">2h · Everyone</p>
              </div>
              <MoreHorizontal size={14} className="ml-auto text-[#211a28]/35" />
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed text-[#211a28]/75">
              We finally printed the first issue of the zine. 300 copies, all hand-bound. Thank you
              for showing up, for the late edits, and for caring about the small things.
            </p>
            <div className="mt-2.5 overflow-hidden rounded-xl">
              <img
                src={photos.community}
                alt=""
                loading="lazy"
                className="h-[92px] w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="mt-2.5 flex items-center gap-3 text-[8px] text-[#211a28]/45">
              <span className="flex items-center gap-1 font-semibold text-[#ff6b4a]">
                <Heart size={10} fill="currentColor" /> 248
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle size={10} /> 32
              </span>
              <span className="flex items-center gap-1">
                <Send size={10} /> 14
              </span>
              <span className="ml-auto flex items-center gap-1 font-semibold text-[#211a28]/65">
                <Zap size={10} /> 20 XP
              </span>
            </div>
          </div>
        </div>

        <aside className="hidden w-[184px] shrink-0 border-l border-[#211a28]/8 bg-[#f3eddf] p-3 xl:block">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#211a28]/45">
              Happening today
            </p>
            <CalendarDays size={11} className="text-[#211a28]/35" />
          </div>

          <div className="mt-2 overflow-hidden rounded-xl bg-[#211a28] text-[#f7f2e8]">
            <div className="relative h-20">
              <img src={photos.dinner} alt="" className="h-full w-full object-cover opacity-90" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#211a28] via-transparent to-transparent" />
              <span className="absolute left-2 top-2 rounded-md bg-[#f7f2e8] px-1.5 py-1 text-center leading-none text-[#211a28]">
                <span className="block text-[7px] font-bold uppercase text-[#ff6b4a]">Sat</span>
                <span className="block text-[11px] font-extrabold">08</span>
              </span>
            </div>
            <div className="p-2.5">
              <p className="text-[10px] font-semibold leading-tight">Sunday supper club</p>
              <p className="mt-1 flex items-center gap-1 text-[8px] text-[#f7f2e8]/55">
                <MapPin size={8} /> Lagos · 8:00 pm
              </p>
              <div className="mt-2 flex items-center justify-between">
                <FaceStack size={16} count={3} className="[&>*]:ring-[#211a28]" />
                <span className="text-[8px] font-semibold text-[#ffb65c]">38 going</span>
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-[#211a28]/10 bg-white/55 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="landing-pulse-dot absolute inline-flex h-full w-full rounded-full bg-[#ff6b4a]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" />
              </span>
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#ff6b4a]">Live now</p>
            </div>
            <p className="mt-1.5 text-[10px] font-semibold">Portfolio teardown</p>
            <p className="mt-0.5 text-[8px] text-[#211a28]/45">24 listening · Voice room</p>
            <div className="mt-2 flex items-center justify-between">
              <FaceStack size={16} count={3} className="[&>*]:ring-[#f3eddf]" />
              <span className="rounded-full bg-[#211a28] px-2 py-1 text-[8px] font-semibold text-[#f7f2e8]">
                Join
              </span>
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-[#211a28]/10 p-2.5">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#211a28]/45">
              <Trophy size={10} /> Open bounty
            </div>
            <p className="mt-1.5 text-[10px] font-semibold leading-tight">Rebrand the library</p>
            <p className="mt-1 text-[11px] font-extrabold text-[#ff6b4a]">$2,500</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-10 md:pb-24 md:pt-16">
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
          >
            <Eyebrow>A home for the people you choose</Eyebrow>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.06 }}
            className="mt-5 text-[clamp(3.3rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-[#f7f2e8]"
          >
            Where your
            <br />
            <span className="landing-serif landing-gradient-text pr-2">people</span> are.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.13 }}
            className="mt-6 max-w-[560px] text-lg leading-relaxed text-[#f7f2e8]/60 md:text-xl"
          >
            Communities, live rooms, events, bounties and creative work — together in one warm
            place. Come for the conversation. Stay for the people.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to="/feed?view=communities"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-7 py-3.5 text-base font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              Find your community
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/events"
              className="group inline-flex items-center justify-center gap-2 rounded-full border border-[#ffffff1c] px-7 py-3.5 text-base text-[#f7f2e8]/75 transition-colors hover:border-[#ffffff3d] hover:text-[#f7f2e8]"
            >
              <Play size={16} />
              See what&apos;s happening
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28 }}
            className="mt-10 flex max-w-lg items-center gap-3"
          >
            <FaceStack size={34} count={5} />
            <p className="text-sm leading-relaxed text-[#f7f2e8]/45">
              Hosts, makers, learners and the friends who keep the group chat alive.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10">
          <KithStamp className="absolute -left-14 -top-12 hidden h-28 w-28 xl:block" />
          <motion.div
            initial={{ opacity: 0, y: 24, rotate: 1.2 }}
            animate={{ opacity: 1, y: 0, rotate: 0.6 }}
            transition={{ duration: 0.95, delay: 0.2 }}
            className="relative mx-auto w-full max-w-[640px]"
          >
            <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.2),transparent_68%)] blur-3xl" />
            <HeroApp />
          </motion.div>

          <motion.div
            animate={{ y: [0, -9, 0] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -right-5 top-10 hidden w-[196px] rounded-2xl border border-[#ffffff14] bg-[#171120]/95 p-3.5 shadow-2xl backdrop-blur-xl lg:block"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="landing-pulse-dot absolute inline-flex h-full w-full rounded-full bg-[#ff6b4a]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff6b4a]" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffb65c]">Live room</p>
            </div>
            <p className="mt-2 text-sm font-medium text-[#f7f2e8]">Late-night ideas</p>
            <p className="mt-0.5 text-[11px] text-[#f7f2e8]/45">12 people · voice</p>
            <div className="mt-3 flex items-center justify-between">
              <FaceStack size={22} count={3} />
              <span className="text-[10px] font-semibold text-[#f7f2e8]/65">Join in</span>
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
            className="absolute -bottom-9 left-2 hidden w-[226px] rounded-2xl border border-[#ffffff14] bg-[#171120]/95 p-3.5 shadow-2xl backdrop-blur-xl lg:block"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#ffb65c]/15 text-[#ffb65c]">
                <Trophy size={15} />
              </span>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#f7f2e8]/40">Open bounty</p>
                <p className="text-sm font-semibold text-[#f7f2e8]">$2,500 prize pool</p>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#ffffff0f]">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[#ff6b4a] to-[#ffb65c]" />
            </div>
            <p className="mt-1.5 text-[10px] text-[#f7f2e8]/40">142 entries · 6 days left</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  return (
    <div className="landing-marquee relative z-10 border-y border-[#ffffff0e] py-4">
      <div className="landing-marquee-track flex w-max items-center gap-9">
        {[...marqueeWords, ...marqueeWords].map((word, i) => (
          <div
            key={`${word}-${i}`}
            className="flex items-center gap-9 text-[11px] font-semibold uppercase tracking-[0.38em] text-[#f7f2e8]/35"
          >
            <span>{word}</span>
            <span className="h-1 w-1 rounded-full bg-[#ff6b4a]/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CommunityMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0f] bg-[#0b0810]">
      <div className="flex items-center gap-3 border-b border-[#ffffff0c] p-3">
        <img
          src={photos.community}
          alt=""
          loading="lazy"
          className="h-10 w-10 rounded-xl object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#f7f2e8]">The Slow Design Club</p>
          <p className="text-[10px] text-[#f7f2e8]/40">12.4k members · Creative</p>
        </div>
        <span className="ml-auto rounded-full bg-[#f7f2e8] px-2.5 py-1 text-[10px] font-bold text-[#171120]">
          Joined
        </span>
      </div>

      <div className="space-y-0.5 p-2">
        {[
          { icon: Hash, label: 'introductions', meta: '3 new', active: false },
          { icon: Hash, label: 'work-in-progress', meta: '18 new', active: true },
          { icon: Megaphone, label: 'announcements', meta: '2 new', active: false },
          { icon: MessageCircle, label: 'the lounge', meta: 'just now', active: false },
        ].map((row) => (
          <div
            key={row.label}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${
              row.active ? 'bg-[#ffffff08] text-[#f7f2e8]' : 'text-[#f7f2e8]/55'
            }`}
          >
            <row.icon size={13} className="text-[#f7f2e8]/35" />
            <span className="truncate">{row.label}</span>
            <span className="ml-auto text-[9px] text-[#f7f2e8]/30">{row.meta}</span>
          </div>
        ))}

        <div className="flex items-center gap-2 rounded-lg bg-[#82e6c8]/[0.07] px-2.5 py-2 text-xs text-[#82e6c8]">
          <Volume2 size={13} />
          <span className="truncate">co-working lounge</span>
          <span className="ml-auto flex items-center gap-1.5">
            <FaceStack size={16} count={3} className="[&>*]:ring-[#0b0810]" />
            <span className="rounded-full bg-[#82e6c8] px-2 py-0.5 text-[9px] font-bold text-[#102720]">
              4 in room
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-[#ffffff0c] px-3 py-2.5">
        {['Host', 'Design', 'Member'].map((role) => (
          <span key={role} className="rounded-full border border-[#ffffff12] px-2 py-0.5 text-[9px] text-[#f7f2e8]/45">
            {role}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[9px] text-[#f7f2e8]/30">
          <Lock size={9} /> invite only
        </span>
      </div>
    </div>
  );
}

function FeedMock() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2.5">
        {faces.slice(0, 4).map((face, i) => (
          <div key={face} className="flex w-[46px] shrink-0 flex-col items-center gap-1">
            <span className="rounded-full bg-[conic-gradient(from_140deg,#ff6b4a,#ffb65c,#b69cff,#ff6b4a)] p-[2px]">
              <span className="block rounded-full bg-[#120e18] p-[2px]">
                <Face src={face} size={34} />
              </span>
            </span>
            <span className="w-full truncate text-center text-[8px] text-[#f7f2e8]/35">
              {['Maya', 'Noah', 'Amara', 'Theo'][i]}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#ffffff0f] bg-[#0b0810] p-3">
        <div className="flex items-center gap-2">
          <Face src={faces[1]} size={24} />
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-[#f7f2e8]">
              Noah <span className="font-normal text-[#f7f2e8]/35">@noahbuilds · 4h</span>
            </p>
            <p className="text-[8px] text-[#f7f2e8]/30">in Build Night Lagos</p>
          </div>
          <MoreHorizontal size={13} className="ml-auto text-[#f7f2e8]/25" />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#f7f2e8]/65">
          Bring a half-finished idea on Friday. We&apos;ll pair up, ship something small, and eat
          too much jollof. No pitch decks.
        </p>
        <div className="mt-2.5 flex gap-2">
          <img
            src={photos.workshop}
            alt=""
            loading="lazy"
            className="h-16 flex-1 rounded-lg object-cover"
            referrerPolicy="no-referrer"
          />
          <img
            src={photos.friendsTable}
            alt=""
            loading="lazy"
            className="h-16 flex-1 rounded-lg object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="mt-2.5 flex items-center gap-3 text-[8px] text-[#f7f2e8]/35">
          <span className="flex items-center gap-1 text-[#ff9d8a]">
            <Heart size={10} fill="currentColor" /> 96
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={10} /> 12
          </span>
          <span className="ml-auto flex items-center gap-1">
            <CalendarDays size={10} /> Fri · 7pm
          </span>
        </div>
      </div>
    </div>
  );
}

function LiveMock() {
  const tiles = [
    { src: photos.workshop, name: 'Maya', host: true },
    { src: faces[1], name: 'Noah', host: false },
    { src: faces[4], name: 'Sana', host: false },
    { src: faces[3], name: 'Theo', host: false },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0f] bg-[#0b0810] p-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[#ff6b4a] px-2 py-0.5 text-[8px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </span>
          <p className="text-[10px] font-semibold text-[#f7f2e8]">Portfolio teardown</p>
        </div>
        <span className="flex items-center gap-1 text-[9px] text-[#f7f2e8]/40">
          <Users size={10} /> 24
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {tiles.map((tile) => (
          <div key={tile.name} className="relative h-[68px] overflow-hidden rounded-lg bg-[#211a28]">
            <img src={tile.src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 text-[8px] font-medium text-white">
              <Mic size={8} />
              {tile.name}
              {tile.host && <span className="rounded bg-[#ffb65c] px-1 text-[7px] font-bold text-[#171120]">HOST</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-center gap-2">
        {[Mic, Video, Monitor, Phone].map((Icon, i) => (
          <span
            key={i}
            className={`grid h-7 w-7 place-items-center rounded-full ${
              i === 3 ? 'bg-[#ff6b4a] text-white' : 'bg-[#ffffff0d] text-[#f7f2e8]/55'
            }`}
          >
            <Icon size={12} />
          </span>
        ))}
      </div>
    </div>
  );
}

function EventMock() {
  return (
    <div>
      <div className="relative h-40 overflow-hidden rounded-2xl">
        <img
          src={photos.dinner}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0810] via-[#0b0810]/25 to-transparent" />
        <span className="absolute left-2.5 top-2.5 rounded-lg bg-[#f7f2e8] px-2 py-1 text-center leading-none text-[#171120]">
          <span className="block text-[7px] font-bold uppercase text-[#ff6b4a]">Sat</span>
          <span className="block text-sm font-extrabold">08</span>
        </span>
        <div className="absolute inset-x-2.5 bottom-2.5">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#ffb65c]">Community</p>
          <p className="mt-0.5 text-base font-semibold leading-tight text-[#f7f2e8]">Sunday supper club</p>
          <div className="mt-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1 text-[9px] text-[#f7f2e8]/60">
              <MapPin size={9} /> Lagos · 8:00 pm
            </p>
            <span className="text-[9px] font-semibold text-[#f7f2e8]/80">38 going</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {['This week', 'In person', '$12'].map((chip) => (
          <span key={chip} className="rounded-full border border-[#ffffff12] px-2 py-0.5 text-[9px] text-[#f7f2e8]/45">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function MarketMock() {
  const products = [
    {
      title: 'The Quiet Web',
      type: 'E-book',
      price: '$18',
      icon: BookOpen,
      cover: 'from-[#ffb65c] via-[#ff8f62] to-[#ff6b4a]',
      text: 'text-[#2c1810]',
    },
    {
      title: 'Craft & Commerce',
      type: 'Course',
      price: '$64',
      icon: Play,
      cover: 'from-[#b69cff] via-[#8d7bdf] to-[#5b4bb5]',
      text: 'text-[#171120]',
    },
    {
      title: 'Grain & Grid',
      type: 'Assets',
      price: '$12',
      icon: Layers,
      cover: 'from-[#82e6c8] via-[#57cbb0] to-[#2a9d87]',
      text: 'text-[#102720]',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {products.map((product) => (
          <div key={product.title} className="rounded-xl border border-[#ffffff0f] bg-[#0b0810] p-1.5">
            <div className={`relative flex h-[92px] items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${product.cover}`}>
              <product.icon size={22} className={product.text} />
              <span className="absolute bottom-1.5 left-1.5 text-[7px] font-bold uppercase tracking-[0.15em] opacity-60">
                {product.type}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[9px] font-semibold text-[#f7f2e8]">{product.title}</p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#ffb65c]">{product.price}</span>
              <span className="flex items-center gap-0.5 text-[7px] text-[#f7f2e8]/35">
                <Star size={7} fill="currentColor" /> 4.9
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[9px] text-[#f7f2e8]/35">
        <span className="flex items-center gap-1">
          <Check size={9} /> Instant checkout
        </span>
        <span className="flex items-center gap-1">
          <Wallet size={9} /> Creator payouts
        </span>
      </div>
    </div>
  );
}

function ProfileMock() {
  return (
    <div className="rounded-2xl border border-[#ffffff0f] bg-[#0b0810] p-3.5">
      <div className="flex items-center gap-2.5">
        <Face src={faces[4]} size={38} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-semibold text-[#f7f2e8]">
            Noor Haddad <BadgeCheck size={13} className="text-[#82e6c8]" />
          </p>
          <p className="text-[9px] text-[#f7f2e8]/40">@noor · Product designer · Lisbon</p>
        </div>
        <span className="ml-auto rounded-full border border-[#ffffff14] px-2 py-0.5 text-[8px] text-[#f7f2e8]/45">
          Follow
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ['2,480', 'XP'],
          ['18', 'bounties'],
          ['6', 'badges'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg bg-[#ffffff05] py-1.5">
            <p className="text-xs font-bold text-[#f7f2e8]">{value}</p>
            <p className="text-[7px] uppercase tracking-[0.12em] text-[#f7f2e8]/30">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-[#f7f2e8]/45">Level 4 · Contributor</span>
          <span className="text-[#ffb65c]">720 XP to go</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ffffff0d]">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#82e6c8] via-[#ffb65c] to-[#ff6b4a]" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {['Top contributor', '12-week streak', 'Bounty winner'].map((badge) => (
          <span
            key={badge}
            className="inline-flex items-center gap-1 rounded-full border border-[#ffffff12] px-2 py-0.5 text-[8px] text-[#f7f2e8]/50"
          >
            <Sparkles size={8} className="text-[#ffb65c]" /> {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

function BentoCard({
  icon: Icon,
  eyebrow,
  title,
  copy,
  link,
  linkLabel,
  children,
  className = '',
  delay = 0,
  accent = '#ff6b4a',
}: {
  icon: IconType;
  eyebrow: string;
  title: string;
  copy: string;
  link?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
  accent?: string;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`landing-card group relative flex h-full flex-col overflow-hidden rounded-[28px] p-6 md:p-7 ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: accent }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon size={14} />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f7f2e8]/40">
          {eyebrow}
        </p>
      </div>
      <h3 className="relative mt-4 max-w-[28ch] font-display text-[25px] font-semibold leading-[1.08] tracking-[-0.05em] text-[#f7f2e8]">
        {title}
      </h3>
      <p className="relative mt-2 max-w-[44ch] text-sm leading-relaxed text-[#f7f2e8]/50">{copy}</p>
      <div className="relative mt-6 flex-1">{children}</div>
      {link && linkLabel && (
        <Link
          to={link}
          className="relative mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-[#f7f2e8]/65 transition-colors hover:text-[#ffb65c]"
        >
          {linkLabel}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </motion.article>
  );
}

function Bento() {
  return (
    <section id="what" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">One home, every kind of together</Eyebrow>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
          Everything your circle needs.
          <br />
          <span className="landing-serif text-[#f7f2e8]/45">Nothing it doesn&apos;t.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[#f7f2e8]/50">
          From the first hello to the launch party, Kith holds the whole arc of a community — without
          making you stitch five apps together.
        </p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        <BentoCard
          className="md:col-span-2 lg:col-span-7"
          icon={Users}
          eyebrow="Communities & channels"
          title="A home base that feels lived in."
          copy="Chat, posts, announcements, voice rooms and a live stage — arranged the way your people actually talk."
          link="/feed?view=communities"
          linkLabel="Browse communities"
          accent="#ff6b4a"
          delay={0}
        >
          <CommunityMock />
        </BentoCard>

        <BentoCard
          className="lg:col-span-5"
          icon={Newspaper}
          eyebrow="Your feed"
          title="Catch up without the noise."
          copy="For You, Following, Trending. Status updates, real conversations, and the good kind of scrolling."
          link="/feed"
          linkLabel="Open the feed"
          accent="#b69cff"
          delay={0.06}
        >
          <FeedMock />
        </BentoCard>

        <BentoCard
          className="lg:col-span-4"
          icon={Radio}
          eyebrow="Live rooms"
          title="Show up face to face."
          copy="Host a workshop, a listening room or a late-night co-working session. Chat, polls and Q&A are built in."
          link="/feed?view=communities"
          linkLabel="Explore live rooms"
          accent="#82e6c8"
          delay={0}
        >
          <LiveMock />
        </BentoCard>

        <BentoCard
          className="lg:col-span-4"
          icon={CalendarDays}
          eyebrow="Events"
          title="Plans that actually happen."
          copy="Find something by city, date or mood. RSVP, buy a ticket, or go live when the room fills up."
          link="/events"
          linkLabel="Find an event"
          accent="#ffb65c"
          delay={0.06}
        >
          <EventMock />
        </BentoCard>

        <BentoCard
          className="md:col-span-2 lg:col-span-7"
          icon={ShoppingBag}
          eyebrow="Marketplace"
          title="Sell the thing you made."
          copy="Ebooks, courses, tools, assets, music and video — with a storefront that feels like yours and checkout that stays out of the way."
          link="/marketplace"
          linkLabel="Visit the marketplace"
          accent="#ffb65c"
          delay={0}
        >
          <MarketMock />
        </BentoCard>

        <BentoCard
          className="lg:col-span-5"
          icon={BadgeCheck}
          eyebrow="Reputation"
          title="A profile with a pulse."
          copy="XP, badges, streaks and the work you've shipped. A reputation built from what you do, not just what you say."
          link="/feed"
          linkLabel="Meet the community"
          accent="#82e6c8"
          delay={0.06}
        >
          <ProfileMock />
        </BentoCard>
      </div>
    </section>
  );
}

const showcaseTabs = [
  { id: 'feed', label: 'Your feed', icon: Newspaper },
  { id: 'rooms', label: 'Your rooms', icon: Radio },
  { id: 'work', label: 'Your work', icon: Wallet },
] as const;

type ShowcaseTab = (typeof showcaseTabs)[number]['id'];

function FeedShowcase() {
  return (
    <div className="relative mx-auto max-w-[480px]">
      <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.18),transparent_70%)] blur-3xl" />
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rotate-[1.5deg] rounded-[26px] border border-black/10 bg-[#f7f2e8] p-4 text-[#211a28] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center gap-1 rounded-xl bg-[#211a28]/[0.055] p-1 text-[9px] font-semibold text-[#211a28]/45">
          <span className="rounded-lg bg-white px-2.5 py-1 text-[#211a28] shadow-sm">For You</span>
          <span className="px-2.5 py-1">Following</span>
          <span className="px-2.5 py-1">Trending</span>
        </div>

        <div className="mt-3 flex gap-2.5">
          {faces.slice(0, 5).map((face, i) => (
            <div key={face} className="flex w-[46px] shrink-0 flex-col items-center gap-1">
              <span className="rounded-full bg-[conic-gradient(from_140deg,#ff6b4a,#ffb65c,#b69cff,#ff6b4a)] p-[2px]">
                <span className="block rounded-full bg-[#f7f2e8] p-[2px]">
                  <Face src={face} size={34} />
                </span>
              </span>
              <span className="w-full truncate text-center text-[8px] text-[#211a28]/45">
                {['You', 'Noah', 'Amara', 'Theo', 'Sana'][i]}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-[#211a28]/10 bg-white/65 p-3">
          <div className="flex items-center gap-2">
            <Face src={faces[2]} size={26} />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold">Amara Okafor</p>
              <p className="text-[8px] text-[#211a28]/45">in Illustration Club · 18m</p>
            </div>
            <MoreHorizontal size={13} className="ml-auto text-[#211a28]/35" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[#211a28]/75">
            New brushes are live. Made these for late-night drawing when everything else is quiet.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <img src={photos.maker} alt="" loading="lazy" className="h-20 rounded-lg object-cover" referrerPolicy="no-referrer" />
            <img src={photos.community} alt="" loading="lazy" className="h-20 rounded-lg object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[8px] text-[#211a28]/45">
            <span className="flex items-center gap-1 text-[#ff6b4a]">
              <Heart size={10} fill="currentColor" /> 184
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={10} /> 26
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Zap size={10} /> 20 XP
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        className="absolute -bottom-6 -right-3 hidden w-[210px] rounded-2xl border border-[#ffffff14] bg-[#171120] p-3 shadow-2xl sm:block"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#82e6c8]/15 text-[#82e6c8]">
            <Zap size={13} />
          </span>
          <div>
            <p className="text-[10px] font-semibold text-[#f7f2e8]">20 XP earned</p>
            <p className="text-[8px] text-[#f7f2e8]/40">For showing up and joining in</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute -left-4 top-24 hidden w-[188px] rounded-2xl border border-[#ffffff14] bg-[#171120] p-3 shadow-2xl sm:block"
      >
        <div className="flex items-center gap-2">
          <Face src={faces[1]} size={22} />
          <div className="min-w-0">
            <p className="truncate text-[9px] font-semibold text-[#f7f2e8]">Noah</p>
            <p className="truncate text-[8px] text-[#f7f2e8]/40">Are you coming Friday?</p>
          </div>
        </div>
        <div className="mt-2 rounded-full bg-[#ff6b4a] py-1 text-center text-[8px] font-semibold text-white">
          Reply
        </div>
      </motion.div>
    </div>
  );
}

function RoomsShowcase() {
  return (
    <div className="relative mx-auto max-w-[500px]">
      <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(130,230,200,0.15),transparent_70%)] blur-3xl" />
      <div className="relative rotate-[-1deg] rounded-[26px] border border-[#ffffff12] bg-[#0b0810] p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 px-1">
          <img src={photos.community} alt="" className="h-8 w-8 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-[#f7f2e8]">The Slow Design Club</p>
            <p className="text-[8px] text-[#f7f2e8]/35">Live stage · 24 watching</p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-[#ff6b4a] px-2 py-0.5 text-[8px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {[
            { src: photos.workshop, name: 'Maya', host: true },
            { src: faces[1], name: 'Noah' },
            { src: faces[4], name: 'Sana' },
            { src: faces[3], name: 'Theo' },
          ].map((tile) => (
            <div key={tile.name} className="relative h-[88px] overflow-hidden rounded-xl bg-[#211a28]">
              <img src={tile.src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 text-[8px] font-medium text-white">
                <Mic size={8} /> {tile.name}
                {tile.host && <span className="rounded bg-[#ffb65c] px-1 text-[7px] font-bold text-[#171120]">HOST</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          {[Mic, Video, Monitor, Phone].map((Icon, i) => (
            <span
              key={i}
              className={`grid h-7 w-7 place-items-center rounded-full ${
                i === 3 ? 'bg-[#ff6b4a] text-white' : 'bg-[#ffffff0d] text-[#f7f2e8]/55'
              }`}
            >
              <Icon size={12} />
            </span>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-[1.2fr_0.8fr] gap-2">
          <div className="rounded-xl border border-[#ffffff0c] bg-[#120e18] p-2.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#f7f2e8]/30">Live chat</p>
            <div className="mt-2 space-y-1.5">
              {[
                ['Noah', 'That type pairing is so good.'],
                ['Sana', 'Can you drop the file after?'],
                ['Maya', 'Yes — adding it to resources now.'],
              ].map(([name, text]) => (
                <p key={name} className="text-[8px] leading-snug text-[#f7f2e8]/50">
                  <span className="font-semibold text-[#f7f2e8]/80">{name}</span> {text}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[#ffffff0c] bg-[#120e18] p-2.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#f7f2e8]/30">Poll</p>
            <p className="mt-1.5 text-[9px] font-semibold leading-snug text-[#f7f2e8]">
              Which cover direction?
            </p>
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#ffffff0d]">
                <div className="h-full w-[72%] rounded-full bg-[#82e6c8]" />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#ffffff0d]">
                <div className="h-full w-[48%] rounded-full bg-[#ffb65c]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkShowcase() {
  const bars = [38, 56, 44, 72, 58, 84, 66, 92];
  return (
    <div className="relative mx-auto max-w-[480px]">
      <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(255,182,92,0.18),transparent_70%)] blur-3xl" />
      <div className="landing-on-light relative rotate-[-1.2deg] rounded-[26px] border border-[#211a28]/10 bg-[#f7f2e8] p-5 text-[#211a28] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#211a28]/40">Creator dashboard</p>
            <p className="mt-1 text-sm font-semibold">This month</p>
          </div>
          <span className="rounded-full bg-[#211a28]/[0.055] px-2.5 py-1 text-[8px] font-semibold text-[#211a28]/50">
            May 2026
          </span>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <p className="text-4xl font-extrabold tracking-[-0.07em]">$8,420</p>
          <span className="mb-1 flex items-center gap-0.5 rounded-full bg-[#82e6c8]/30 px-1.5 py-0.5 text-[8px] font-bold text-[#1d6b58]">
            <TrendingUp size={8} /> 18%
          </span>
        </div>
        <p className="mt-0.5 text-[8px] text-[#211a28]/40">From products, bounties and memberships</p>

        <div className="mt-4 flex h-24 items-end gap-1.5">
          {bars.map((height, i) => (
            <div key={i} className="flex-1">
              <div
                className={`w-full rounded-t-sm ${
                  i === bars.length - 1
                    ? 'bg-gradient-to-t from-[#ff6b4a] to-[#ffb65c]'
                    : 'bg-[#211a28]/10'
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-[#211a28]/10 pt-3">
          {[
            ['The Quiet Web · ebook', '+$18'],
            ['Craft & Commerce · course', '+$64'],
            ['Library rebrand · bounty', '+$2,500'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-[9px]">
              <span className="text-[#211a28]/55">{label}</span>
              <span className="font-bold text-[#211a28]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-4 -top-6 hidden w-[176px] rounded-2xl border border-[#ffffff14] bg-[#171120] p-3 shadow-2xl sm:block"
      >
        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#f7f2e8]/35">Next payout</p>
        <p className="mt-1 text-lg font-extrabold text-[#f7f2e8]">$3,280</p>
        <p className="text-[8px] text-[#f7f2e8]/40">Friday · to your account</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ffffff0f]">
          <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#82e6c8] to-[#ffb65c]" />
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
        className="absolute -bottom-7 -left-4 hidden w-[178px] rounded-2xl border border-[#ffffff14] bg-[#171120] p-3 shadow-2xl sm:block"
      >
        <div className="flex items-center gap-2">
          <div className="grid h-11 w-9 place-items-center rounded-md bg-gradient-to-br from-[#ffb65c] to-[#ff6b4a] text-[#2c1810]">
            <BookOpen size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[9px] font-semibold text-[#f7f2e8]">The Quiet Web</p>
            <p className="text-[8px] text-[#f7f2e8]/40">E-book · $18</p>
            <p className="mt-0.5 flex items-center gap-0.5 text-[8px] text-[#82e6c8]">
              <CheckCircle2 size={8} /> 214 sold
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Showcase() {
  const [tab, setTab] = useState<ShowcaseTab>('feed');
  const copy = {
    feed: {
      kicker: 'Inside the feed',
      title: 'The group chat grew up.',
      body: 'Catch up without the chaos. Statuses, posts, replies, DMs and notifications live together, sorted by what you actually care about.',
      points: [
        'For You, Following and Trending — you choose the mood',
        'Status updates that disappear when the moment does',
        'DMs and notifications without the app-hopping',
      ],
      link: '/feed',
      linkLabel: 'Take a look inside',
    },
    rooms: {
      kicker: 'Inside the rooms',
      title: 'A room for every kind of gathering.',
      body: 'Chat, voice, live stage and event channels sit side by side. Drop in, lurk, or take the mic — the door is open either way.',
      points: [
        'Voice rooms you can slip into without announcing yourself',
        'Live stage with chat, polls and Q&A built in',
        'Roles, invites and private spaces for your people',
      ],
      link: '/feed?view=communities',
      linkLabel: 'Explore communities',
    },
    work: {
      kicker: 'Inside the work',
      title: 'Your work, in front of your people.',
      body: 'Open a shop, enter a bounty, publish a journal entry, or get paid by your community. Everything you make has a place to land.',
      points: [
        'Marketplace with instant checkout and creator payouts',
        'Bounties with real prize pools and public submissions',
        'Earnings, sales and analytics in one clear view',
      ],
      link: '/marketplace',
      linkLabel: 'Visit the marketplace',
    },
  }[tab];

  return (
    <section id="inside" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">A closer look</Eyebrow>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
          Built for the way you
          <br />
          <span className="landing-serif text-[#f7f2e8]/45">actually hang out.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[#f7f2e8]/50">
          Not a pile of features. A place where the feed, the rooms and the work feel like they
          belong to the same world.
        </p>
      </Reveal>

      <div className="mt-8 flex justify-center">
        <div className="flex gap-1 rounded-full border border-[#ffffff10] bg-[#120e18] p-1.5">
          {showcaseTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:px-5 sm:text-sm ${
                tab === item.id
                  ? 'bg-[#f7f2e8] text-[#171120]'
                  : 'text-[#f7f2e8]/50 hover:text-[#f7f2e8]'
              }`}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-[34px] border border-[#ffffff0d] bg-[#141019] p-2">
        <div className="min-h-[540px] rounded-[28px] bg-[#0b0810] p-6 md:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="grid items-center gap-10 lg:grid-cols-[0.86fr_1.14fr]"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb65c]">
                  {copy.kicker}
                </p>
                <h3 className="mt-3 font-display text-3xl font-semibold leading-[1.05] tracking-[-0.05em] text-[#f7f2e8] sm:text-4xl">
                  {copy.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-relaxed text-[#f7f2e8]/55">{copy.body}</p>
                <ul className="mt-6 space-y-3">
                  {copy.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm text-[#f7f2e8]/65">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#82e6c8]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  to={copy.link}
                  className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-6 py-3 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
                >
                  {copy.linkLabel}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div>
                {tab === 'feed' && <FeedShowcase />}
                {tab === 'rooms' && <RoomsShowcase />}
                {tab === 'work' && <WorkShowcase />}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function EventsSection() {
  return (
    <section id="events" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14">
        <Reveal>
          <Eyebrow>Out there, too</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
            A reason to put
            <br />
            the phone <span className="landing-serif text-[#f7f2e8]/45">down.</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#f7f2e8]/55">
            Online or in your city, Kith events turn a group chat into a room full of people. Find
            something this week — or make the thing everyone&apos;s been waiting for.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {[
              { icon: MapPin, label: 'Lagos' },
              { icon: CalendarDays, label: 'This week' },
              { icon: Globe, label: 'Online' },
              { icon: Ticket, label: 'Free & paid' },
            ].map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff12] px-3 py-1.5 text-xs text-[#f7f2e8]/55"
              >
                <chip.icon size={12} className="text-[#ffb65c]" />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/events"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-6 py-3 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              Browse events
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login?mode=signup"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ffffff16] px-6 py-3 text-sm text-[#f7f2e8]/70 transition-colors hover:border-[#ffffff36] hover:text-[#f7f2e8]"
            >
              <Plus size={15} /> Host your own
            </Link>
          </div>
        </Reveal>

        <div className="relative">
          <div className="grid grid-cols-2 gap-3">
            <div className="group relative col-span-2 aspect-[16/9] overflow-hidden rounded-[30px]">
              <img
                src={photos.dinner}
                alt="People sharing a meal together"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b13] via-[#0e0b13]/20 to-transparent" />
              <div className="absolute left-4 top-4 rounded-xl bg-[#f7f2e8] px-3 py-2 text-center leading-none text-[#171120]">
                <p className="text-[9px] font-bold uppercase text-[#ff6b4a]">Sat</p>
                <p className="mt-0.5 text-xl font-extrabold">08</p>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb65c]">
                  Community supper
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#f7f2e8]">Sunday supper club</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-[#f7f2e8]/55">
                    <MapPin size={13} /> Lagos · 8:00 pm
                  </p>
                  <div className="flex items-center gap-2">
                    <FaceStack size={24} count={4} />
                    <span className="text-xs font-semibold text-[#f7f2e8]/75">38 going</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="group relative aspect-[4/5] overflow-hidden rounded-[24px]">
              <img
                src={photos.workshop}
                alt="A workshop in progress"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b13] via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#82e6c8]">Wednesday</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-[#f7f2e8]">Build night</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-[#f7f2e8]/50">
                  <Video size={10} /> Online · free
                </p>
              </div>
            </div>

            <div className="group relative aspect-[4/5] overflow-hidden rounded-[24px]">
              <img
                src={photos.festival}
                alt="A festival crowd"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b13] via-transparent to-transparent" />
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#ff6b4a] px-2 py-1 text-[8px] font-bold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE NOW
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#ffb65c]">Friday</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-[#f7f2e8]">Open-air session</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-[#f7f2e8]/50">
                  <Users size={10} /> 214 going
                </p>
              </div>
            </div>
          </div>

          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-4 top-1/2 hidden w-[176px] -translate-y-1/2 rounded-2xl border border-[#ffffff14] bg-[#171120]/95 p-3 shadow-2xl backdrop-blur-xl xl:block"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#f7f2e8]/35">Find your city</p>
            <div className="mt-2 space-y-1.5">
              {['Lagos', 'London', 'Nairobi', 'Online'].map((city) => (
                <div key={city} className="flex items-center justify-between rounded-lg px-2 py-1 text-[9px] text-[#f7f2e8]/55">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={9} /> {city}
                  </span>
                  <ArrowUpRight size={8} className="text-[#f7f2e8]/25" />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function EconomySection() {
  return (
    <section id="earn" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <Reveal className="order-2 lg:order-1">
          <div className="relative mx-auto max-w-[560px]">
            <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(255,182,92,0.16),transparent_70%)] blur-3xl" />
            <div className="relative">
              <WorkShowcase />
            </div>
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2" delay={0.05}>
          <Eyebrow>Keep what you make</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
            A living, not a side hustle you have to
            <span className="landing-serif text-[#f7f2e8]/45"> explain.</span>
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#f7f2e8]/55">
            Sell your work, run a bounty for your community, charge for membership, or get paid for
            the things you already do. Checkout is built in, so you can get back to making.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { icon: ShoppingBag, label: 'Creator storefront' },
              { icon: CircleDollarSign, label: 'Instant checkout' },
              { icon: Users, label: 'Memberships & fees' },
              { icon: Wallet, label: 'Earnings dashboard' },
              { icon: Trophy, label: 'Bounty payouts' },
              { icon: TrendingUp, label: 'Sales & audience insights' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.5 rounded-xl border border-[#ffffff0d] bg-[#ffffff03] px-3 py-2.5 text-sm text-[#f7f2e8]/55"
              >
                <item.icon size={15} className="text-[#ffb65c]" />
                {item.label}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/login?mode=signup"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-6 py-3 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              Start selling
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ffffff16] px-6 py-3 text-sm text-[#f7f2e8]/70 transition-colors hover:border-[#ffffff36] hover:text-[#f7f2e8]"
            >
              <StoreIcon /> Explore the marketplace
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function StoreIcon() {
  return <ShoppingBag size={15} />;
}

function Personas() {
  const people = [
    {
      tag: 'For hosts',
      title: 'Give your people a place that feels like theirs.',
      copy: 'Channels, roles, events and insights — without wrestling a server or a spreadsheet.',
      image: photos.friendsTable,
      chips: ['Channels', 'Roles', 'Events', 'Insights'],
      accent: '#ffb65c',
    },
    {
      tag: 'For makers',
      title: 'Find the people who get what you’re building.',
      copy: 'A storefront, bounties, long-form writing and a profile that shows the work you’ve shipped.',
      image: photos.maker,
      chips: ['Marketplace', 'Bounties', 'Journal', 'Profile'],
      accent: '#82e6c8',
    },
    {
      tag: 'For members',
      title: 'Come as you are. Join in when you’re ready.',
      copy: 'Read, lurk, RSVP, DM, or take the mic. There is no wrong way to be part of a community.',
      image: photos.friends,
      chips: ['Feed', 'Statuses', 'DMs', 'Voice rooms'],
      accent: '#b69cff',
    },
  ];

  return (
    <section id="people" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">Made for the whole circle</Eyebrow>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
          Everyone has a <span className="landing-serif text-[#f7f2e8]/45">seat.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[#f7f2e8]/50">
          Hosts, makers and members all get something real — without needing to be online all the
          time.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {people.map((person, i) => (
          <motion.article
            key={person.tag}
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="group relative aspect-[4/5] overflow-hidden rounded-[28px] border border-[#ffffff0f]"
          >
            <img
              src={person.image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b13] via-[#0e0b13]/55 to-[#0e0b13]/10" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
              <span
                className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ borderColor: `${person.accent}55`, color: person.accent, background: `${person.accent}10` }}
              >
                {person.tag}
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border border-[#ffffff20] bg-black/25 text-[#f7f2e8]/70 backdrop-blur">
                <ArrowUpRight size={14} />
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="max-w-[22ch] font-display text-2xl font-semibold leading-[1.05] tracking-[-0.04em] text-[#f7f2e8]">
                {person.title}
              </p>
              <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-[#f7f2e8]/55">{person.copy}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {person.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-[#ffffff18] bg-black/20 px-2 py-0.5 text-[9px] text-[#f7f2e8]/65 backdrop-blur"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section id="start" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">Start small</Eyebrow>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl md:text-6xl">
          Find your corner in
          <br />
          <span className="landing-serif text-[#f7f2e8]/45">three small steps.</span>
        </h2>
      </Reveal>

      <div className="relative mt-12 grid gap-4 md:grid-cols-3">
        <div className="pointer-events-none absolute left-[16%] right-[16%] top-14 hidden border-t border-dashed border-[#ffffff14] md:block" />
        {steps.map((step, i) => (
          <Reveal key={step.n} delay={i * 0.08} className="relative">
            <div className="landing-card flex h-full flex-col rounded-[26px] p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#ffffff12] bg-[#ffffff04] text-[#f7f2e8]/70">
                  <step.icon size={19} />
                </span>
                <span className="font-display text-3xl font-bold tracking-[-0.06em] text-[#f7f2e8]/12">
                  {step.n}
                </span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-[-0.035em] text-[#f7f2e8]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f7f2e8]/50">{step.copy}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 flex justify-center" delay={0.1}>
        <Link
          to="/login?mode=signup"
          className="group inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-7 py-3.5 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
        >
          Make your first room
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Reveal>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <Eyebrow>Good to know</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#f7f2e8] sm:text-5xl">
            A few things
            <br />
            <span className="landing-serif text-[#f7f2e8]/45">people ask.</span>
          </h2>
          <p className="mt-5 max-w-sm text-lg text-[#f7f2e8]/50">
            Still curious? Make an account and look around. You can always leave a room quietly.
          </p>
          <Link
            to="/login?mode=signup"
            className="group mt-7 inline-flex items-center gap-2 rounded-full border border-[#ffffff16] px-6 py-3 text-sm text-[#f7f2e8]/70 transition-colors hover:border-[#ffffff36] hover:text-[#f7f2e8]"
          >
            Join Kith
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="divide-y divide-[#ffffff0c] rounded-[26px] border border-[#ffffff0d] bg-[#ffffff02]">
            {faqs.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left"
                  >
                    <span className="text-sm font-medium text-[#f7f2e8]/80 sm:text-base">{item.q}</span>
                    <ChevronDown
                      size={17}
                      className={`shrink-0 text-[#f7f2e8]/35 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-sm leading-relaxed text-[#f7f2e8]/50">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="join" className="relative mx-auto max-w-[1240px] px-5 pb-20 md:px-8 md:pb-28">
      <div className="relative overflow-hidden rounded-[36px] border border-[#ffffff14]">
        <img
          src={photos.friends}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-[#0e0b13]/72" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,107,74,0.32),transparent_65%)]" />
        <div className="relative px-6 py-20 text-center md:px-16 md:py-28">
          <KithStamp className="mx-auto mb-6 h-20 w-20" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-[#ffb65c]">
            Your people are already here
          </p>
          <h2 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.08em] text-[#f7f2e8] sm:text-5xl md:text-7xl">
            The internet is loud.
            <br />
            <span className="landing-serif landing-gradient-text">Your corner can be warm.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-[#f7f2e8]/60">
            Find the rooms, events and people that make the internet feel smaller — in the best way.
            Start with one community. Say one hello.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login?mode=signup"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-8 py-3.5 text-base font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              Join Kith for free
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/feed?view=communities"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ffffff2b] px-8 py-3.5 text-base text-[#f7f2e8]/80 transition-colors hover:border-[#ffffff55] hover:text-[#f7f2e8]"
            >
              Browse communities
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[#f7f2e8]/40">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[#82e6c8]" /> Free to join
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[#82e6c8]" /> No algorithm games
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[#82e6c8]" /> Leave any room quietly
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const columns = [
    {
      title: 'Explore',
      links: [
        { label: 'Communities', to: '/feed?view=communities' },
        { label: 'Events', to: '/events' },
        { label: 'Marketplace', to: '/marketplace' },
        { label: 'Journal', to: '/articles' },
      ],
    },
    {
      title: 'Your Kith',
      links: [
        { label: 'Feed', to: '/feed' },
        { label: 'Creator profiles', to: '/feed' },
        { label: 'Messages', to: '/feed?view=messages' },
        { label: 'Notifications', to: '/feed?view=notifications' },
      ],
    },
    {
      title: 'Get started',
      links: [
        { label: 'Join Kith', to: '/login?mode=signup' },
        { label: 'Sign in', to: '/login' },
        { label: 'Create a community', to: '/login?mode=signup' },
        { label: 'Sell your work', to: '/marketplace' },
      ],
    },
  ];

  return (
    <footer className="relative z-10 border-t border-[#ffffff0d]">
      <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[#f7f2e8]">
                <KithLogo size={30} />
              </span>
              <span className="font-display text-[22px] font-semibold tracking-[-0.05em] text-[#f7f2e8]">
                kith
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#f7f2e8]/40">
              A home for communities, conversation, live rooms, events and creative work. Made for
              people who make room for others.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <FaceStack size={28} count={4} />
              <p className="text-xs text-[#f7f2e8]/35">People are already here.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f7f2e8]/30">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-[#f7f2e8]/55 transition-colors hover:text-[#f7f2e8]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[#ffffff0d] pt-6 text-xs text-[#f7f2e8]/30 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Kith. Made for the people who make room.</p>
          <div className="flex items-center gap-4">
            <span>Built with care</span>
            <span className="h-1 w-1 rounded-full bg-[#f7f2e8]/20" />
            <a href="#top" className="transition-colors hover:text-[#f7f2e8]/70">
              Back to top
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div id="top" className="landing-page relative min-h-screen overflow-x-hidden">
      <div className="landing-grain" />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_top,rgba(255,107,74,0.17),transparent_70%)] blur-3xl" />
        <div className="absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.13),transparent_68%)] blur-3xl" />
        <div className="absolute bottom-[-320px] right-[-160px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(255,182,92,0.1),transparent_70%)] blur-3xl" />
        <div className="landing-grid absolute inset-0 opacity-40" />
      </div>

      <Nav />
      <main className="relative z-10">
        <Hero />
        <Marquee />
        <Bento />
        <Showcase />
        <EventsSection />
        <EconomySection />
        <Personas />
        <Steps />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
