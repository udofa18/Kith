import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-hot-toast';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Hash,
  Palette,
  PenTool,
  Rss,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { ARTICLE_CATEGORIES, type ArticleDifficulty } from '../types/articles';
import { cn } from '../lib/cn';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import Avatar from '../components/ui/Avatar';
import ArticleCard from '../components/ArticleCard';
import ArticleCover from '../components/articles/ArticleCover';
import KithStamp from '../components/KithStamp';
import {
  articleTimestamp,
  authorName,
  categoryIconFor,
  categoryMeta,
  readMinutes,
} from '../components/articles/articleVisuals';

type SortOption = 'latest' | 'popular' | 'recommended' | 'following';

const PAGE_SIZE = 12;
const DIFFICULTIES: ArticleDifficulty[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

const SORTS: { id: SortOption; label: string; icon: LucideIcon }[] = [
  { id: 'latest', label: 'Latest', icon: Clock },
  { id: 'popular', label: 'Popular', icon: Flame },
  { id: 'recommended', label: 'For you', icon: Sparkles },
  { id: 'following', label: 'Following', icon: Users },
];

const SHELVES: { id: string; label: string; blurb: string; ids: string[]; icon: LucideIcon }[] = [
  {
    id: 'build',
    label: 'Build & ship',
    blurb: 'Engineering, AI and the tools around them',
    ids: ['tech', 'productivity', 'industry'],
    icon: Terminal,
  },
  {
    id: 'craft',
    label: 'Design & story',
    blurb: 'Interfaces, identity and the creator economy',
    ids: ['design', 'creator', 'lifestyle'],
    icon: Palette,
  },
  {
    id: 'work',
    label: 'Work & money',
    blurb: 'Careers, business and personal finance',
    ids: ['business', 'finance', 'career'],
    icon: Briefcase,
  },
];

export default function ArticlesPage() {
  const navigate = useNavigate();
  const feedRef = useRef<HTMLDivElement>(null);

  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [activeShelf, setActiveShelf] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<ArticleDifficulty | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  const [trending, setTrending] = useState<any[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [voices, setVoices] = useState<{ id: string; name: string; count: number }[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!reset && (!lastDoc || loadingMore)) return;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const constraints: QueryConstraint[] = [
          where('status', '==', 'published'),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE),
        ];
        const q =
          !reset && lastDoc
            ? query(collection(db, 'articles'), ...constraints, startAfter(lastDoc))
            : query(collection(db, 'articles'), ...constraints);
        const snap = await getDocs(q);
        const next: any[] = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) }));
        setArticles((prev) => (reset ? next : [...prev, ...next]));
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (error) {
        console.error('Error loading articles:', error);
        toast.error('The journal is taking a moment. Try again shortly.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [lastDoc, loadingMore],
  );

  useEffect(() => {
    void loadPage(true);
    // The first page is intentionally loaded once; pagination uses the button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(collection(db, 'users', uid, 'following'))
      .then((snap) => setFollowingIds(snap.docs.map((docSnap) => docSnap.id)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const loadSidebar = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'articles'), where('status', '==', 'published'), limit(60)),
        );
        const all: any[] = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) }));

        setTrending(
          [...all]
            .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0))
            .slice(0, 5),
        );

        const catCounts: Record<string, number> = {};
        all.forEach((article) => {
          if (article.primaryCategoryId) {
            catCounts[article.primaryCategoryId] = (catCounts[article.primaryCategoryId] || 0) + 1;
          }
        });
        setCategoryCounts(catCounts);

        const tagCounts = new Map<string, number>();
        all.forEach((article) => {
          (article.tags || []).forEach((tag: string) => {
            const clean = String(tag).trim();
            if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
          });
        });
        setTopics(
          [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 16)
            .map(([tag]) => tag),
        );

        const voiceMap = new Map<string, { id: string; name: string; count: number }>();
        all.forEach((article) => {
          const id = article.authorUid;
          if (!id) return;
          const existing = voiceMap.get(id);
          if (existing) existing.count += 1;
          else voiceMap.set(id, { id, name: authorName(article), count: 1 });
        });
        setVoices([...voiceMap.values()].sort((a, b) => b.count - a.count).slice(0, 4));
      } catch (error) {
        console.error('Error loading journal sidebar:', error);
      }
    };
    void loadSidebar();
  }, []);

  const activeShelfData = SHELVES.find((shelf) => shelf.id === activeShelf) || null;
  const activeCategoryData = categoryMeta(activeCategory || undefined);
  const isFiltering = Boolean(
    searchQuery.trim() ||
      activeCategory ||
      activeSubcategory ||
      activeShelf ||
      activeTag ||
      difficulty ||
      sortBy !== 'latest',
  );

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    let list = articles.filter((article) => {
      if (activeCategory && article.primaryCategoryId !== activeCategory) return false;
      if (activeSubcategory && article.subcategory !== activeSubcategory) return false;
      if (activeShelfData && !activeShelfData.ids.includes(article.primaryCategoryId)) return false;
      if (difficulty && article.difficulty !== difficulty) return false;
      if (activeTag && !(article.tags || []).some((tag: string) => String(tag).toLowerCase() === activeTag.toLowerCase())) {
        return false;
      }
      if (sortBy === 'following' && !followingIds.includes(article.authorUid)) return false;
      if (needle) {
        const haystack = [
          article.title,
          article.subtitle,
          article.authorName,
          article.subcategory,
          ...(article.tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    if (sortBy === 'popular') {
      list = [...list].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
    } else if (sortBy === 'recommended') {
      list = [...list].sort((a, b) => {
        const aFollowed = followingIds.includes(a.authorUid) ? 1 : 0;
        const bFollowed = followingIds.includes(b.authorUid) ? 1 : 0;
        if (aFollowed !== bFollowed) return bFollowed - aFollowed;
        return (b.viewsCount || 0) - (a.viewsCount || 0);
      });
    } else {
      list = [...list].sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
    }

    return list;
  }, [
    articles,
    searchQuery,
    activeCategory,
    activeSubcategory,
    activeShelfData,
    difficulty,
    activeTag,
    sortBy,
    followingIds,
  ]);

  const featured = useMemo(() => {
    if (isFiltering || articles.length === 0) return null;
    return [...articles].sort(
      (a, b) =>
        Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)) ||
        (b.viewsCount || 0) - (a.viewsCount || 0),
    )[0];
  }, [articles, isFiltering]);

  const feed = featured ? filtered.filter((article) => article.id !== featured.id) : filtered;

  const stats = useMemo(
    () => ({
      stories: articles.length,
      voices: new Set(articles.map((article) => article.authorUid).filter(Boolean)).size,
      topics: new Set(articles.flatMap((article) => article.tags || [])).size,
    }),
    [articles],
  );

  const clearFilters = () => {
    setSearchQuery('');
    setActiveCategory(null);
    setActiveSubcategory(null);
    setActiveShelf(null);
    setActiveTag(null);
    setDifficulty(null);
    setSortBy('latest');
  };

  const selectCategory = (id: string | null) => {
    setActiveCategory((current) => (current === id ? null : id));
    setActiveSubcategory(null);
    setActiveShelf(null);
  };

  const selectShelf = (id: string) => {
    setActiveShelf((current) => (current === id ? null : id));
    setActiveCategory(null);
    setActiveSubcategory(null);
  };

  const startWriting = () => {
    if (!auth.currentUser) {
      toast.error('Sign in to write a story');
      navigate('/login', { state: { from: { pathname: '/write' } } });
      return;
    }
    navigate('/write');
  };

  const scrollToFeed = () => {
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const canonical = typeof window !== 'undefined' ? `${window.location.origin}/articles` : '/articles';
  const description =
    'Long-form stories from the Kith community: engineering, design, business, money, careers and the craft of making things with other people.';

  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'The Kith Journal',
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Kith', url: typeof window !== 'undefined' ? window.location.origin : '' },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: filtered.slice(0, 10).map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${canonical.replace('/articles', '')}/article/${article.id}`,
        name: article.title,
      })),
    },
  };

  return (
    <div className="min-h-full bg-background pb-20 text-foreground">
      <Helmet>
        <title>The Kith Journal — Stories for people who make things</title>
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content="Kith journal, articles, essays, technology, design, business, creator economy, community"
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="The Kith Journal" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${canonical.replace('/articles', '')}/logo.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="The Kith Journal" />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${canonical.replace('/articles', '')}/logo.jpg`} />
        <script type="application/ld+json">{JSON.stringify(listSchema)}</script>
      </Helmet>

      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
        {/* Hero ------------------------------------------------------------- */}
        <section className="relative overflow-hidden rounded-panel border border-border bg-surface shadow-soft">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(circle at 8% 0%, color-mix(in oklab, var(--ds-brand-coral) 20%, transparent), transparent 42%), radial-gradient(circle at 92% 18%, color-mix(in oklab, var(--ds-brand-lilac) 18%, transparent), transparent 40%)',
            }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--ds-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--ds-border)_1px,transparent_1px)] [background-size:64px_64px] opacity-40 [mask-image:radial-gradient(ellipse_at_50%_20%,#000,transparent_72%)]" aria-hidden />

          <div className="relative grid items-center gap-10 px-5 py-9 sm:px-8 sm:py-11 lg:grid-cols-[1.12fr_0.88fr] lg:px-10 lg:py-14">
            <div>
              <Badge variant="primary" dot className="whitespace-nowrap">
                The Kith Journal
              </Badge>

              <h1 className="mt-4 max-w-[15ch] font-display text-[clamp(2.35rem,5.4vw,4.15rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-foreground">
                Stories for people who{' '}
                <span className="font-serif font-normal italic tracking-[-0.03em] text-primary">make things</span>.
              </h1>

              <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                Field notes, deep-dives and honest lessons from the people building in public. Read
                one with coffee, or write the one only you can tell.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Button size="lg" leftIcon={<PenTool size={17} />} onClick={startWriting}>
                  Start writing
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  rightIcon={<ArrowRight size={16} />}
                  onClick={scrollToFeed}
                >
                  Explore stories
                </Button>
              </div>

              <dl className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                {[
                  { label: 'stories', value: `${stats.stories}${hasMore ? '+' : ''}` },
                  { label: 'voices', value: stats.voices || '—' },
                  { label: 'topics', value: stats.topics || '—' },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-2">
                    <dt className="sr-only">{stat.label}</dt>
                    <dd className="font-display text-xl font-semibold tracking-[-0.04em] text-foreground">
                      {stat.value}
                    </dd>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </dl>
            </div>

            {/* Editorial illustration: a small stack of stories. */}
            <div className="relative hidden h-[330px] w-full justify-self-end lg:block" aria-hidden>
              <div className="landing-float absolute left-0 top-12 w-[230px] -rotate-6 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-float">
                <ArticleCover categoryId="tech" hideWordmark className="aspect-[16/11]" />
                <div className="p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-info">Technology</p>
                  <p className="mt-1 font-display text-sm font-semibold leading-snug tracking-[-0.03em]">
                    The quiet craft of shipping small
                  </p>
                </div>
              </div>

              <div className="landing-float-slow absolute right-0 top-0 z-20 w-[250px] rotate-3 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-float">
                <ArticleCover categoryId="design" hideWordmark className="aspect-[16/11]" showStamp />
                <div className="p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Design</p>
                  <p className="mt-1 font-display text-sm font-semibold leading-snug tracking-[-0.03em]">
                    Designing for trust, not for applause
                  </p>
                </div>
              </div>

              <div className="landing-float absolute bottom-2 right-8 z-10 w-[205px] rotate-[-3deg] overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lift [animation-delay:-2.6s]">
                <ArticleCover categoryId="business" hideWordmark className="aspect-[16/11]" />
                <div className="p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-warning">Business</p>
                  <p className="mt-1 font-display text-sm font-semibold leading-snug tracking-[-0.03em]">
                    A calmer way to grow a team
                  </p>
                </div>
              </div>

              <span className="absolute bottom-16 left-6 z-30 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] shadow-soft backdrop-blur-md">
                <Sparkles size={12} className="text-primary" />
                Fresh this week
              </span>

              <KithStamp color="currentColor" className="absolute -right-2 bottom-0 h-16 w-16 opacity-80" />
            </div>
          </div>
        </section>

        {/* Category rail --------------------------------------------------- */}
        <section className="mt-8" aria-labelledby="browse-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Browse</p>
              <h2 id="browse-heading" className="mt-0.5 font-display text-lg font-semibold tracking-[-0.035em]">
                Find your room
              </h2>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className={cn(
                'text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary',
                !isFiltering && 'invisible',
              )}
            >
              Reset all
            </button>
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => {
                setActiveCategory(null);
                setActiveSubcategory(null);
                setActiveShelf(null);
              }}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-colors',
                !activeCategory && !activeShelf
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              <Compass size={13} />
              All
            </button>

            {ARTICLE_CATEGORIES.map((category) => {
              const Icon = categoryIconFor(category.id);
              const active = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  <Icon size={13} />
                  {category.name}
                  <span className={cn('text-[10px] tabular-nums', active ? 'text-primary-foreground/70' : 'text-faint')}>
                    {categoryCounts[category.id] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {activeCategoryData && activeCategoryData.subcategories.length > 0 && (
            <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveSubcategory(null)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                  !activeSubcategory
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                All {activeCategoryData.name}
              </button>
              {activeCategoryData.subcategories.map((subcategory) => (
                <button
                  key={subcategory}
                  type="button"
                  onClick={() => setActiveSubcategory(subcategory)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                    activeSubcategory === subcategory
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {subcategory}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Curated shelves ------------------------------------------------- */}
        {!searchQuery && !activeCategory && !activeShelf && (
          <section className="mt-8 grid border-y border-border sm:grid-cols-3" aria-label="Curated shelves">
            {SHELVES.map((shelf, index) => {
              const Icon = shelf.icon;
              const count = shelf.ids.reduce((total, id) => total + (categoryCounts[id] || 0), 0);
              return (
                <button
                  key={shelf.id}
                  type="button"
                  onClick={() => selectShelf(shelf.id)}
                  className={cn(
                    'group flex items-start gap-3 py-4 text-left transition-colors hover:text-primary',
                    index > 0 && 'sm:border-l sm:border-border sm:pl-5',
                    index < SHELVES.length - 1 && 'border-b border-border sm:border-b-0',
                  )}
                >
                  <Icon size={17} className="mt-0.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-sm font-semibold tracking-[-0.02em]">{shelf.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{shelf.blurb}</span>
                    <span className="mt-2 block text-[9px] font-bold uppercase tracking-[0.14em] text-faint">
                      {count} stories
                    </span>
                  </span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_292px]">
          {/* Feed ---------------------------------------------------------- */}
          <div className="min-w-0">
            <div ref={feedRef} className="scroll-mt-3">
              {/* Sticky search + sort */}
              <div className="sticky top-0 z-30 border-b border-border bg-background/90 py-2 backdrop-blur-lg">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search stories, people or topics…"
                      aria-label="Search stories"
                      className="h-10 bg-surface pl-10 pr-9"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
                    {SORTS.map((option) => {
                      const Icon = option.icon;
                      const active = sortBy === option.id;
                      const disabled = option.id === 'following' && !auth.currentUser;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSortBy(option.id)}
                          title={disabled ? 'Sign in to see stories from people you follow' : option.label}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-2 text-[11px] font-semibold transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            disabled && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          <Icon size={13} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border px-1 pt-2">
                  <span className="mr-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">
                    <SlidersHorizontal size={11} />
                    Level
                  </span>
                  {DIFFICULTIES.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDifficulty((current) => (current === level ? null : level))}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
                        difficulty === level
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                      )}
                    >
                      {level}
                    </button>
                  ))}
                  {isFiltering && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
                    >
                      <X size={11} />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Active filter chips */}
              {isFiltering && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {activeShelfData && (
                    <FilterChip label={activeShelfData.label} onRemove={() => setActiveShelf(null)} />
                  )}
                  {activeCategoryData && (
                    <FilterChip label={activeCategoryData.name} onRemove={() => setActiveCategory(null)} />
                  )}
                  {activeSubcategory && (
                    <FilterChip label={activeSubcategory} onRemove={() => setActiveSubcategory(null)} />
                  )}
                  {difficulty && <FilterChip label={difficulty} onRemove={() => setDifficulty(null)} />}
                  {activeTag && <FilterChip label={`#${activeTag}`} onRemove={() => setActiveTag(null)} />}
                  {sortBy !== 'latest' && (
                    <FilterChip label={SORTS.find((s) => s.id === sortBy)?.label || sortBy} onRemove={() => setSortBy('latest')} />
                  )}
                </div>
              )}

              {/* Topic chips */}
              {topics.length > 0 && (
                <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Filter by topic">
                  <button
                    type="button"
                    onClick={() => setActiveTag(null)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
                      !activeTag
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    All topics
                  </button>
                  {topics.slice(0, 10).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag((current) => (current === tag ? null : tag))}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
                        activeTag === tag
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                      )}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Section header */}
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                    {searchQuery
                      ? 'Search'
                      : activeShelfData
                        ? 'Curated shelf'
                        : activeCategoryData
                          ? activeCategoryData.name
                          : 'The latest'}
                  </p>
                  <h2 className="mt-0.5 font-display text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
                    {searchQuery
                      ? `Results for “${searchQuery}”`
                      : activeShelfData
                        ? activeShelfData.label
                        : activeCategoryData
                          ? `Stories in ${activeCategoryData.name}`
                          : 'Fresh from the journal'}
                  </h2>
                </div>
                <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  {filtered.length}
                  {hasMore ? '+' : ''} {filtered.length === 1 ? 'story' : 'stories'}
                </p>
              </div>

              {/* Featured story */}
              {featured && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-faint">
                    <Star size={12} className="fill-warning text-warning" />
                    Featured story
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <ArticleCard article={featured} variant="featured" />
                </div>
              )}

              {/* Feed */}
              <div className={cn('space-y-4', featured ? 'mt-5' : 'mt-4')}>
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => <ArticleSkeleton key={index} />)
                ) : feed.length > 0 ? (
                  feed.map((article) => <ArticleCard key={article.id} article={article} variant="flat" />)
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={<Search size={20} />}
                    title={sortBy === 'following' ? 'Nothing from your circle yet' : 'No stories match yet'}
                    description={
                      sortBy === 'following'
                        ? 'Follow a few writers and their new stories will collect here.'
                        : 'Try a broader search, another level, or clear the filters to see everything.'
                    }
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button variant="soft" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                        {hasMore && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={loadingMore}
                            onClick={() => void loadPage(false)}
                          >
                            Load older stories
                          </Button>
                        )}
                      </div>
                    }
                  />
                ) : null}
              </div>

              {hasMore && !loading && filtered.length > 0 && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void loadPage(false)}
                    loading={loadingMore}
                    leftIcon={<BookOpen size={15} />}
                  >
                    Load more stories
                  </Button>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Showing {filtered.length} of the newest stories
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar ------------------------------------------------------- */}
          <aside className="space-y-6 self-start lg:sticky lg:top-4">
            <section className="border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em]">
                  <Flame size={15} className="text-primary" />
                  Trending now
                </h2>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-faint">Live</span>
              </div>
              <div className="space-y-3">
                {trending.length > 0 ? (
                  trending.map((article, index) => {
                    const category = categoryMeta(article.primaryCategoryId);
                    return (
                      <Link
                        key={article.id}
                        to={`/article/${article.id}`}
                        className="group flex gap-3 py-1 transition-colors"
                      >
                        <span className="font-serif text-xl italic leading-none text-faint transition-colors group-hover:text-primary">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-primary">
                            {article.title}
                          </p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-faint">
                            {category?.name || 'Journal'} · {readMinutes(article)} min
                          </p>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">Trending stories appear here as the journal grows.</p>
                )}
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em]">
                <Hash size={15} className="text-primary" />
                Topics
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Follow a thread.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {topics.length > 0 ? (
                  topics.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveTag((current) => (current === tag ? null : tag));
                        scrollToFeed();
                      }}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors',
                        activeTag === tag
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
                      )}
                    >
                      {tag}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Topics appear once a few stories are published.</p>
                )}
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h2 className="mb-2 flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em]">
                <TrendingUp size={15} className="text-success" />
                Voices to follow
              </h2>
              <div className="space-y-2">
                {voices.length > 0 ? (
                  voices.map((voice) => (
                    <Link
                      key={voice.id}
                      to={`/creators/${voice.id}`}
                      className="group flex items-center gap-2.5 py-1 transition-colors"
                    >
                      <Avatar seed={voice.id} size={30} alt="" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold transition-colors group-hover:text-primary">
                          {voice.name}
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-faint">
                          {voice.count} {voice.count === 1 ? 'story' : 'stories'}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-faint transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Writers appear here as stories are published.</p>
                )}
              </div>
            </section>

            <section className="relative border-t border-border pt-4">
              <KithStamp color="currentColor" className="pointer-events-none absolute right-0 top-4 h-12 w-12 opacity-40" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Open call</p>
              <h2 className="mt-1 max-w-[18ch] font-display text-lg font-semibold leading-tight tracking-[-0.04em]">
                Have a story only you can tell?
              </h2>
              <p className="mt-1.5 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
                Write it here. We will help with the reading time, the SEO and the pretty bits.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm" leftIcon={<PenTool size={14} />} onClick={startWriting}>
                  Write a story
                </Button>
                <a
                  href="/rss.xml"
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-faint transition-colors hover:text-primary"
                >
                  <Rss size={12} />
                  RSS
                </a>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 pl-2.5 pr-1 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-primary/15"
      >
        <X size={11} />
      </button>
    </span>
  );
}

function ArticleSkeleton() {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row">
      <Skeleton className="aspect-[16/10] w-full rounded-[1.1rem] sm:aspect-auto sm:h-auto sm:w-[250px] sm:min-h-[176px]" />
      <div className="flex-1 space-y-3 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}
