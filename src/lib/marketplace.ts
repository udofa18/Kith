import { supabase } from '../supabase';

export const PRODUCT_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'course', label: 'Courses' },
  { id: 'ebook', label: 'E-books' },
  { id: 'template', label: 'Templates' },
  { id: 'asset', label: 'Design assets' },
  { id: 'app', label: 'Apps & tools' },
  { id: 'music', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'other', label: 'Other' },
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number]['id'];
export type PriceFilter = 'any' | 'free' | 'paid';
export type SortKey = 'new' | 'popular' | 'rating' | 'price-asc' | 'price-desc';

export const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'new', label: 'Newest' },
  { id: 'popular', label: 'Most sold' },
  { id: 'rating', label: 'Top rated' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

export interface MarketProduct {
  id: string;
  title: string;
  product_type: string | null;
  cover_url: string | null;
  creator_name: string | null;
  creator_uid: string;
  price_cents: number;
  currency: string;
  sales_count: number;
  rating_avg: number | string | null;
  rating_count: number;
  created_at: string;
}

export interface MarketQuery {
  search: string;
  type: ProductType;
  price: PriceFilter;
  sort: SortKey;
}

const COLUMNS =
  'id, title, product_type, cover_url, creator_name, creator_uid, price_cents, currency, sales_count, rating_avg, rating_count, created_at';

/** Strips characters that have meaning in PostgREST filter syntax. */
function cleanSearch(term: string): string {
  return term.replace(/[%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** One page of published products. Only the public columns are read. */
export async function fetchProducts(query: MarketQuery, from: number, to: number) {
  if (!supabase) return { rows: [] as MarketProduct[], hasMore: false, error: 'Marketplace is not available right now' };

  let q = supabase.from('products').select(COLUMNS).eq('status', 'published');
  if (query.type !== 'all') q = q.eq('product_type', query.type);
  if (query.price === 'free') q = q.eq('price_cents', 0);
  if (query.price === 'paid') q = q.gt('price_cents', 0);

  const term = cleanSearch(query.search);
  if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,creator_name.ilike.%${term}%`);

  switch (query.sort) {
    case 'popular':
      q = q.order('sales_count', { ascending: false }).order('created_at', { ascending: false });
      break;
    case 'rating':
      q = q.order('rating_avg', { ascending: false }).order('rating_count', { ascending: false });
      break;
    case 'price-asc':
      q = q.order('price_cents', { ascending: true });
      break;
    case 'price-desc':
      q = q.order('price_cents', { ascending: false });
      break;
    default:
      q = q.order('created_at', { ascending: false });
  }

  // Fetch one extra row to know whether another page exists.
  const { data, error } = await q.range(from, to + 1);
  if (error) return { rows: [] as MarketProduct[], hasMore: false, error: error.message };
  const rows = (data ?? []) as MarketProduct[];
  return { rows: rows.slice(0, to - from + 1), hasMore: rows.length > to - from + 1, error: null };
}

/** Top sellers for the trending strip. Ignores the search and filters. */
export async function fetchTrending(limit = 4): Promise<MarketProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select(COLUMNS)
    .eq('status', 'published')
    .gt('sales_count', 0)
    .order('sales_count', { ascending: false })
    .limit(limit);
  return error ? [] : ((data ?? []) as MarketProduct[]);
}

export function ratingOf(p: Pick<MarketProduct, 'rating_avg' | 'rating_count'>): number | null {
  if (!p.rating_count) return null;
  const value = Number(p.rating_avg);
  return Number.isFinite(value) ? value : null;
}

export interface TopSeller {
  creator_uid: string;
  creator_name: string | null;
  product_count: number;
  total_sales: number;
  review_count: number;
  rating: number | string | null;
}

/** Ranked by total sales. Reads the public creator_leaderboard view (published products only). */
export async function fetchTopSellers(limit = 5): Promise<TopSeller[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('creator_leaderboard')
    .select('creator_uid, creator_name, product_count, total_sales, review_count, rating')
    .gt('total_sales', 0)
    .order('total_sales', { ascending: false })
    .limit(limit);
  return error ? [] : ((data ?? []) as TopSeller[]);
}

/** Products with an active promotion, newest promotion first. */
export async function fetchPromoted(limit = 3): Promise<MarketProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select(COLUMNS)
    .eq('status', 'published')
    .gt('promoted_until', new Date().toISOString())
    .order('promoted_until', { ascending: false })
    .limit(limit);
  return error ? [] : ((data ?? []) as MarketProduct[]);
}
