import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Radio, Rocket, Sparkles, Ticket, Users } from 'lucide-react';

interface Props {
  onDiscover: () => void;
  onCreate: () => void;
  onInstant: () => void;
  onBoost: () => void;
}

/** Static feature carousel: tells people what events on Kith can do. White text on bold gradients in both themes. */
export default function EventHero({ onDiscover, onCreate, onInstant, onBoost }: Props) {
  const slides: { id: string; bg: string; kicker: string; title: ReactNode; body: string; cta: string; act: () => void; art: ReactNode }[] = [
    {
      id: 'discover', bg: 'linear-gradient(120deg,#EC4899 0%,#F97316 60%,#FBBF24 100%)', kicker: 'Discover',
      title: <>Your next great night is <span className="underline decoration-white/60 decoration-4 underline-offset-4">one tap</span> away</>,
      body: 'Meetups, workshops, parties and live rooms. Search by city and see what’s on tonight.',
      cta: 'Explore events', act: onDiscover, art: <PosterStack />,
    },
    {
      id: 'host', bg: 'linear-gradient(120deg,#2563EB 0%,#06B6D4 100%)', kicker: 'Host',
      title: <>Host in <span className="underline decoration-white/60 decoration-4 underline-offset-4">3 minutes</span>, fill the room</>,
      body: 'Pick a vibe, set tickets and capacity. We handle RSVPs, reminders and the live room.',
      cta: 'Create an event', act: onCreate, art: <TicketArt />,
    },
    {
      id: 'live', bg: 'linear-gradient(120deg,#111827 0%,#7F1D1D 55%,#EF4444 100%)', kicker: 'Instant sessions',
      title: <>Go live in <span className="underline decoration-white/60 decoration-4 underline-offset-4">30 seconds</span></>,
      body: 'No planning. Name a room, invite your people, and talk. It wraps up on its own.',
      cta: 'Start a session', act: onInstant, art: <LiveArt />,
    },
    {
      id: 'boost', bg: 'linear-gradient(120deg,#F59E0B 0%,#EC4899 100%)', kicker: 'Boost',
      title: <>Get your event in <span className="underline decoration-white/60 decoration-4 underline-offset-4">front of everyone</span></>,
      body: 'Boost to the top of Events or into the feed. Always clearly labelled, always worth it.',
      cta: 'Boost an event', act: onBoost, art: <BoostArt />,
    },
  ];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI(n => (n + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, [paused, slides.length]);
  const s = slides[i];

  return (
    <section className="relative overflow-hidden rounded-[28px] min-h-[300px] sm:min-h-[340px]" style={{ color: '#fff' }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <AnimatePresence mode="wait">
        <motion.div key={s.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.45 }} className="absolute inset-0" style={{ background: s.bg }}>
          <div className="absolute -left-20 -bottom-24 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute right-10 -top-24 w-80 h-80 rounded-full bg-black/15 blur-3xl" />
          <div className="relative h-full min-h-[300px] sm:min-h-[340px] grid md:grid-cols-[1.2fr_1fr] items-center gap-6 px-6 sm:px-10 py-8">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider"><Sparkles size={12} /> {s.kicker}</span>
              <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.05]" style={{ color: '#fff' }}>{s.title}</h2>
              <p className="mt-3 text-white/85 sm:text-lg max-w-md">{s.body}</p>
              <button onClick={s.act} className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold hover:scale-105 active:scale-95 transition-transform shadow-xl">
                {s.cta} <ArrowRight size={18} />
              </button>
            </div>
            <div className="hidden md:flex justify-center" aria-hidden>{s.art}</div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-4 left-6 sm:left-10 flex gap-2 z-10">
        {slides.map((x, n) => (
          <button key={x.id} aria-label={`Show ${x.kicker}`} onClick={() => setI(n)} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-8 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/70'}`} />
        ))}
      </div>
    </section>
  );
}

const float = (d = 0) => ({ animate: { y: [0, -10, 0] }, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const, delay: d } });

function PosterStack() {
  const card = (rot: number, g: string, e: string, t: string, d: number) => (
    <motion.div {...float(d)} className="absolute w-36 h-48 rounded-2xl p-3 flex flex-col justify-end shadow-2xl border border-white/30" style={{ background: g, transform: `rotate(${rot}deg)` }}>
      <span className="absolute top-2 right-2 text-4xl">{e}</span>
      <span className="font-display font-bold text-sm leading-tight" style={{ color: '#fff' }}>{t}</span>
    </motion.div>
  );
  return (
    <div className="relative w-72 h-56">
      <div className="absolute left-0 top-6">{card(-10, 'linear-gradient(135deg,#3B82F6,#06B6D4)', '💻', 'Builders Night', 0.2)}</div>
      <div className="absolute left-24 top-0 z-10">{card(4, 'linear-gradient(135deg,#8B5CF6,#EC4899)', '🎶', 'Rooftop Sessions', 0)}</div>
      <div className="absolute left-44 top-10">{card(14, 'linear-gradient(135deg,#10B981,#84CC16)', '🍸', 'Food Fair', 0.4)}</div>
    </div>
  );
}

function TicketArt() {
  return (
    <motion.div {...float()} className="relative -rotate-6 w-72 rounded-3xl bg-white text-black shadow-2xl overflow-hidden">
      <div className="p-5 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">Admit one</p>
        <p className="font-display font-extrabold text-2xl leading-tight mt-1" style={{ color: '#000' }}>Product Meetup</p>
        <p className="text-sm text-black/60 mt-1">Sat · 6:00 PM · Lagos</p>
      </div>
      <div className="relative border-t-2 border-dashed border-black/15 px-5 py-3 flex items-center justify-between">
        <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-cyan-500" /><span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-cyan-500" />
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Users size={15} /> 128 going</span>
        <Ticket size={20} className="text-cyan-600" />
      </div>
    </motion.div>
  );
}

function LiveArt() {
  return (
    <motion.div {...float()} className="w-72 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/20 p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 text-xs font-bold"><Radio size={12} /> LIVE</span>
        <span className="text-xs text-white/70">29:41 left</span>
      </div>
      <p className="mt-3 font-display font-bold text-lg" style={{ color: '#fff' }}>Ask me anything</p>
      <div className="mt-3 flex -space-x-2">
        {['#F97316', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'].map(c => <span key={c} className="w-9 h-9 rounded-full border-2 border-black/40" style={{ background: c }} />)}
        <span className="w-9 h-9 rounded-full border-2 border-black/40 bg-white/20 text-xs font-bold flex items-center justify-center">+12</span>
      </div>
    </motion.div>
  );
}

function BoostArt() {
  return (
    <motion.div {...float()} className="w-72 rounded-3xl bg-white text-black p-5 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 rounded-full bg-amber-400 text-xs font-bold">PROMOTED</span>
        <Rocket size={20} className="text-pink-500" />
      </div>
      <p className="mt-3 text-sm text-black/60">People who saw your event</p>
      <p className="font-display font-extrabold text-3xl" style={{ color: '#000' }}>+4,820</p>
      <div className="mt-3 flex items-end gap-1.5 h-16">
        {[20, 32, 28, 44, 52, 64].map((h, n) => <span key={n} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: 'linear-gradient(to top,#EC4899,#F59E0B)' }} />)}
      </div>
    </motion.div>
  );
}
