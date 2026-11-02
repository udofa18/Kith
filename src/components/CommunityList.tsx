import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { Plus, Search, Users } from 'lucide-react';
import { auth, db } from '../firebase';
import { feedService } from '../services/feedService';
import { queryKeys, STALE } from '../lib/queryClient';
import { COMMUNITY_CATEGORIES, categoriesFromInterests, categoryLabel, categoryOf } from '../lib/communityCategories';
import { fetchViewerContext } from '../features/feed/api/viewer';
import { feeOf } from '../lib/communityPricing';
import CommunityCard, { CommunityIcon } from './CommunityCard';
import CreateCommunityModal from './CreateCommunityModal';
import CommunityDetailsModal from './CommunityDetailsModal';

type Sort = 'foryou' | 'popular' | 'new';
type Price = 'any' | 'free' | 'paid';

const toMillis = (v: any) => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() || 0 : 0);

/** Discover communities: your communities, recommendations, and a filterable directory. */
export default function CommunityList() {
  const uid = auth.currentUser?.uid ?? null;
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<Sort>('foryou');
  const [price, setPrice] = useState<Price>('any');
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data: communities = [], isLoading } = useQuery({
    queryKey: queryKeys.communities(),
    queryFn: () => feedService.getCommunities(),
    staleTime: STALE.communities,
  });
  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: 5 * 60_000,
    enabled: !!uid,
  });

  // Which communities you're in (kept live so joining updates the page).
  useEffect(() => {
    if (!uid) { setJoined(new Set()); return; }
    return onSnapshot(
      query(collectionGroup(db, 'members'), where('userId', '==', uid)),
      snap => setJoined(new Set(snap.docs.map(d => d.ref.parent.parent!.id))),
      () => undefined,
    );
  }, [uid]);

  const isAdmin = auth.currentUser?.email === 'danieludofa452@gmail.com';
  const interests = useMemo(() => categoriesFromInterests(viewer?.interests), [viewer?.interests]);

  const visible = useMemo(() => communities.filter(c => {
    // Private communities are listed only for members, their creator and admins.
    const isPrivate = c.isPrivate || (c.membershipControl?.accessType && c.membershipControl.accessType !== 'public');
    return !isPrivate || joined.has(c.id) || c.creatorId === uid || isAdmin;
  }), [communities, joined, uid, isAdmin]);

  const mine = visible.filter(c => joined.has(c.id) || c.creatorId === uid);

  const score = (c: any) => {
    const members = Math.log10((c.memberCount || 0) + 1) * 3;
    const fresh = Math.max(0, 30 - (Date.now() - toMillis(c.createdAt)) / 86_400_000) / 10;
    return (interests.has(categoryOf(c)) ? 10 : 0) + members + fresh;
  };

  const q = search.trim().toLowerCase();
  const results = useMemo(() => {
    const list = visible.filter(c => {
      if (category !== 'all' && categoryOf(c) !== category) return false;
      if (price === 'free' && feeOf(c)) return false;
      if (price === 'paid' && !feeOf(c)) return false;
      if (q && !`${c.name} ${c.description ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === 'popular') sorted.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
    else if (sort === 'new') sorted.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    else sorted.sort((a, b) => Number(joined.has(a.id)) - Number(joined.has(b.id)) || score(b) - score(a));
    return sorted;
  }, [visible, category, price, q, sort, joined, interests]);

  // Recommendations: communities in your interest areas that you haven't joined.
  const recommended = useMemo(
    () => visible.filter(c => !joined.has(c.id) && c.creatorId !== uid && interests.has(categoryOf(c))).sort((a, b) => score(b) - score(a)).slice(0, 3),
    [visible, joined, uid, interests],
  );
  const browsing = !q && category === 'all' && price === 'any';

  // Only show categories that have communities (plus the one selected).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of visible) m.set(categoryOf(c), (m.get(categoryOf(c)) ?? 0) + 1);
    return m;
  }, [visible]);
  const chips = [{ id: 'all', label: 'All' }, ...COMMUNITY_CATEGORIES.filter(c => counts.get(c.id) || c.id === category)];

  const open = (id: string) => {
    if (joined.has(id)) setSearchParams({ view: 'community', id });
    else setDetailsId(id);
  };

  return (
    <div className="w-full h-full overflow-y-auto text-black dark:text-white">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Communities</h1>
            <p className="mt-1 text-black/55 dark:text-white/55">Find your people. Groups for the things you care about.</p>
          </div>
          {uid && (
            <button onClick={() => setShowCreate(true)} className="self-start sm:self-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Plus size={17} /> Create community
            </button>
          )}
        </div>

        {/* Search + sort */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search communities"
              aria-label="Search communities"
              className="w-full pl-11 pr-4 py-2.5 rounded-full bg-black/5 dark:bg-white/[0.06] border border-transparent text-sm outline-none focus:border-primary focus:bg-transparent transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented<Sort> value={sort} onChange={setSort} options={[{ id: 'foryou', label: uid ? 'For you' : 'Top' }, { id: 'popular', label: 'Popular' }, { id: 'new', label: 'New' }]} />
            <Segmented<Price> value={price} onChange={setPrice} options={[{ id: 'any', label: 'Any' }, { id: 'free', label: 'Free' }, { id: 'paid', label: 'Paid' }]} />
          </div>
        </div>

        {/* Categories */}
        <div className="mt-4 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c.id ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/[0.06] text-black/70 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              {c.label}
              {c.id !== 'all' && <span className={`ml-1.5 ${category === c.id ? 'opacity-80' : 'text-black/40 dark:text-white/40'}`}>{counts.get(c.id) ?? 0}</span>}
            </button>
          ))}
        </div>

        {/* Your communities */}
        {browsing && mine.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-black/60 dark:text-white/60 mb-3">Your communities</h2>
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {mine.map(c => (
                <button
                  key={c.id}
                  onClick={() => (joined.has(c.id) ? setSearchParams({ view: 'community', id: c.id }) : setDetailsId(c.id))}
                  className="shrink-0 w-[220px] flex items-center gap-3 p-3 rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors text-left"
                >
                  <CommunityIcon community={c} size={44} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">{c.name}</span>
                    <span className="block text-xs text-black/50 dark:text-white/50">
                      {c.creatorId === uid ? 'You created this' : `${c.memberCount || 0} members`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recommended */}
        {browsing && recommended.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-black/60 dark:text-white/60 mb-3">Recommended for you</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommended.map(c => <CommunityCard key={c.id} community={c} isMember={false} onClick={() => open(c.id)} />)}
            </div>
          </section>
        )}

        {/* Directory */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-black/60 dark:text-white/60 mb-3">
            {q ? `Results for “${search.trim()}”` : category === 'all' ? 'All communities' : categoryLabel(category)}
            {!isLoading && <span className="ml-1.5 font-normal text-black/40 dark:text-white/40">{results.length}</span>}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-pulse">
                  <div className="h-24 bg-black/5 dark:bg-white/5" />
                  <div className="p-4 space-y-2.5"><div className="h-4 w-1/2 rounded bg-black/10 dark:bg-white/10" /><div className="h-3 w-full rounded bg-black/10 dark:bg-white/10" /><div className="h-3 w-2/3 rounded bg-black/10 dark:bg-white/10" /></div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(c => <CommunityCard key={c.id} community={c} isMember={joined.has(c.id)} onClick={() => open(c.id)} />)}
            </div>
          ) : (
            <div className="py-16 px-6 text-center rounded-2xl border border-dashed border-black/15 dark:border-white/15">
              <span className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Users size={22} /></span>
              <p className="mt-4 font-semibold">No communities here yet</p>
              <p className="mt-1 text-sm text-black/55 dark:text-white/55">
                {q ? 'Try a different word, or clear the filters.' : 'Be the first to start one.'}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {(q || category !== 'all' || price !== 'any') && (
                  <button onClick={() => { setSearch(''); setCategory('all'); setPrice('any'); }} className="px-4 py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">
                    Clear filters
                  </button>
                )}
                {uid && (
                  <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">Create community</button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <CreateCommunityModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <CommunityDetailsModal
        isOpen={!!detailsId}
        onClose={() => setDetailsId(null)}
        communityId={detailsId || ''}
        onJoinSuccess={() => {
          if (detailsId) {
            setSearchParams({ view: 'community', id: detailsId });
            setDetailsId(null);
          }
        }}
      />
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex p-1 rounded-full bg-black/5 dark:bg-white/[0.06]" role="tablist">
      {options.map(o => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            value === o.id ? 'bg-background shadow-sm text-black dark:text-white' : 'text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
