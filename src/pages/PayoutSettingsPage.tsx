import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowUpRight, CheckCircle2, Clock, Loader2, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  BalanceResponse,
  ConnectStatus,
  formatPrice,
  getConnectStatus,
  getCreatorBalance,
  requestWithdrawal,
  startConnectOnboarding,
} from '../lib/payments';

const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', supported: false },
  { code: 'GH', name: 'Ghana', supported: false },
  { code: 'KE', name: 'Kenya', supported: false },
  { code: 'ZA', name: 'South Africa', supported: false },
  { code: 'US', name: 'United States', supported: true },
  { code: 'GB', name: 'United Kingdom', supported: true },
  { code: 'CA', name: 'Canada', supported: true },
  { code: 'AU', name: 'Australia', supported: true },
  { code: 'DE', name: 'Germany', supported: true },
  { code: 'FR', name: 'France', supported: true },
  { code: 'NL', name: 'Netherlands', supported: true },
  { code: 'IE', name: 'Ireland', supported: true },
  { code: 'ES', name: 'Spain', supported: true },
  { code: 'IT', name: 'Italy', supported: true },
];

const selectClass =
  'w-full rounded-[var(--ds-radius-sm)] border border-[var(--ds-border-strong)] bg-[var(--ds-surface)] px-4 py-3 text-sm text-[var(--ds-foreground)] outline-none focus:border-[var(--ds-ring)] transition-colors';

export default function PayoutSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'));

  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [country, setCountry] = useState('NG');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returning = searchParams.get('connect');

  const refresh = async () => {
    setError(null);
    const [statusResult, balanceResult] = await Promise.allSettled([getConnectStatus(), getCreatorBalance()]);
    const messages: string[] = [];

    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value);
      if (statusResult.value.country) setCountry(statusResult.value.country);
    } else {
      messages.push(statusResult.reason instanceof Error ? statusResult.reason.message : 'Could not load payout settings');
    }

    if (balanceResult.status === 'fulfilled') {
      setBalance(balanceResult.value);
    } else {
      messages.push(balanceResult.reason instanceof Error ? balanceResult.reason.message : 'Could not load your balance');
    }

    if (messages.length) setError(messages[0]);
    setLoading(false);
    return statusResult.status === 'fulfilled' ? statusResult.value : null;
  };

  useEffect(() => {
    refresh().then(next => {
      if (returning === 'return' && next?.payoutsEnabled) toast.success('Payouts are set up');
      if (returning) setSearchParams({}, { replace: true });
    });
    // Only on mount and when returning from Stripe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSetup = async () => {
    setStarting(true);
    setError(null);
    try {
      const url = await startConnectOnboarding(country);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payout setup');
      setStarting(false);
    }
  };

  const submitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Enter an amount to withdraw');
      return;
    }
    setWithdrawing(true);
    setError(null);
    try {
      await requestWithdrawal(cents);
      toast.success('Withdrawal sent to Stripe');
      setAmount('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-[var(--ds-muted-foreground)]">
        <Loader2 className="animate-spin" size={18} /> Loading your earnings...
      </div>
    );
  }

  const ready = !!status?.connected && !!status.payoutsEnabled;
  const started = !!status?.connected && !ready;
  const currency = balance?.currency ?? 'USD';
  const available = balance?.availableCents ?? 0;
  const pending = balance?.pendingCents ?? 0;
  const minimum = balance?.minWithdrawalCents ?? 1000;
  const canWithdraw = ready && available >= minimum;

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
          Sales are held in your Kith balance, then you withdraw to your bank through Stripe.
        </p>
      </div>

      {errorBox}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">Available</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{formatPrice(available, currency)}</p>
          <p className="mt-1 text-xs text-[var(--ds-faint)]">Ready to withdraw</p>
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

      {ready && (
        <div className="flex items-start gap-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-success)]/40 bg-[var(--ds-success)]/10 p-5">
          <CheckCircle2 className="mt-0.5 text-[var(--ds-success)]" size={20} />
          <div>
            <p className="font-semibold">Payouts are active</p>
            <p className="text-sm text-[var(--ds-muted-foreground)]">Withdrawals go to your connected Stripe account, then to your bank.</p>
          </div>
        </div>
      )}

      {ready && (
        <form
          onSubmit={submitWithdrawal}
          className="space-y-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6 shadow-[var(--ds-shadow-soft)]"
        >
          <div className="flex items-center gap-3">
            <Wallet className="text-[var(--ds-primary)]" size={20} />
            <p className="font-semibold">Withdraw</p>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--ds-muted-foreground)]">$</span>
              <input
                type="number"
                min={minimum / 100}
                max={available / 100}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={(available / 100).toFixed(2)}
                className="w-full rounded-[var(--ds-radius-sm)] border border-[var(--ds-border-strong)] bg-[var(--ds-surface)] py-3 pl-8 pr-24 text-sm text-[var(--ds-foreground)] outline-none transition-colors focus:border-[var(--ds-ring)]"
              />
              <button
                type="button"
                onClick={() => setAmount((available / 100).toFixed(2))}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-[var(--ds-border-strong)] px-3 py-1 text-xs font-semibold hover:bg-[var(--ds-muted)]"
              >
                Max
              </button>
            </div>
          </label>

          <p className="text-xs text-[var(--ds-faint)]">
            {available < minimum
              ? `You need at least ${formatPrice(minimum, currency)} available to withdraw.`
              : `Minimum ${formatPrice(minimum, currency)}. Funds arrive in your Stripe balance first, then your bank.`}
          </p>

          <button
            type="submit"
            disabled={withdrawing || !canWithdraw}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ds-primary)] px-6 py-3 font-semibold text-[var(--ds-primary-foreground)] transition-colors hover:bg-[var(--ds-primary-hover)] disabled:opacity-50"
          >
            {withdrawing ? <Loader2 className="animate-spin" size={18} /> : <ArrowUpRight size={18} />}
            {withdrawing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </form>
      )}

      {started && (
        <div className="flex items-start gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-strong)] bg-[var(--ds-surface)] p-6">
          <AlertCircle className="mt-0.5 text-[var(--ds-accent)]" size={22} />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <p className="font-semibold">Finish your setup</p>
              <p className="text-sm text-[var(--ds-muted-foreground)]">
                Stripe still needs some details before you can withdraw. Paid products stay locked until it's done.
              </p>
            </div>
            <button
              type="button"
              onClick={startSetup}
              disabled={starting}
              className="rounded-full bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--ds-primary-foreground)] transition-colors hover:bg-[var(--ds-primary-hover)] disabled:opacity-50"
            >
              {starting ? 'Opening Stripe...' : 'Continue on Stripe'}
            </button>
          </div>
        </div>
      )}

      {!status?.connected && (
        <div className="space-y-5 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6 shadow-[var(--ds-shadow-soft)]">
          <div className="flex items-center gap-3">
            <Wallet className="text-[var(--ds-primary)]" size={20} />
            <p className="font-semibold">Set up payouts</p>
          </div>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-muted-foreground)]">Country of your bank account</span>
            <select value={country} onChange={e => setCountry(e.target.value)} className={selectClass}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          {!COUNTRIES.find(c => c.code === country)?.supported && (
            <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-muted)] p-3 text-xs text-[var(--ds-muted-foreground)]">
              Stripe payouts aren't available for bank accounts in {COUNTRIES.find(c => c.code === country)?.name ?? 'this country'} yet.
              You can still sell — earnings stay in your Kith balance and become withdrawable as soon as payouts open there.
            </p>
          )}
          <p className="text-xs text-[var(--ds-faint)]">You'll confirm your identity and bank details on Stripe's secure pages.</p>
          <button
            type="button"
            onClick={startSetup}
            disabled={starting}
            className="w-full rounded-full bg-[var(--ds-primary)] px-6 py-3 font-semibold text-[var(--ds-primary-foreground)] transition-colors hover:bg-[var(--ds-primary-hover)] disabled:opacity-50"
          >
            {starting ? 'Opening Stripe...' : 'Set up payouts'}
          </button>
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
