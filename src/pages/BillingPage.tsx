import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  cancelCommunityMembership,
  formatPrice,
  getMyMemberships,
  getReceipt,
  type MembershipReceipt,
  type MyMembershipsResponse,
  type Receipt,
} from '../lib/payments';

function date(value: string | null, withTime = false): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function stateBadge(state: string): { label: string; className: string } {
  if (state === 'active') return { label: 'Active', className: 'bg-green-500/12 text-green-600' };
  if (state === 'non-renewing') return { label: 'Renewal cancelled', className: 'bg-amber-500/12 text-amber-600' };
  if (state === 'grace') return { label: 'Grace period', className: 'bg-amber-500/15 text-amber-700' };
  if (state === 'pending') return { label: 'Pending', className: 'bg-foreground/10 text-foreground/60' };
  return { label: 'Ended', className: 'bg-red-500/12 text-red-600' };
}

function ReceiptModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReceipt(orderId)
      .then(result => {
        if (!cancelled) setReceipt(result);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this receipt');
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close receipt"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--ds-muted-foreground)] hover:bg-foreground/10"
        >
          <X size={16} />
        </button>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        ) : !receipt ? (
          <div className="flex items-center gap-2 py-10 text-sm text-[var(--ds-muted-foreground)]">
            <Loader2 className="animate-spin" size={16} /> Loading receipt…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">
              <ReceiptText size={15} /> Receipt
            </div>
            <h2 className="mt-2 text-xl font-bold">{receipt.title}</h2>
            <p className="mt-1 text-sm text-[var(--ds-muted-foreground)]">
              Paid {date(receipt.paidAt, true)} · {receipt.provider}
            </p>

            <dl className="mt-5 space-y-2 border-t border-[var(--ds-border)] pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-muted-foreground)]">Amount</dt>
                <dd className="font-semibold">{formatPrice(receipt.amountCents, receipt.currency)}</dd>
              </div>
              {receipt.periodStart && receipt.periodEnd && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--ds-muted-foreground)]">Period paid for</dt>
                  <dd className="text-right font-medium">
                    {date(receipt.periodStart)} – {date(receipt.periodEnd)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-muted-foreground)]">Buyer</dt>
                <dd className="text-right font-medium">{receipt.buyer.name}</dd>
              </div>
              {receipt.seller && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--ds-muted-foreground)]">Paid to</dt>
                  <dd className="text-right font-medium">{receipt.seller.name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-muted-foreground)]">Reference</dt>
                <dd className="text-right font-mono text-xs">{receipt.orderId}</dd>
              </div>
              {receipt.providerTransactionId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--ds-muted-foreground)]">Paystack transaction</dt>
                  <dd className="text-right font-mono text-xs">{receipt.providerTransactionId}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-muted-foreground)]">Status</dt>
                <dd className="text-right font-medium capitalize">{receipt.status}</dd>
              </div>
            </dl>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
              >
                <Printer size={15} /> Print / save PDF
              </button>
              <button
                onClick={onClose}
                className="rounded-full border border-[var(--ds-border)] px-4 py-2.5 text-sm font-semibold hover:bg-foreground/5"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A buyer's billing home: membership cards, the period each payment covered, printable receipts and
 * cancellation that keeps the current paid period.
 */
export default function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<MyMembershipsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCommunity, setBusyCommunity] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const receiptId = searchParams.get('receipt');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMyMemberships());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your billing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (communityId: string, mode: 'period_end' | 'now') => {
    setBusyCommunity(communityId);
    try {
      const result = await cancelCommunityMembership(communityId, mode);
      if (!result.cancelled) {
        toast('There is no renewal to cancel for this membership.');
      } else if (mode === 'period_end' && result.accessUntil) {
        toast.success(`Renewal cancelled. You keep access until ${date(result.accessUntil)}.`);
      } else {
        toast.success('Membership cancelled.');
      }
      setConfirmCancel(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel the renewal');
    } finally {
      setBusyCommunity(null);
    }
  };

  const memberships = data?.memberships ?? [];
  const receipts = data?.receipts ?? [];
  const receiptsByCommunity = new Map<string, MembershipReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByCommunity.get(receipt.communityId) ?? [];
    list.push(receipt);
    receiptsByCommunity.set(receipt.communityId, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10 text-[var(--ds-foreground)]">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : undefined)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-muted-foreground)] hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing &amp; receipts</h1>
        <p className="mt-2 text-[var(--ds-muted-foreground)]">
          Community memberships, the period each payment covered, and every receipt.
        </p>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-control border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[var(--ds-muted-foreground)]">
          <Loader2 className="animate-spin" size={16} /> Loading your memberships…
        </div>
      ) : memberships.length === 0 && receipts.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-10 text-center">
          <CreditCard className="mx-auto text-[var(--ds-faint)]" size={32} />
          <p className="mt-3 text-sm font-semibold">Nothing billed yet</p>
          <p className="mt-1 text-sm text-[var(--ds-muted-foreground)]">
            Paid community memberships and their receipts show up here.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-bold">Memberships</h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-[var(--ds-muted-foreground)]">No active memberships.</p>
            ) : (
              memberships.map(membership => {
                const badge = stateBadge(membership.state);
                const history = receiptsByCommunity.get(membership.communityId) ?? [];
                return (
                  <div
                    key={membership.communityId}
                    className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-soft)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`/feed?view=community&id=${encodeURIComponent(membership.communityId)}`}
                          className="font-semibold hover:underline"
                        >
                          {membership.communityName}
                        </Link>
                        <p className="mt-0.5 text-sm text-[var(--ds-muted-foreground)]">
                          {formatPrice(membership.amountCents, membership.currency)} ·{' '}
                          {membership.interval === 'month' ? 'per month' : 'one-time'}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-[var(--ds-muted-foreground)]">
                          Last paid
                        </p>
                        <p className="mt-0.5 font-medium">{date(membership.lastPaidAt, true)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-[var(--ds-muted-foreground)]">
                          {membership.state === 'non-renewing' ? 'Access ends' : 'Current period ends'}
                        </p>
                        <p className="mt-0.5 font-medium">{date(membership.currentPeriodEnd)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-[var(--ds-muted-foreground)]">
                          {membership.state === 'grace' ? 'Removed on' : 'Next charge'}
                        </p>
                        <p className="mt-0.5 font-medium">
                          {membership.state === 'non-renewing'
                            ? 'Cancelled'
                            : membership.state === 'grace'
                              ? date(membership.accessUntil)
                              : membership.currentPeriodEnd
                                ? date(membership.currentPeriodEnd)
                                : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {membership.canCancelRenewal && (
                        <button
                          onClick={() => setConfirmCancel(membership.communityId)}
                          disabled={busyCommunity === membership.communityId}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ds-muted-foreground)] hover:bg-foreground/5 disabled:opacity-50"
                        >
                          {busyCommunity === membership.communityId && <Loader2 size={13} className="animate-spin" />}
                          Cancel renewal
                        </button>
                      )}
                      {(membership.state === 'expired' || membership.state === 'grace' || membership.state === 'non-renewing') && (
                        <Link
                          to={`/feed?view=community&id=${encodeURIComponent(membership.communityId)}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                        >
                          <RefreshCw size={13} /> Renew membership
                        </Link>
                      )}
                      {history[0] && (
                        <button
                          onClick={() => setSearchParams({ receipt: history[0].orderId })}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <ReceiptText size={13} /> Latest receipt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <CalendarClock size={15} /> Payment history
            </h2>
            {receipts.length === 0 ? (
              <p className="text-sm text-[var(--ds-muted-foreground)]">No payments yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--ds-border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--ds-muted)] text-[11px] uppercase tracking-widest text-[var(--ds-muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Paid</th>
                      <th className="px-4 py-3 font-semibold">For</th>
                      <th className="px-4 py-3 font-semibold">Period</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                      <th className="px-4 py-3 text-right font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ds-border)]">
                    {receipts.map(receipt => (
                      <tr key={receipt.orderId} className="bg-[var(--ds-surface)]">
                        <td className="px-4 py-3 text-[var(--ds-muted-foreground)]">{date(receipt.paidAt, true)}</td>
                        <td className="px-4 py-3 font-medium">{receipt.communityName}</td>
                        <td className="px-4 py-3 text-[var(--ds-muted-foreground)]">
                          {receipt.periodStart && receipt.periodEnd
                            ? `${date(receipt.periodStart)} – ${date(receipt.periodEnd)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatPrice(receipt.amountCents, receipt.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSearchParams({ receipt: receipt.orderId })}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {confirmCancel && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={() => setConfirmCancel(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6 shadow-2xl">
            <h2 className="text-lg font-bold">Cancel renewal?</h2>
            <p className="mt-2 text-sm text-[var(--ds-muted-foreground)]">
              Future charges stop now. You keep access until the end of the period you already paid for.
              There is no refund for the current period.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => cancel(confirmCancel, 'period_end')}
                disabled={busyCommunity === confirmCancel}
                className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                Cancel renewal, keep access
              </button>
              <button
                onClick={() => cancel(confirmCancel, 'now')}
                disabled={busyCommunity === confirmCancel}
                className="rounded-full border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Leave now and lose this period
              </button>
              <button
                onClick={() => setConfirmCancel(null)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ds-muted-foreground)] hover:bg-foreground/5"
              >
                Keep my membership
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptId && (
        <ReceiptModal
          orderId={receiptId}
          onClose={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('receipt');
            setSearchParams(next, { replace: true });
          }}
        />
      )}
    </div>
  );
}
