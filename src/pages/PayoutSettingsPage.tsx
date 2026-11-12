import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Clock, Loader2, Wallet } from 'lucide-react';
import { BalanceResponse, formatPrice, getCreatorBalance } from '../lib/payments';

export default function PayoutSettingsPage() {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'));

  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCreatorBalance()
      .then(result => {
        if (!cancelled) setBalance(result);
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load your balance');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-[var(--ds-muted-foreground)]">
        <Loader2 className="animate-spin" size={18} /> Loading your earnings...
      </div>
    );
  }

  const currency = balance?.currency ?? 'USD';
  const available = balance?.availableCents ?? 0;
  const pending = balance?.pendingCents ?? 0;
  const otherBalances = (balance?.balances ?? []).filter(
    b => b.currency !== currency && (b.availableCents > 0 || b.pendingCents > 0),
  );

  const errorBox = error ? (
    <p role="alert" className="flex items-start gap-2 rounded-control border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
    </p>
  ) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10 text-[var(--ds-foreground)]">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Earnings &amp; payouts</h1>
        <p className="mt-2 text-[var(--ds-muted-foreground)]">
          Sales are collected with Paystack and saved in your Kith balance. Withdrawals are coming
          soon.
        </p>
      </div>

      {errorBox}

      <div className="flex items-start gap-3 rounded-[var(--ds-radius-lg)] border border-warning/40 bg-warning/10 p-5">
        <Wallet className="mt-0.5 shrink-0 text-warning" size={20} />
        <div>
          <p className="font-semibold">Payouts are coming soon</p>
          <p className="mt-1 text-sm text-[var(--ds-muted-foreground)]">
            Keep selling. Every sale is held safely in your Kith balance and becomes withdrawable as
            soon as payouts open. You do not need to set anything up right now.
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">Available</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{formatPrice(available, currency)}</p>
          <p className="mt-1 text-xs text-[var(--ds-faint)]">Saved for you</p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">On hold</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{formatPrice(pending, currency)}</p>
          <p className="mt-1 text-xs text-[var(--ds-faint)]">
            {balance?.holdDays ? `Clears ${balance.holdDays} days after each sale` : 'Clearing soon'}
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">Lifetime earned</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{formatPrice(balance?.lifetimeCents ?? 0, currency)}</p>
          <p className="mt-1 text-xs text-[var(--ds-faint)]">After platform fees</p>
        </div>
      </section>

      {otherBalances.length > 0 && (
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5">
          <p className="text-sm font-semibold">Other balances</p>
          {otherBalances.map(b => (
            <p key={b.currency} className="mt-1 text-sm text-[var(--ds-muted-foreground)]">
              {formatPrice(b.availableCents, b.currency)} {b.currency} available
              {b.pendingCents > 0 ? ` · ${formatPrice(b.pendingCents, b.currency)} on hold` : ''}
            </p>
          ))}
        </div>
      )}

      {(balance?.earnings.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Clock size={16} /> Recent sales
          </h2>
          <ul className="divide-y divide-[var(--ds-border)] overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)]">
            {balance!.earnings.map(earning => {
              const cleared = new Date(earning.available_at) <= new Date();
              return (
                <li key={earning.id} className="flex items-center justify-between gap-4 bg-[var(--ds-surface)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Sale</p>
                    <p className="text-xs text-[var(--ds-muted-foreground)]">
                      {new Date(earning.created_at).toLocaleDateString()} · {cleared ? 'Available' : 'On hold'}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatPrice(earning.amount_cents, earning.currency)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(balance?.payouts.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold">Withdrawals</h2>
          <div className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--ds-muted)] text-xs uppercase tracking-widest text-[var(--ds-muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ds-border)]">
                {balance!.payouts.map(payout => (
                  <tr key={payout.id} className="bg-[var(--ds-surface)]">
                    <td className="px-4 py-3 text-[var(--ds-muted-foreground)]">{new Date(payout.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{payout.status}</span>
                      {payout.failure_reason && <span className="ml-2 text-xs text-destructive">{payout.failure_reason}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatPrice(payout.amount_cents, payout.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
