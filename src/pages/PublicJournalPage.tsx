import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  Compass,
  Flame,
  PenTool,
  Star,
} from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';
import PublicCta from '../components/public/PublicCta';
import { useCurrentUser } from '../contexts/CurrentUserContext';

const TOPICS = ['Technology', 'Design', 'Business', 'Money', 'Careers', 'Craft'];

/** Hand-picked samples that show the shape of the Journal. Not live articles. */
const FEATURED = [
  {
    category: 'Technology',
    title: 'The quiet craft of shipping small',
    summary:
      'Why the most useful software is often the least ambitious, and how to keep a product small enough to understand.',
    author: 'Ayo Balogun',
    read: '8 min read',
    accent: '#ff6b4a',
  },
  {
    category: 'Design',
    title: 'Designing for trust, not for applause',
    summary:
      'The difference between an interface that looks impressive and one someone is willing to depend on.',
    author: 'Muna Eze',
    read: '6 min read',
    accent: '#b69cff',
  },
  {
    category: 'Business',
    title: 'A calmer way to grow a team',
    summary:
      'What changes when you optimise for the people staying instead of the people arriving.',
    author: 'Tunde Bello',
    read: '11 min read',
    accent: '#82e6c8',
  },
];

const REASONS = [
  {
    icon: BookOpen,
    title: 'Field notes',
    body: 'People writing down what actually happened while they built the thing, not after the story got neat.',
  },
  {
    icon: Compass,
    title: 'Deep dives',
    body: 'Longer pieces that follow one idea all the way through — the trade-offs, the detours, the parts that worked.',
  },
  {
    icon: Flame,
    title: 'Honest lessons',
    body: 'What people got wrong, what they would do differently, and the advice they wish someone had given them.',
  },
];

export default function PublicJournalPage() {
  const user = useCurrentUser();
  const canonical =
    typeof window !== 'undefined' ? `${window.location.origin}/articles` : '/articles';

  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <Helmet>
        <title>The Kith Journal — stories for people who make things</title>
        <meta
          name="description"
          content="Field notes, deep dives and honest lessons from the people building in public on Kith. Technology, design, business, money, careers and craft."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="The Kith Journal" />
        <meta property="og:url" content={canonical} />
      </Helmet>

      <PageHero
        containerClassName="max-w-[1240px]"
        eyebrow={
          <Badge variant="primary" dot>
            The Kith Journal
          </Badge>
        }
        title={
          <>
            Stories for people
            <br />
            who <span className="font-serif font-normal italic tracking-[-0.03em] text-[#ffb65c]">make things.</span>
          </>
        }
        titleClassName="max-w-[16ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="Field notes, deep dives and honest lessons from the people building in public. Read one with coffee, or write the one only you can tell."
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
              to="/creators"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff1c] px-4 py-2.5 text-[12px] font-semibold text-[#f7f2e8]/75 transition-colors hover:border-[#ffffff3d] hover:text-[#f7f2e8]"
            >
              Meet the writers <ArrowRight size={14} />
            </Link>
          </>
        }
        visual={
          <div className="relative hidden h-[330px] w-full max-w-[440px] lg:block">
            <div className="landing-float absolute left-0 top-8 w-[230px] -rotate-6 overflow-hidden rounded-[22px] border border-white/15 bg-[#211a28]/88 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="h-20 bg-[linear-gradient(135deg,#ff6b4a,#ffb65c)]" />
              <div className="p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#ff6b4a]">
                  Technology
                </p>
                <p className="mt-1 font-display text-[14px] font-semibold leading-snug text-[#f7f2e8]">
                  The quiet craft of shipping small
                </p>
              </div>
            </div>

            <div className="landing-float-slow absolute right-0 top-0 z-10 w-[240px] rotate-3 overflow-hidden rounded-[22px] border border-white/15 bg-[#211a28]/88 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="h-24 bg-[linear-gradient(135deg,#b69cff,#82e6c8)]" />
              <div className="p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#b69cff]">
                  Design
                </p>
                <p className="mt-1 font-display text-[14px] font-semibold leading-snug text-[#f7f2e8]">
                  Designing for trust, not for applause
                </p>
              </div>
            </div>

            <div className="absolute bottom-4 left-6 inline-flex items-center gap-1.5 rounded-full border border-[#ffffff14] bg-[#0e0b13]/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f7f2e8]/70 backdrop-blur">
              <PenTool size={11} className="text-[#ffb65c]" /> Written by members
            </div>

            <span className="absolute bottom-12 right-8 h-2.5 w-2.5 rounded-full bg-[#b69cff] shadow-[0_0_24px_rgba(182,156,255,0.85)]" />
          </div>
        }
      />

      <section className="mx-auto max-w-[1240px] px-5 pt-10 md:px-8">
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-[#ffffff12] px-3.5 py-1.5 text-[12px] text-[#f7f2e8]/55"
            >
              {topic}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pt-14 md:px-8 md:pt-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" /> Featured stories
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-[1] tracking-[-0.05em] sm:text-4xl">
              A taste of the <span className="landing-serif text-[#f7f2e8]/45">Journal.</span>
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#f7f2e8]/35">
            <Star size={12} className="text-[#ffb65c]" /> Selected samples
          </span>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURED.map((story) => (
            <article
              key={story.title}
              className="flex h-full flex-col overflow-hidden rounded-[24px] border border-[#ffffff0f] bg-[#141019]"
            >
              <div
                className="h-28"
                style={{
                  background: `linear-gradient(135deg, ${story.accent}, color-mix(in oklab, ${story.accent} 35%, #0e0b13))`,
                }}
              />
              <div className="flex flex-1 flex-col p-5">
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: story.accent }}
                >
                  {story.category}
                </p>
                <h3 className="mt-2 font-display text-[18px] font-semibold leading-snug tracking-[-0.02em]">
                  {story.title}
                </h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#f7f2e8]/50">
                  {story.summary}
                </p>
                <div className="mt-4 flex items-center justify-between text-[11px] text-[#f7f2e8]/40">
                  <span>{story.author}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> {story.read}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="rounded-[28px] border border-[#ffffff0f] bg-[#141019] p-6 md:p-10">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#f7f2e8]/35">
              What the Journal is for
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              Reading that respects your time.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {REASONS.map((item) => (
              <div key={item.title} className="rounded-[20px] border border-[#ffffff0a] bg-[#0e0b13]/50 p-5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffffff08] text-[#ffb65c]">
                  <item.icon size={16} />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#f7f2e8]/50">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicCta
        title="The Journal is inside Kith."
        body="Open the app to read the latest stories, follow the writers you like, and publish the one only you can tell."
        secondary={{ label: 'Meet the creators', to: '/creators' }}
      />
    </div>
  );
}
