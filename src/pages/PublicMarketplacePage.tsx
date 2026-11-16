import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Check,
  Layers,
  Play,
  ShoppingBag,
  Star,
  Wallet,
  Zap,
} from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';
import PublicCta from '../components/public/PublicCta';
import { useCurrentUser } from '../contexts/CurrentUserContext';

const CATEGORIES = [
  {
    icon: BookOpen,
    title: 'Ebooks & guides',
    body: 'The long version of a thing someone learned the hard way, written to be read in one sitting.',
  },
  {
    icon: Play,
    title: 'Courses & workshops',
    body: 'Structured lessons, recorded or live, from people who teach the way they work.',
  },
  {
    icon: Layers,
    title: 'Templates & kits',
    body: 'The files, systems and starting points that save you a week of figuring it out alone.',
  },
  {
    icon: Briefcase,
    title: 'Services & commissions',
    body: 'Hire the person whose work you already trust, with the scope and price agreed up front.',
  },
];

const SELLING = [
  {
    icon: Wallet,
    title: 'Priced in naira',
    body: 'Set your price in naira and get paid through Kith checkout. USD is available when you need it.',
  },
  {
    icon: Zap,
    title: 'Delivered instantly',
    body: 'Files unlock on payment. Courses stay in the buyer’s library, ready when they are.',
  },
  {
    icon: ShoppingBag,
    title: 'One place to run it',
    body: 'Listings, sales, reviews and payouts live beside your communities and events.',
  },
];

export default function PublicMarketplacePage() {
  const user = useCurrentUser();
  const canonical =
    typeof window !== 'undefined' ? `${window.location.origin}/marketplace` : '/marketplace';

  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <Helmet>
        <title>Marketplace on Kith — buy and sell work you believe in</title>
        <meta
          name="description"
          content="The Kith marketplace is where makers sell ebooks, courses, templates, kits and services to the communities that already follow them. Priced in naira, delivered instantly."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Marketplace on Kith" />
        <meta property="og:url" content={canonical} />
      </Helmet>

      <PageHero
        containerClassName="max-w-[1240px]"
        eyebrow={
          <Badge variant="primary" dot>
            Work worth paying for
          </Badge>
        }
        title={
          <>
            Buy from the
            <br />
            <span className="font-serif font-normal italic tracking-[-0.03em] text-[#ffb65c]">
              people you know.
            </span>
          </>
        }
        titleClassName="max-w-[16ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="The marketplace sits inside the communities where the work was made. Ebooks, courses, templates, kits and services — priced in naira, sold by creators you can actually talk to."
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
              Meet the makers <ArrowRight size={14} />
            </Link>
          </>
        }
        visual={
          <div className="relative hidden h-[320px] w-full max-w-[430px] lg:block">
            <div className="landing-float absolute left-2 top-6 w-[240px] -rotate-2 overflow-hidden rounded-[24px] border border-white/15 bg-[#211a28]/88 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="h-24 bg-[linear-gradient(135deg,#ff6b4a,#b69cff)]" />
              <div className="p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#f7f2e8]/40">
                  Ebook
                </p>
                <p className="mt-1 font-display text-[16px] font-semibold leading-snug text-[#f7f2e8]">
                  The quiet craft of shipping small
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display text-[15px] font-semibold text-[#ffb65c]">₦4,500</span>
                  <span className="flex items-center gap-1 text-[10px] text-[#f7f2e8]/45">
                    <Star size={10} className="fill-[#ffb65c] text-[#ffb65c]" /> 4.9
                  </span>
                </div>
              </div>
            </div>

            <div className="landing-float-slow absolute bottom-0 right-0 w-[210px] rotate-3 rounded-[24px] border border-white/15 bg-[#211a28]/88 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="flex items-center gap-2 text-[#82e6c8]">
                <Wallet size={14} />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Paid out</p>
              </div>
              <p className="mt-2 font-display text-[20px] font-semibold text-[#f7f2e8]">₦182,400</p>
              <p className="mt-1 text-[10px] text-[#f7f2e8]/40">this month · 31 sales</p>
            </div>

            <span className="absolute bottom-12 left-6 h-2.5 w-2.5 rounded-full bg-[#82e6c8] shadow-[0_0_24px_rgba(130,230,200,0.85)]" />
          </div>
        }
      />

      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" /> What you can buy
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-[1] tracking-[-0.05em] sm:text-4xl">
            Four ways to take <span className="landing-serif text-[#f7f2e8]/45">someone&apos;s work home.</span>
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {CATEGORIES.map((item) => (
            <article
              key={item.title}
              className="rounded-[24px] border border-[#ffffff0f] bg-[#141019] p-5 transition-colors hover:border-[#ffb65c]/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ffb65c]/10 text-[#ffb65c]">
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
                Selling
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                Put your work where your people are.
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#f7f2e8]/40">
              <Check size={12} className="text-[#82e6c8]" /> No separate storefront
            </span>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SELLING.map((item) => (
              <div key={item.title} className="rounded-[20px] border border-[#ffffff0a] bg-[#0e0b13]/50 p-5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffffff08] text-[#82e6c8]">
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
        title="The market is inside Kith."
        body="Open the app to browse what your communities are selling, buy in naira, and keep everything you purchase in your library."
        secondary={{ label: 'Browse communities', to: '/communities' }}
      />
    </div>
  );
}
