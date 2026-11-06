import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, Check, Download, Edit3, Lock, PlayCircle, Star } from 'lucide-react';
import { auth } from '../firebase';
import { supabase } from '../supabase';
import { Badge, Button, Card, EmptyState, Skeleton, Textarea } from '../components/ui';
import BuyButton from '../components/marketplace/BuyButton';
import MarketCard, { initialsOf, typeLabel } from '../components/marketplace/MarketCard';
import { MarketProduct, ratingOf } from '../lib/marketplace';
import { downloadProduct, formatPrice } from '../lib/payments';
import { cn } from '../lib/cn';

interface ProductDetail extends MarketProduct {
  description: string | null;
  tags: string[] | null;
  status: string;
}

interface Lesson {
  id: string;
  section_title: string;
  title: string;
  duration_seconds: number | null;
  is_preview: boolean;
  content: string | null;
  position: number;
}

interface Review {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  user_id: string;
  users: { display_name: string | null; photo_url: string | null } | null;
}

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

export default function ProductPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<MarketProduct[]>([]);
  const [owned, setOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, user => setUid(user?.uid ?? null)), []);

  useEffect(() => {
    if (searchParams.get('cancelled')) {
      toast('Checkout cancelled. You haven\'t been charged.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setLoading(true);
    setMissing(false);

    const { data, error } = await supabase
      .from('products')
      .select('id, title, description, tags, product_type, cover_url, creator_uid, creator_name, price_cents, currency, sales_count, rating_avg, rating_count, created_at, status')
      .eq('id', id)
      .maybeSingle();

    if (error || !data || (data.status !== 'published' && data.creator_uid !== uid)) {
      setMissing(true);
      setLoading(false);
      return;
    }
    setProduct(data as ProductDetail);
    setCreatorName(data.creator_name);

    const [lessonRes, reviewRes, relatedRes, purchaseRes] = await Promise.all([
      supabase
        .from('product_lessons')
        .select('id, section_title, title, duration_seconds, is_preview, content, position')
        .eq('product_id', id)
        .order('position', { ascending: true }),
      supabase
        .from('product_reviews')
        .select('id, rating, body, created_at, user_id, users(display_name, photo_url)')
        .eq('product_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('products')
        .select('id, title, product_type, cover_url, creator_name, creator_uid, price_cents, currency, sales_count, rating_avg, rating_count, created_at')
        .eq('status', 'published')
        .eq('product_type', data.product_type)
        .neq('id', id)
        .order('sales_count', { ascending: false })
        .limit(4),
      uid
        ? supabase.from('purchases').select('id').eq('product_id', id).eq('status', 'completed').maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setLessons((lessonRes.data ?? []) as Lesson[]);
    setReviews((reviewRes.data ?? []) as unknown as Review[]);
    setRelated((relatedRes.data ?? []) as MarketProduct[]);
    setOwned(!!purchaseRes.data);
    setLoading(false);
  }, [id, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = !!product && uid === product.creator_uid;
  const canDownload = isOwner || owned;
  const rating = product ? ratingOf(product) : null;
  const isFree = product?.price_cents === 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-10">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <Skeleton className="aspect-[16/9] w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-72 lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (missing || !product) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-20">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title="Product not found"
          description="It may have been removed or is not published yet."
          action={
            <Link to="/marketplace" className="text-sm font-semibold text-primary hover:underline">
              Back to the market
            </Link>
          }
        />
      </div>
    );
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadProduct(product.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar text-foreground">
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="grid gap-10 lg:grid-cols-12">
          <main className="min-w-0 space-y-10 lg:col-span-8">
            <div className="overflow-hidden rounded-card border border-border bg-muted">
              {product.cover_url ? (
                <img src={product.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
              ) : (
                <div className="grid aspect-[16/9] w-full place-items-center bg-[linear-gradient(135deg,var(--ds-brand-coral),var(--ds-brand-lilac))]">
                  <Badge variant="neutral" className="bg-black/30 text-white">
                    {typeLabel(product.product_type)}
                  </Badge>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{typeLabel(product.product_type)}</Badge>
                {owned && <Badge variant="success">In your library</Badge>}
                {isOwner && <Badge variant="info">Your product</Badge>}
              </div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{product.title}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <Link to={`/creators/${product.creator_uid}`} className="flex items-center gap-2 font-semibold text-foreground hover:underline">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {initialsOf(creatorName)}
                  </span>
                  {creatorName || 'Creator'}
                </Link>
                {rating !== null && (
                  <span className="flex items-center gap-1.5">
                    <Star size={15} className="fill-accent text-accent" />
                    <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                    <span>({product.rating_count} reviews)</span>
                  </span>
                )}
                {product.sales_count > 0 && <span>{product.sales_count} sold</span>}
              </div>
            </div>

            {product.description && (
              <section className="space-y-3">
                <h2 className="text-lg font-bold">About this product</h2>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{product.description}</p>
              </section>
            )}

            {(product.product_type === 'course' || lessons.length > 0) && (
              <CurriculumSection lessons={lessons} canWatchAll={canDownload} />
            )}

            <ReviewsSection
              productId={product.id}
              reviews={reviews}
              uid={uid}
              canReview={owned && !isOwner}
              onSaved={load}
            />

            {related.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold">More like this</h2>
                <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                  {related.map(p => (
                    <MarketCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="lg:col-span-4">
            <div className="sticky top-8 space-y-5">
              <Card variant="elevated" className="space-y-6 p-6">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Price</p>
                    <p className={cn('text-3xl font-extrabold', isFree ? 'text-success' : 'text-foreground')}>
                      {isFree ? 'Free' : formatPrice(product.price_cents, product.currency)}
                    </p>
                  </div>
                </div>

                {canDownload ? (
                  <div className="space-y-3">
                    <Button fullWidth size="lg" onClick={handleDownload} loading={downloading} leftIcon={<Download size={18} />}>
                      Download
                    </Button>
                    <Link to="/library" className="block text-center text-sm font-semibold text-primary hover:underline">
                      Go to your library
                    </Link>
                  </div>
                ) : uid ? (
                  <BuyButton kind="product" targetId={product.id} label={isFree ? 'Get for free' : 'Buy now'} />
                ) : (
                  <Link
                    to="/login"
                    className="block rounded-full bg-primary px-6 py-3 text-center text-sm font-semibold text-primary-foreground shadow-glow-primary"
                  >
                    Sign in to {isFree ? 'get it' : 'buy'}
                  </Link>
                )}

                <ul className="space-y-3 border-t border-border pt-5 text-sm text-muted-foreground">
                  <Perk>Instant access after payment</Perk>
                  <Perk>Secure checkout with Stripe</Perk>
                  <Perk>Download any time from your library</Perk>
                </ul>
              </Card>

              {isOwner && (
                <Link
                  to={`/edit/${product.id}`}
                  className="flex items-center justify-center gap-2 rounded-full border border-border-strong px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  <Edit3 size={16} /> Edit product
                </Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <Check size={15} className="shrink-0 text-success" />
      {children}
    </li>
  );
}

function CurriculumSection({ lessons, canWatchAll }: { lessons: Lesson[]; canWatchAll: boolean }) {
  const [openPreview, setOpenPreview] = useState<string | null>(null);

  if (lessons.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Curriculum</h2>
        <p className="text-sm text-muted-foreground">No lessons are visible yet.</p>
      </section>
    );
  }

  const sections = lessons.reduce<Record<string, Lesson[]>>((acc, l) => {
    (acc[l.section_title || 'Lessons'] ??= []).push(l);
    return acc;
  }, {});

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Curriculum</h2>
        <span className="text-sm text-muted-foreground">{lessons.length} lessons</span>
      </div>
      {Object.entries(sections).map(([section, items]) => (
        <div key={section} className="overflow-hidden rounded-card border border-border">
          <div className="bg-muted px-4 py-2.5 text-sm font-semibold">{section}</div>
          <ul className="divide-y divide-border">
            {items.map(l => {
              const open = openPreview === l.id;
              return (
                <li key={l.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => l.is_preview && l.content && setOpenPreview(open ? null : l.id)}
                    className={cn('flex w-full items-center gap-3 text-left', l.is_preview && l.content ? 'cursor-pointer' : 'cursor-default')}
                  >
                    {l.is_preview ? (
                      <PlayCircle size={18} className="shrink-0 text-primary" />
                    ) : canWatchAll ? (
                      <PlayCircle size={18} className="shrink-0 text-foreground" />
                    ) : (
                      <Lock size={16} className="shrink-0 text-faint" />
                    )}
                    <span className="flex-1 text-sm">{l.title}</span>
                    {l.is_preview && <Badge variant="info">Preview</Badge>}
                    {l.duration_seconds ? (
                      <span className="text-xs text-muted-foreground">{formatDuration(l.duration_seconds)}</span>
                    ) : null}
                  </button>
                  {open && l.content && (
                    <p className="mt-3 whitespace-pre-line rounded-control bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                      {l.content}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {!canWatchAll && (
        <p className="text-xs text-faint">Buy the product to unlock the full course. Preview lessons are free.</p>
      )}
    </section>
  );
}

function ReviewsSection({
  productId,
  reviews,
  uid,
  canReview,
  onSaved,
}: {
  productId: string;
  reviews: Review[];
  uid: string | null;
  canReview: boolean;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const mine = reviews.find(r => r.user_id === uid);

  const submit = async () => {
    if (!supabase || !uid || rating < 1) return;
    setSaving(true);
    const { error } = await supabase.from('product_reviews').upsert(
      { product_id: productId, user_id: uid, rating, body: body.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,user_id' },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Thanks for your review');
    onSaved();
  };

  return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">Reviews</h2>

      {canReview && (
        <Card variant="outline" className="space-y-4 p-5">
          <p className="text-sm font-semibold">{mine ? 'Update your review' : 'Leave a review'}</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className="p-1"
              >
                <Star size={22} className={n <= rating ? 'fill-accent text-accent' : 'text-faint'} />
              </button>
            ))}
          </div>
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={2000}
            placeholder="What did you think?"
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={rating < 1} loading={saving}>
              {mine ? 'Update review' : 'Post review'}
            </Button>
          </div>
        </Card>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet. Reviews come from people who bought the product.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map(r => (
            <li key={r.id} className="space-y-2 rounded-card border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                    {initialsOf(r.users?.display_name ?? null)}
                  </span>
                  <span className="text-sm font-semibold">{r.users?.display_name || 'Buyer'}</span>
                </div>
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} size={14} className={n <= r.rating ? 'fill-accent text-accent' : 'text-faint'} />
                  ))}
                </div>
              </div>
              {r.body && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{r.body}</p>}
              <p className="text-xs text-faint">{new Date(r.created_at).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
