import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Mic,
  Sparkles,
  Video,
} from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';
import PublicCta from '../components/public/PublicCta';
import { useCurrentUser } from '../contexts/CurrentUserContext';

const WHAT_YOU_FIND = [
  {
    icon: Mic,
    title: 'Live rooms',
    body: 'Drop into a voice room without a call or an invite. People come and go while the conversation keeps going.',
  },
  {
    icon: MapPin,
    title: 'In-person meetups',
    body: 'Small gatherings in real places, run by the hosts who already know their corner of the city.',
  },
  {
    icon: Video,
    title: 'Workshops & sessions',
    body: 'Screen shares, teach-ins and build sessions with the people whose work you already follow.',
  },
  {
    icon: CalendarDays,
    title: 'A calendar that remembers',
    body: 'RSVP once, then get a reminder before it starts. Your line-up stays with you across devices.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Find your room',
    body: 'Browse what hosts in your communities are planning, or start with a city and a date.',
  },
  {
    step: '02',
    title: 'Save your place',
    body: 'RSVP in a tap. Free or paid, you always see the naira price before you commit.',
  },
  {
    step: '03',
    title: 'Show up as yourself',
    body: 'Join from the app, on the day, with the same profile and people you already know.',
  },
];

export default function PublicEventsPage() {
  const user = useCurrentUser();
  const canonical =
    typeof window !== 'undefined' ? `${window.location.origin}/events` : '/events';

  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <Helmet>
        <title>Events on Kith — live rooms, meetups and workshops</title>
        <meta
          name="description"
          content="Kith events turn conversation into a room: live voice sessions, in-person meetups, workshops and co-working. RSVP, get reminders, and show up with people you already know."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Events on Kith" />
        <meta property="og:url" content={canonical} />
      </Helmet>

      <PageHero
        containerClassName="max-w-[1240px]"
        eyebrow={
          <Badge variant="primary" dot>
            Gatherings &amp; rooms
          </Badge>
        }
        title={
          <>
            Show up.
            <br />
            <span className="font-serif font-normal italic tracking-[-0.03em] text-[#ffb65c]">
              Or open a room.
            </span>
          </>
        }
        titleClassName="max-w-[16ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="Events are where the conversation becomes a room — live voice sessions, in-person meetups, workshops and quiet co-working. Here is what the calendar looks like once you are inside Kith."
        actions={
          <>
            <Link
              to={user ? '/feed' : '/login?mode=signup'}
              className="group inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-5 py-3 text-[13px] font-bold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              {user ? 'Open Kith' : 'Join Kith'}
              <ArrowUpRight
                size={15}
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              to="/communities"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff1c] px-4 py-2.5 text-[12px] font-semibold text-[#f7f2e8]/75 transition-colors hover:border-[#ffffff3d] hover:text-[#f7f2e8]"
            >
              Browse communities <ArrowRight size={14} />
            </Link>
          </>
        }
        visual={
          <div className="relative hidden h-[320px] w-full max-w-[430px] lg:block">
            <div className="landing-float absolute left-0 top-4 w-[250px] -rotate-3 rounded-[24px] border border-white/15 bg-[#211a28]/88 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.75)] backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff6b4a]/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#ff6b4a]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff6b4a]" /> Live now
                </span>
                <span className="text-[10px] text-[#f7f2e8]/40">Voice room</span>
              </div>
              <p className="mt-3 font-display text-[17px] font-semibold leading-snug text-[#f7f2e8]">
                Late-night build session
              </p>
              <p className="mt-1 text-[11px] text-[#f7f2e8]/45">14 people inside · no call needed</p>
              <div className="mt-3 flex -space-x-2">
                {['#ff6b4a', '#b69cff', '#82e6c8', '#ffb65c'].map((color) => (
                  <span
                    key={color}
                    className="h-7 w-7 rounded-full ring-2 ring-[#211a28]"
                    style={{ background: color }}
                  />
                ))}
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ffffff12] text-[9px] font-bold text-[#f7f2e8]/70 ring-2 ring-[#211a28]">
                  +10
                </span>
              </div>
            </div>

            <div className="landing-float-slow absolute bottom-2 right-0 w-[220px] rotate-2 rounded-[24px] border border-white/15 bg-[#211a28]/88 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.75)] backdrop-blur">
              <div className="flex items-center gap-2 text-[#82e6c8]">
                <CalendarDays size={14} />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Saturday</p>
              </div>
              <p className="mt-2 font-display text-[15px] font-semibold leading-snug text-[#f7f2e8]">
                Print fair, then coffee
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[#f7f2e8]/45">
                <MapPin size={10} /> Lagos · 11:00
              </p>
            </div>

            <span className="absolute bottom-8 left-6 h-2.5 w-2.5 rounded-full bg-[#ffb65c] shadow-[0_0_24px_rgba(255,182,92,0.85)]" />
          </div>
        }
      />

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" /> What you&apos;ll find
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-[1] tracking-[-0.05em] sm:text-4xl">
            Four kinds of room, <span className="landing-serif text-[#f7f2e8]/45">one calendar.</span>
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHAT_YOU_FIND.map((item) => (
            <article
              key={item.title}
              className="group rounded-[24px] border border-[#ffffff0f] bg-[#141019] p-5 transition-colors hover:border-[#ffb65c]/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6b4a]/10 text-[#ff6b4a]">
                <item.icon size={18} />
              </span>
              <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.02em]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f7f2e8]/50">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="rounded-[28px] border border-[#ffffff0f] bg-[#141019] p-6 md:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#f7f2e8]/35">
                How it works
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                From &ldquo;maybe&rdquo; to showing up.
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#f7f2e8]/40">
              <Clock size={12} /> About a minute
            </span>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="rounded-[20px] border border-[#ffffff0a] bg-[#0e0b13]/50 p-5">
                <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-[#ff6b4a]">
                  {item.step}
                </p>
                <h3 className="mt-3 text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#f7f2e8]/50">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="grid gap-6 rounded-[28px] border border-[#ffffff0f] bg-[#141019] p-6 md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#82e6c8]">
              <Sparkles size={13} /> For hosts
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              Open a door of your own.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#f7f2e8]/50">
              Set a date, invite your circle, and let Kith handle the rest: RSVPs, reminders, a live
              room when the time comes, and naira pricing if you charge for a seat.
            </p>
          </div>

          <ul className="space-y-3 self-center">
            {[
              'Free or paid, priced in naira',
              'Automatic reminders for everyone going',
              'Live room attached to the event',
              'Works for in-person and online',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-[#f7f2e8]/65">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#82e6c8]/15 text-[#82e6c8]">
                  <Check size={11} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PublicCta
        title="The calendar is inside Kith."
        body="Open the app to see what your communities are planning, RSVP, and keep the rooms that matter on your line-up."
        secondary={{ label: 'Browse communities', to: '/communities' }}
      />
    </div>
  );
}
