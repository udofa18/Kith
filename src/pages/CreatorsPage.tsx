import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';
import PublicCta from '../components/public/PublicCta';
import { useCurrentUser } from '../contexts/CurrentUserContext';

const PROFILE_PARTS = [
  {
    icon: MessageCircle,
    title: 'What they think',
    body: 'Posts, replies and half-finished ideas, in the same feed as the people they talk to every day.',
  },
  {
    icon: Users,
    title: 'Where they gather',
    body: 'The communities they host or belong to, so you can meet them in a room instead of a résumé.',
  },
  {
    icon: CalendarDays,
    title: 'What they are planning',
    body: 'Upcoming events, live rooms and workshops, with the ones you can join first.',
  },
  {
    icon: ShoppingBag,
    title: 'What they make',
    body: 'The ebooks, courses, templates and services they have put into the marketplace.',
  },
];

const FOLLOWING = [
  'Follow someone to see their posts and updates first.',
  'Their communities and public work stay one tap away.',
  'Private profiles stay private — you only see what they choose to share.',
];

export default function CreatorsPage() {
  const user = useCurrentUser();
  const canonical =
    typeof window !== 'undefined' ? `${window.location.origin}/creators` : '/creators';

  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <Helmet>
        <title>Creators on Kith — the people behind the rooms</title>
        <meta
          name="description"
          content="Meet the hosts, makers, writers and teachers who keep their corners of Kith alive. A creator profile brings together their posts, communities, events and work."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Creators on Kith" />
        <meta property="og:url" content={canonical} />
      </Helmet>

      <PageHero
        containerClassName="max-w-[1240px]"
        eyebrow={
          <Badge variant="primary" dot>
            People who make things
          </Badge>
        }
        title={
          <>
            The people behind
            <br />
            <span className="font-serif font-normal italic tracking-[-0.03em] text-[#ffb65c]">
              the rooms.
            </span>
          </>
        }
        titleClassName="max-w-[16ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="Hosts, makers, writers and teachers. A Kith profile is less of a résumé and more of a place to see what someone is thinking about, gathering and making right now."
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
            <div className="landing-float absolute left-4 top-6 w-[260px] -rotate-2 rounded-[26px] border border-white/15 bg-[#211a28]/88 p-5 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(135deg,#ff6b4a,#b69cff)] text-[15px] font-bold text-[#171120]">
                  ME
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-[#f7f2e8]">
                    Muna Eze
                    <Sparkles size={12} className="text-[#82e6c8]" />
                  </p>
                  <p className="text-[11px] text-[#f7f2e8]/45">@munamakes · Lagos</p>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[#f7f2e8]/60">
                Designing calm software, hosting a Sunday type club, and teaching what I learn.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
                {[
                  ['128', 'posts'],
                  ['3', 'circles'],
                  ['9', 'events'],
                ].map(([value, label]) => (
                  <div key={label}>
                    <p className="font-display text-[15px] font-semibold text-[#f7f2e8]">{value}</p>
                    <p className="text-[9px] uppercase tracking-[0.16em] text-[#f7f2e8]/35">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="landing-float-slow absolute bottom-2 right-0 w-[190px] rotate-3 rounded-[22px] border border-white/15 bg-[#211a28]/88 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="flex items-center gap-2 text-[#82e6c8]">
                <Users size={14} />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Following</p>
              </div>
              <p className="mt-2 font-display text-[16px] font-semibold text-[#f7f2e8]">Type club</p>
              <p className="mt-1 text-[10px] text-[#f7f2e8]/40">Sundays · 18:00</p>
            </div>

            <span className="absolute bottom-14 left-6 h-2.5 w-2.5 rounded-full bg-[#ff6b4a] shadow-[0_0_24px_rgba(255,107,74,0.85)]" />
          </div>
        }
      />

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" /> On a profile
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-[1] tracking-[-0.05em] sm:text-4xl">
            One person, <span className="landing-serif text-[#f7f2e8]/45">in full.</span>
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROFILE_PARTS.map((part) => (
            <article
              key={part.title}
              className="rounded-[24px] border border-[#ffffff0f] bg-[#141019] p-5 transition-colors hover:border-[#ffb65c]/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ffffff08] text-[#82e6c8]">
                <part.icon size={18} />
              </span>
              <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.02em]">
                {part.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f7f2e8]/50">{part.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="grid gap-6 rounded-[28px] border border-[#ffffff0f] bg-[#141019] p-6 md:grid-cols-[1fr_0.9fr] md:p-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#f7f2e8]/35">
              Following
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              Keep the people you like close.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#f7f2e8]/50">
              Following is quiet. It does not send a request, and it does not change what a private
              profile shares. It simply puts their work where you will see it.
            </p>
          </div>

          <ul className="space-y-3 self-center">
            {FOLLOWING.map((item) => (
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
        title="The people are inside Kith."
        body="Open the app to follow the makers you meet in a community, see what they are working on, and join the rooms they host."
        secondary={{ label: 'Browse communities', to: '/communities' }}
      />
    </div>
  );
}
