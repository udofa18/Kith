import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../supabase';
import { downloadProduct, getOrderStatus, isOrderId, OrderStatus, formatPrice } from '../lib/payments';

interface PurchaseRow {
  id: string;
  product_id: string;
  price_cents: number | null;
  created_at: string;
  products: {
    title: string;
    product_type: string | null;
    cover_url: string | null;
    creator_name: string | null;
    currency: string;
  } | null;
}

const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 2000;

export default function LibraryPage() {
  const [searchParams] = useSearchParams();
  // Paystack redirects with `reference` (our order id) and Stripe with `order`.
  const orderParam = searchParams.get('order') ?? searchParams.get('reference');
  const orderId = isOrderId(orderParam) ? orderParam : null;
  const checkoutCancelled = searchParams.get('cancelled') === '1';
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderStatus, setOrderStatus] = useState<OrderStatus['status'] | 'verifying' | null>(
    orderId ? 'verifying' : null,
  );

  const loadPurchases = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('purchases')
      .select('id, product_id, price_cents, created_at, products(title, product_type, cover_url, creator_name, currency)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (!error) setPurchases((data as unknown as PurchaseRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const handleDownload = async (productId: string) => {
    try {
      await downloadProduct(productId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await getOrderStatus(orderId);
        if (cancelled) return;
        setOrderStatus(status.status);
        if (status.status === 'paid' || status.status === 'failed') {
          loadPurchases();
          return;
        }
      } catch {
        // Transient error: keep polling until the attempt limit.
      }
      attempts += 1;
      if (!cancelled && attempts < MAX_POLLS) setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [orderId, loadPurchases]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8 text-[var(--ds-foreground)]">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
        <p className="text-[var(--ds-muted-foreground)] mt-2">Everything you've bought from creators.</p>
      </div>

      {orderId ? (
        <OrderBanner status={orderStatus} />
      ) : checkoutCancelled ? (
        <div className="flex items-center gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
          <XCircle className="text-[var(--ds-muted-foreground)]" size={20} />
          <p className="font-semibold">Checkout was cancelled. You can try again whenever you're ready.</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--ds-muted-foreground)]">
          <Loader2 className="animate-spin" size={18} /> Loading your library...
        </div>
      ) : purchases.length === 0 ? (
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-10 text-center">
          <BookOpen className="mx-auto mb-4 text-[var(--ds-muted-foreground)]" size={32} />
          <p className="font-semibold">No purchases yet</p>
          <Link to="/marketplace" className="inline-block mt-4 text-[var(--ds-primary)] font-semibold">
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {purchases.map(p => (
            <div
              key={p.id}
              className="group overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-soft)] hover:shadow-[var(--ds-shadow-lift)] transition-shadow"
            >
              <div className="aspect-[4/3] bg-[var(--ds-muted)] overflow-hidden">
                {p.products?.cover_url ? (
                  <img src={p.products.cover_url} alt="" className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-[var(--ds-muted-foreground)]">
                    <BookOpen size={28} />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-3">
                <Link to={`/products/${p.product_id}`} className="block space-y-1">
                  <p className="font-semibold truncate">{p.products?.title ?? 'Untitled product'}</p>
                  <p className="text-xs text-[var(--ds-muted-foreground)] truncate">
                    {p.products?.creator_name ?? 'Creator'}
                    {p.products?.product_type ? ` · ${p.products.product_type}` : ''}
                  </p>
                  {p.price_cents !== null && (
                    <p className="text-xs text-[var(--ds-faint)]">
                      Paid {formatPrice(p.price_cents, p.products?.currency ?? 'USD')}
                    </p>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => handleDownload(p.product_id)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ds-border-strong)] px-4 py-2 text-sm font-semibold hover:border-[var(--ds-ring)] transition-colors"
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderBanner({ status }: { status: OrderStatus['status'] | 'verifying' | null }) {
  if (status === null) return null;
  if (status === 'paid') {
    return (
      <div className="flex items-center gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-success)]/40 bg-[var(--ds-success)]/10 p-4">
        <CheckCircle2 className="text-[var(--ds-success)]" size={20} />
        <p className="font-semibold">Payment confirmed. Your purchase is ready below.</p>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-destructive)]/40 bg-[var(--ds-destructive)]/10 p-4">
        <XCircle className="text-[var(--ds-destructive)]" size={20} />
        <p className="font-semibold">This payment didn't go through. Please try again.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
      <Loader2 className="animate-spin text-[var(--ds-muted-foreground)]" size={20} />
      <p className="font-semibold">
        {status === 'verifying' ? 'Verifying your payment...' : 'Confirming your payment...'}
        <span className="ml-1 font-normal text-[var(--ds-muted-foreground)]">This can take a minute.</span>
      </p>
    </div>
  );
}
