import { Link } from 'react-router-dom';
import { AlertCircle, CalendarClock, CreditCard, Loader2, ReceiptText } from 'lucide-react';
import { Badge, EmptyState, Skeleton, type BadgeVariant } from '../../components/ui';
import {
  formatPrice,
  type MembershipReceipt,
  type MembershipState,
  type MyMembershipsResponse,
} from '../../lib/payments';

function billingDate(value: string | null, withTime = false): string {
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

function stateBadge(state: MembershipState): { label: string; variant: BadgeVariant } {
  if (state === 'active') return { label: 'Active', variant: 'success' };
  if (state === 'non-renewing') return { label: 'Renewal cancelled', variant: 'warning' };
  if (state === 'grace') return { label: 'Grace period', variant: 'warning' };
  if (state === 'pending') return { label: 'Pending', variant: 'neutral' };
  return { label: 'Ended', variant: 'danger' };
}

function receiptHref(orderId: string): string {
  return `/billing?receipt=${encodeURIComponent(orderId)}`;
}

/**
 * Buyer-side billing inside the creator dashboard: community memberships, what each one costs,
 * when it renews or ends, and every payment with a link to its receipt.
 */
export default function DashboardBilling({
  data,
  loading,
  error,
}: {
  data: MyMembershipsResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-control border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
      </p>
    );
  }

  const memberships = data?.memberships ?? [];
  const receipts = data?.receipts ?? [];

  if (memberships.length === 0 && receipts.length === 0) {
    return (
      <EmptyState
        icon={<CreditCard size={20} />}
        title="No community subscriptions yet"
        description="Paid community memberships, renewal dates and receipts will appear here."
        action={
          <Link to="/billing" className="text-sm font-semibold text-primary hover:underline">
            Open billing &amp; receipts
          </Link>
        }
      />
    );
  }

  const receiptsByCommunity = new Map<string, MembershipReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByCommunity.get(receipt.communityId) ?? [];
    list.push(receipt);
    receiptsByCommunity.set(receipt.communityId, list);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Community subscriptions</h2>
          <Link to="/billing" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <ReceiptText size={13} /> All receipts
          </Link>
        </div>

        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active community subscriptions.</p>
        ) : (
          memberships.map(membership => {
            const badge = stateBadge(membership.state);
            const history = receiptsByCommunity.get(membership.communityId) ?? [];
            const nextCharge =
              membership.state === 'non-renewing'
                ? 'Cancelled'
                : membership.state === 'grace'
                  ? billingDate(membership.accessUntil)
                  : billingDate(membership.currentPeriodEnd);

            return (
              <div key={membership.communityId} className="rounded-card border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/feed?view=community&id=${encodeURIComponent(membership.communityId)}`}
                        className="font-semibold hover:underline"
                      >
                        {membership.communityName}
                      </Link>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatPrice(membership.amountCents, membership.currency)} ·{' '}
                      {membership.interval === 'month' ? 'per month' : 'one-time'}
                    </p>
                  </div>
                  {history[0] && (
                    <Link
                      to={receiptHref(history[0].orderId)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-xs font-semibold hover:bg-muted"
                    >
                      <ReceiptText size={13} /> Latest receipt
                    </Link>
                  )}
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last paid</p>
                    <p className="mt-0.5 font-medium">{billingDate(membership.lastPaidAt, true)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {membership.state === 'non-renewing' ? 'Access ends' : 'Current period ends'}
                    </p>
                    <p className="mt-0.5 font-medium">{billingDate(membership.currentPeriodEnd)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {membership.state === 'grace' ? 'Removed on' : 'Next charge'}
                    </p>
                    <p className="mt-0.5 font-medium">{nextCharge}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    to="/billing"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Manage subscription
                  </Link>
                  {(membership.state === 'expired' ||
                    membership.state === 'grace' ||
                    membership.state === 'non-renewing') && (
                    <Link
                      to={`/feed?view=community&id=${encodeURIComponent(membership.communityId)}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-[var(--ds-primary-hover)]"
                    >
                      Renew membership
                    </Link>
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
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                  <th className="px-4 py-3 font-semibold">For</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receipts.map(receipt => (
                  <tr key={receipt.orderId} className="hover:bg-muted/50">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {billingDate(receipt.paidAt, true)}
                    </td>
                    <td className="px-4 py-3 font-medium">{receipt.communityName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {receipt.periodStart && receipt.periodEnd
                        ? `${billingDate(receipt.periodStart)} – ${billingDate(receipt.periodEnd)}`
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {formatPrice(receipt.amountCents, receipt.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={receiptHref(receipt.orderId)} className="text-xs font-semibold text-primary hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
