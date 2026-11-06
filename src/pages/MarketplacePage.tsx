import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Search, ShoppingBag, TrendingUp } from 'lucide-react';
import { Badge, Button, EmptyState, Select, Skeleton } from '../components/ui';
import MarketCard, { typeLabel } from '../components/marketplace/MarketCard';
import { PromotedProducts, TopSellers } from '../components/marketplace/MarketSidebar';
import {
  fetchProducts,
  fetchTrending,
  MarketProduct,
  MarketQuery,
  PRODUCT_TYPES,
  PriceFilter,
  ProductType,
  SORTS,
  SortKey,
} from '../lib/marketplace';
import { cn } from '../lib/cn';

const PAGE_SIZE = 24;
const PRICE_OPTIONS: Array<{ id: PriceFilter; label: string }> = [
  { id: 'any', label: 'Any price' },
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Paid' },
];

export default function MarketplacePage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ProductType>('all');
  const [price, setPrice] = useState<PriceFilter>('any');
  const [sort, setSort] = useState<SortKey>('new');

  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trending, setTrending] = useState<MarketProduct[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchTrending().then(setTrending);
  }, []);

  const query: MarketQuery = useMemo(() => ({ search, type, price, sort }), [search, type, price, sort]);
  const filtersActive = search !== '' || type !== 'all' || price !== 'any';

  useEffect(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    fetchProducts(query, 0, PAGE_SIZE - 1).then(result => {
      if (requestId !== latestRequest.current) return;
      setProducts(result.rows);
      setHasMore(result.hasMore);
      setError(result.error);
      setLoading(false);
    });
  }, [query, reloadKey]);

  const loadMore = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoadingMore(true);
    const result = await fetchProducts(query, products.length, products.length + PAGE_SIZE - 1);
    if (requestId !== latestRequest.current) return;
    setProducts(prev => [...prev, ...result.rows]);
    setHasMore(result.hasMore);
    setError(result.error);
    setLoadingMore(false);
  }, [query, products.length]);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setType('all');
    setPrice('any');
  };

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar text-foreground">
      <section className="relative overflow-hidden border-b border-border bg-[var(--ds-brand-ink)] text-[var(--ds-brand-cream)]">
        <img
          src="/marketplace/hero-market.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-40 md:opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--ds-brand-ink)] via-[var(--ds-brand-ink)]/80 to-transparent md:via-[var(--ds-brand-ink)]/55" />
        <div className="relative mx-auto max-w-[1280px] space-y-8 px-6 pb-12 pt-14 md:pb-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-3">
              <Badge variant="primary">Digital products</Badge>
              <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
                Creator <span className="text-primary">Market</span>
              </h1>
              <p className="text-base leading-relaxed text-[var(--ds-brand-cream)]/70">
                Courses, e-books, templates, and tools from creators you can learn from and build with.
              </p>
            </div>
            <Link
              to="/upload"
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-[var(--ds-primary-hover)] md:self-auto"
            >
              <Plus size={18} /> Start selling
            </Link>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-brand-cream)]/50" size={20} />
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search courses, templates, creators…"
              aria-label="Search the marketplace"
              className="w-full rounded-full border border-[var(--ds-brand-cream)]/20 bg-[var(--ds-brand-ink-raised)]/80 py-3.5 pl-12 pr-5 text-[15px] text-[var(--ds-brand-cream)] outline-none backdrop-blur transition-colors placeholder:text-[var(--ds-brand-cream)]/40 focus:border-[var(--ds-brand-coral)]"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1280px] gap-8 px-6 pb-20 pt-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
        {!filtersActive && trending.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              <h2 className="text-lg font-bold">Trending now</h2>
            </div>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {trending.map(p => (
                <MarketCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-5">
          <div role="tablist" aria-label="Product type" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {PRODUCT_TYPES.map(t => {
              const active = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setType(t.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label="Price" className="inline-flex w-fit rounded-full border border-border bg-surface p-1">
              {PRICE_OPTIONS.map(o => {
                const active = price === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPrice(o.id)}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                      active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="market-sort" className="text-sm text-muted-foreground">
                Sort
              </label>
              <Select id="market-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)} className="w-56">
                {SORTS.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {!loading && !error && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {products.length === 0
                ? 'No products'
                : `${products.length}${hasMore ? '+' : ''} ${products.length === 1 ? 'product' : 'products'}`}
              {type !== 'all' ? ` · ${typeLabel(type)}` : ''}
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-3">
                  <Skeleton className="aspect-[4/3] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={<AlertTriangle size={20} />}
              title="Couldn't load the market"
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => setReloadKey(k => k + 1)}>
                  Try again
                </Button>
              }
            />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={20} />}
              title={filtersActive ? 'Nothing matches those filters' : 'No products yet'}
              description={
                filtersActive
                  ? 'Try a different search or category.'
                  : 'Be the first creator to sell something on Kith.'
              }
              action={
                filtersActive ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link to="/upload" className="text-sm font-semibold text-primary hover:underline">
                    Start selling
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                {products.map(p => (
                  <MarketCard key={p.id} product={p} />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <PromotedProducts />
          <TopSellers />
        </aside>
      </div>
    </div>
  );
}
