import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowUpRight, Download, Edit3, Eye, Megaphone, Package, Plus, ShoppingBag, Star, TrendingUp, Wallet } from 'lucide-react';
import { auth } from '../firebase';
import { supabase } from '../supabase';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import { typeLabel } from '../components/marketplace/MarketCard';
import { BalanceResponse, beginCheckout, downloadProduct, formatPrice, getCreatorBalance } from '../lib/payments';
import { cn } from '../lib/cn';

type Tab = 'products' | 'sales' | 'purchases';

interface ProductRow {
  id: string;
  title: string;
  product_type: string | null;
  cover_url: string | null;
  price_cents: number;
  currency: string;
  sales_count: number;
  rating_avg: number | string | null;
  rating_count: number;
  status: 'draft' | 'published' | 'paused' | 'archived';
  promoted_until: string | null;
}

/** Must match PRODUCT_PROMO_TIERS in api/_lib/payments.ts. The server sets the real price. */
const PROMO_TIERS = [
  { id: 'promo_7d', label: '7 days', cents: 500 },
  { id: 'promo_30d', label: '30 days', cents: 1500 },
] as const;

interface SaleRow {
  id: string;
  product_id: string;
  unit_price_cents: number;
  creator_amount_cents: number;
  currency: string;
  products: { title: string } | null;
  orders: { status: string; paid_at: string | null } | null;
}

interface PurchaseRow {
  id: string;
  product_id: string;
  price_cents: number | null;
  created_at: string;
  products: { title: string; product_type: string | null; cover_url: string | null; currency: string } | null;
}

const MONTHS = 6;

function lastMonths(count: number): Array<{ key: string; label: string }> {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
    };
  });
}

export default function Dashboard() {
  const uid = auth.currentUser?.uid ?? null;
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [productRes, saleRes, purchaseRes, balanceRes] = await Promise.all([
        supabase!
          .from('products')
          .select('id, title, product_type, cover_url, price_cents, currency, sales_count, rating_avg, rating_count, status, promoted_until')
          .eq('creator_uid', uid)
          .order('created_at', { ascending: false }),
        supabase!
          .from('order_items')
          .select('id, product_id, unit_price_cents, creator_amount_cents, currency, products(title), orders!inner(status, paid_at)')
          .eq('creator_id', uid)
          .eq('orders.status', 'paid')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase!
          .from('purchases')
          .select('id, product_id, price_cents, created_at, products(title, product_type, cover_url, currency)')
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
        getCreatorBalance().catch(() => null),
      ]);
      if (cancelled) return;

      const firstError = productRes.error ?? saleRes.error ?? purchaseRes.error;
      if (firstError) setError(firstError.message);
      setProducts((productRes.data ?? []) as ProductRow[]);
      setSales((saleRes.data ?? []) as unknown as SaleRow[]);
      setPurchases((purchaseRes.data ?? []) as unknown as PurchaseRow[]);
      setBalance(balanceRes);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const stats = useMemo(() => {
    const usdSales = sales.filter(s => s.currency === 'USD');
    const revenueCents = usdSales.reduce((acc, s) => acc + Number(s.creator_amount_cents || 0), 0);
    const published = products.filter(p => p.status === 'published').length;
    const rated = products.filter(p => p.rating_count > 0);
    const reviews = rated.reduce((acc, p) => acc + p.rating_count, 0);
    const weighted = rated.reduce((acc, p) => acc + Number(p.rating_avg || 0) * p.rating_count, 0);
    return {
      revenueCents,
      salesCount: sales.length,
      published,
      rating: reviews > 0 ? weighted / reviews : null,
      reviews,
    };
  }, [products, sales]);

  const monthly = useMemo(() => {
    const buckets = lastMonths(MONTHS);
    const totals = new Map(buckets.map(b => [b.key, 0]));
    for (const s of sales) {
      if (s.currency !== 'USD' || !s.orders?.paid_at) continue;
      const d = new Date(s.orders.paid_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + Number(s.creator_amount_cents || 0) / 100);
    }
    return buckets.map(b => ({ month: b.label, amount: Number((totals.get(b.key) ?? 0).toFixed(2)) }));
  }, [sales]);

  const hasRevenue = monthly.some(m => m.amount > 0);

  const handleDownload = async (productId: string) => {
    setDownloading(productId);
    try {
      await downloadProduct(productId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar text-foreground">
      <div className="mx-auto max-w-[1200px] space-y-8 px-6 pb-20 pt-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Creator dashboard</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Your business, at a glance</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/payouts" className="inline-flex items-center gap-2 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted">
              <Wallet size={16} />
              Payouts
              <Badge variant="warning">Coming soon</Badge>
            </Link>
            <Link to="/upload" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-[var(--ds-primary-hover)]">
              <Plus size={18} /> New product
            </Link>
          </div>
        </header>

        {!loading && (
          <div className="flex flex-col gap-4 rounded-card border border-warning/40 bg-warning/10 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-semibold">Payouts are coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Keep selling with Paystack. Paid sales are saved in your Kith balance until
                  withdrawals open.
                </p>
              </div>
            </div>
            <Link to="/payouts" className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
              View earnings
            </Link>
          </div>
        )}

        {!loading && balance && (
          <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-control bg-primary/12 text-primary">
                <Wallet size={18} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Available to withdraw</p>
                <p className="font-display text-2xl font-extrabold">{formatPrice(balance.availableCents, balance.currency)}</p>
                {balance.pendingCents > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(balance.pendingCents, balance.currency)} on hold until sales clear
                  </p>
                )}
                {(balance.balances ?? [])
                  .filter(b => b.currency !== 'USD' && (b.availableCents > 0 || b.pendingCents > 0))
                  .map(b => (
                    <p key={b.currency} className="text-xs text-muted-foreground">
                      {formatPrice(b.availableCents, b.currency)} {b.currency} balance
                      {b.withdrawable ? '' : ' · held in Kith, payouts coming soon'}
                    </p>
                  ))}
              </div>
            </div>
            <Link
              to="/payouts"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-[var(--ds-primary-hover)]"
            >
              <ArrowUpRight size={16} /> Withdraw
            </Link>
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">Some data couldn't load: {error}</p>
        )}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <StatCard icon={<TrendingUp size={18} />} label="USD revenue" value={formatPrice(stats.revenueCents, 'USD')} hint="Your share after fees" />
              <StatCard icon={<ShoppingBag size={18} />} label="Sales" value={String(stats.salesCount)} hint="Paid orders" />
              <StatCard icon={<Package size={18} />} label="Published" value={String(stats.published)} hint={`${products.length} total incl. drafts`} />
              <StatCard
                icon={<Star size={18} />}
                label="Average rating"
                value={stats.rating !== null ? stats.rating.toFixed(1) : '—'}
                hint={stats.reviews > 0 ? `From ${stats.reviews} reviews` : 'No reviews yet'}
              />
            </>
          )}
        </section>

        <Card variant="elevated" className="space-y-4 p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-semibold">Revenue</p>
              <p className="text-sm text-muted-foreground">Last six months, in USD</p>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : hasRevenue ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b4a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#ff6b4a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--ds-muted-foreground)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--ds-muted-foreground)', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatPrice(Math.round(Number(value) * 100), 'USD')}
                    contentStyle={{ background: 'var(--ds-surface-raised)', border: '1px solid var(--ds-border)', borderRadius: 12, color: 'var(--ds-foreground)' }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#ff6b4a" strokeWidth={2} fill="url(#revenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Revenue will show here once you make your first sale.</p>
          )}
        </Card>

        <div role="tablist" aria-label="Dashboard sections" className="flex gap-2 border-b border-border">
          {(
            [
              { id: 'products', label: 'Products', icon: <Package size={16} /> },
              { id: 'sales', label: 'Sales', icon: <ShoppingBag size={16} /> },
              { id: 'purchases', label: 'Purchases', icon: <Download size={16} /> },
            ] as const
          ).map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : tab === 'products' ? (
          products.length === 0 ? (
            <EmptyState
              icon={<Package size={20} />}
              title="No products yet"
              description="Publish a course, e-book, template, or tool and it appears here."
              action={<Link to="/upload" className="text-sm font-semibold text-primary hover:underline">Create your first product</Link>}
            />
          ) : (
            <ul className="space-y-3">
              {products.map(p => (
                <li key={p.id} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-control bg-muted">
                    {p.cover_url ? (
                      <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-faint"><Package size={18} /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{p.title}</p>
                      <Badge variant={p.status === 'published' ? 'success' : 'neutral'}>{p.status === 'published' ? 'Live' : 'Draft'}</Badge>
                      {p.promoted_until && new Date(p.promoted_until) > new Date() && (
                        <Badge variant="primary">Promoted until {new Date(p.promoted_until).toLocaleDateString()}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel(p.product_type)} · {p.price_cents === 0 ? 'Free' : formatPrice(p.price_cents, p.currency)} · {p.sales_count} sold
                      {p.rating_count > 0 && ` · ${Number(p.rating_avg).toFixed(1)} ★`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/products/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-sm font-semibold hover:bg-muted">
                      <Eye size={14} /> View
                    </Link>
                    <Link to={`/edit/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-sm font-semibold hover:bg-muted">
                      <Edit3 size={14} /> Edit
                    </Link>
                    {p.status === 'published' && <PromoteControl productId={p.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'sales' ? (
          sales.length === 0 ? (
            <EmptyState icon={<ShoppingBag size={20} />} title="No sales yet" description="Paid orders for your products show up here." />
          ) : (
            <div className="overflow-hidden rounded-card border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Price</th>
                    <th className="px-4 py-3 text-right font-semibold">You earn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sales.map(s => (
                    <tr key={s.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{s.products?.title ?? 'Product'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.orders?.paid_at ? new Date(s.orders.paid_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(s.unit_price_cents, s.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatPrice(s.creator_amount_cents, s.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<Download size={20} />}
            title="Nothing bought yet"
            description="Products you buy from other creators show up here."
            action={<Link to="/marketplace" className="text-sm font-semibold text-primary hover:underline">Browse the market</Link>}
          />
        ) : (
          <ul className="space-y-3">
            {purchases.map(p => (
              <li key={p.id} className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-control bg-muted">
                  {p.products?.cover_url && <img src={p.products.cover_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.products?.title ?? 'Product'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                    {p.price_cents !== null && ` · ${formatPrice(p.price_cents, p.products?.currency ?? 'USD')}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={downloading === p.product_id} onClick={() => handleDownload(p.product_id)} leftIcon={<Download size={14} />}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}


      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card variant="elevated" className="space-y-3 p-5">
      <span className="grid h-9 w-9 place-items-center rounded-control bg-primary/12 text-primary">{icon}</span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-extrabold">{value}</p>
      </div>
      <p className="text-xs text-faint">{hint}</p>
    </Card>
  );
}

function PromoteControl({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const promote = async (tierId: string) => {
    setBusy(true);
    try {
      const result = await beginCheckout('product_boost', productId, tierId);
      if (!result.authorizationUrl) throw new Error('Could not start checkout');
      window.location.href = result.authorizationUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start checkout');
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-1.5 text-sm font-semibold text-primary hover:bg-primary/20"
      >
        <Megaphone size={14} /> Promote
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PROMO_TIERS.map(t => (
        <Button key={t.id} size="sm" variant="outline" disabled={busy} loading={busy} onClick={() => promote(t.id)}>
          {t.label} · {formatPrice(t.cents, 'USD')}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
