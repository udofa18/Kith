import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, Globe, Plus, Search, Sparkles, Users } from 'lucide-react';
import { db } from '../firebase';
import { feedService } from '../services/feedService';
import { queryKeys, STALE } from '../lib/queryClient';
import { COMMUNITY_CATEGORIES, categoryOf } from '../lib/communityCategories';
import { feeOf } from '../lib/communityPricing';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';
import CommunityDetailsModal from '../components/CommunityDetailsModal';
import PublicCommunityCard from '../components/public/PublicCommunityCard';
import { CommunityIcon } from '../components/CommunityCard';

type Sort = 'top' | 'new' | 'name';
type Price = 'any' | 'free' | 'paid';

const toMillis = (value: any) =>
  value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() || 0 : 0;

/**
 * Public community discovery.
 *
 * Lists communities and opens a details pop-up. It never renders the app's
 * channel list or a signed-in community view — entering the app is an explicit
 * "Open Kith" action, not a side effect of browsing.
 */
export default function CommunitiesPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<Sort>('top');
  const [price, setPrice] = useState<Price>('any');
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const detailsId = searchParams.get('community');

  const { data: communities = [], isLoading } = useQuery({
    queryKey: queryKeys.communities(),
    queryFn: () => feedService.getCommunities(),
    staleTime: STALE.communities,
  });

  // Membership is only used to label cards. Guests simply see every public circle.
  useEffect(() => {
    if (!user?.uid) {
      setJoined(new Set());
      return;
    }
    return onSnapshot(
      query(collectionGroup(db, 'members'), where('userId', '==', user.uid)),
      (snap) => setJoined(new Set(snap.docs.map((d) => d.ref.parent.parent!.id))),
      () => undefined,
    );
  }, [user?.uid]);

  const open = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('community', id);
        return next;
      },
      { replace: false },
    );
  };

  const close = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('community');
        return next;
      },
      { replace: true },
    );
  };

  const visible = useMemo(
    () =>
      (communities as any[]).filter((community) => {
        const isPrivate =
          community.isPrivate ||
          (community.membershipControl?.accessType &&
            community.membershipControl.accessType !== 'public');
        return !isPrivate;
      }),
    [communities],
  );

  const q = search.trim().toLowerCase();
  const results = useMemo(() => {
    const list = visible.filter((community) => {
      if (category !== 'all' && categoryOf(community) !== category) return false;
      const fee = feeOf(community);
      if (price === 'free' && fee) return false;
      if (price === 'paid' && !fee) return false;
      if (
        q &&
        !`${community.name} ${community.description ?? ''} ${(community.tags ?? []).join(' ')}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sort === 'new') sorted.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    else if (sort === 'name') sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else sorted.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
    return sorted;
  }, [visible, category, price, q, sort]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const community of visible) {
      const key = categoryOf(community);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [visible]);

  const chips = [
    { id: 'all', label: 'All' },
    ...COMMUNITY_CATEGORIES.filter((c) => counts.get(c.id) || c.id === category),
  ];

  const canonical =
    typeof window !== 'undefined' ? `${window.location.origin}/communities` : '/communities';

  const searchField = (
    <div className="relative w-full max-w-[560px]">
      <Search
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#f7f2e8]/40"
      />
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search communities, interests, people…"
        aria-label="Search communities"
        className="w-full rounded-full border border-[#ffffff20] bg-[#171120]/80 py-3.5 pl-12 pr-5 text-[15px] text-[#f7f2e8] outline-none backdrop-blur transition-colors placeholder:text-[#f7f2e8]/35 focus:border-[#ff6b4a]"
      />
    </div>
  );

  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <Helmet>
        <title>Communities — find your people on Kith</title>
        <meta
          name="description"
          content="Browse public communities on Kith: groups for makers, writers, builders, hobbyists and the niche corners in between. Preview a community before you join."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Communities on Kith" />
        <meta property="og:url" content={canonical} />
      </Helmet>
      <PageHero
        containerClassName="max-w-[1240px]"
        eyebrow={
          <Badge variant="primary" dot>
            Groups &amp; circles
          </Badge>
        }
        title={
          <>
            Communities<span className="text-primary">.</span>
          </>
        }
        titleClassName="max-w-[16ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="Find your people. Groups for the things you care about, from late-night build sessions to the niche corners only you know about."
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(user ? '/feed?view=communities' : '/login?mode=signup')}
              className="inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-5 py-3 text-[13px] font-bold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              {user ? <Plus size={16} /> : <Sparkles size={16} />}
              {user ? 'Create a community' : 'Open Kith to start one'}
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff14] px-3 py-2 text-[11px] text-[#f7f2e8]/55">
              <Globe size={12} className="text-[#82e6c8]" />
              {visible.length.toLocaleString('en-NG')} public circles
            </span>
          </>
        }
        visual={
          <div className="relative hidden h-[300px] w-full max-w-[420px] lg:block">
            <div className="landing-float absolute left-1/2 top-6 w-[250px] -translate-x-1/2 rounded-[1.75rem] border border-white/15 bg-[#211a28]/85 p-5 shadow-[0_30px_90px_-20px_rgba(255,107,74,0.45)] backdrop-blur">
              <div className="flex -space-x-3">
                {(visible.length ? visible.slice(0, 4) : [null, null, null, null]).map((community: any, i: number) =>
                  community ? (
                    <span key={community.id} className="block overflow-hidden rounded-xl ring-2 ring-[#211a28]">
                      <CommunityIcon community={community} size={54} />
                    </span>
                  ) : (
                    <span
                      key={i}
                      className="h-[54px] w-[54px] rounded-xl ring-2 ring-[#211a28]"
                      style={{ background: ['#ff6b4a', '#b69cff', '#82e6c8', '#ffb65c'][i] }}
                    />
                  ),
                )}
              </div>
              <p className="mt-3 font-display text-base font-semibold text-[#f7f2e8]">Find your circle</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#f7f2e8]/50">People who get it</p>
            </div>
            <div className="landing-float-slow absolute bottom-4 left-2 rounded-2xl border border-white/15 bg-[#211a28]/85 px-4 py-3 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.7)] backdrop-blur">
              <p className="font-display text-lg font-semibold text-[#f7f2e8]">
                {visible.length.toLocaleString('en-NG')}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f7f2e8]/50">communities</p>
            </div>
            <span className="absolute bottom-10 right-4 h-3 w-3 rounded-full bg-[#b69cff] shadow-[0_0_24px_rgba(182,156,255,0.85)]" />
          </div>
        }
      >
        {searchField}
      </PageHero>

      <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-8 md:px-8">
        <div className="flex flex-col gap-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((chip) => {
              const active = category === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setCategory(chip.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#ff6b4a] text-[#1a1210]'
                      : 'border border-[#ffffff12] text-[#f7f2e8]/60 hover:border-[#ffffff2b] hover:text-[#f7f2e8]'
                  }`}
                >
                  {chip.label}
                  {chip.id !== 'all' && (
                    <span className={`ml-1.5 ${active ? 'text-[#1a1210]/70' : 'text-[#f7f2e8]/35'}`}>
                      {counts.get(chip.id) ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<Sort>
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { id: 'top', label: 'Top' },
                  { id: 'new', label: 'New' },
                  { id: 'name', label: 'A–Z' },
                ]}
              />
              <Segmented<Price>
                label="Price"
                value={price}
                onChange={setPrice}
                options={[
                  { id: 'any', label: 'Any' },
                  { id: 'free', label: 'Free' },
                  { id: 'paid', label: 'Paid' },
                ]}
              />
            </div>
            <p className="text-xs text-[#f7f2e8]/40" aria-live="polite">
              {isLoading
                ? 'Gathering circles…'
                : `${results.length.toLocaleString('en-NG')} ${results.length === 1 ? 'community' : 'communities'}`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-[24px] border border-[#ffffff0f] bg-[#141019]">
                <div className="h-24 animate-pulse bg-[#ffffff08]" />
                <div className="space-y-3 p-4 pt-8">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[#ffffff0f]" />
                  <div className="h-3 w-full animate-pulse rounded bg-[#ffffff0a]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[#ffffff0a]" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((community: any) => (
              <PublicCommunityCard
                key={community.id}
                community={community}
                isMember={joined.has(community.id)}
                onClick={() => open(community.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-[26px] border border-dashed border-[#ffffff18] px-6 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ff6b4a]/10 text-[#ff6b4a]">
              <Users size={22} />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">No communities here yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#f7f2e8]/50">
              {q || category !== 'all' || price !== 'any'
                ? 'Try a different word, or clear the filters.'
                : 'Be the first to start one — the room is yours to make.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {(q || category !== 'all' || price !== 'any') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCategory('all');
                    setPrice('any');
                  }}
                  className="rounded-full border border-[#ffffff1c] px-4 py-2 text-sm font-semibold text-[#f7f2e8]/70 hover:text-[#f7f2e8]"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate(user ? '/feed?view=communities' : '/login?mode=signup')}
                className="inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-4 py-2 text-sm font-semibold text-[#171120]"
              >
                {user ? 'Create a community' : 'Join Kith'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <CommunityDetailsModal
        isOpen={!!detailsId}
        onClose={close}
        communityId={detailsId || ''}
        onJoinSuccess={() => {
          if (!detailsId) return;
          close();
          navigate(`/feed?view=community&id=${detailsId}`);
        }}
      />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-[#f7f2e8]/30 sm:block">
        {label}
      </span>
      <div className="inline-flex rounded-full border border-[#ffffff10] bg-[#15101d] p-1">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'bg-[#f7f2e8] text-[#171120]' : 'text-[#f7f2e8]/50 hover:text-[#f7f2e8]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
