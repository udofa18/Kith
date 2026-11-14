import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  formatPrice,
  getCommunityPaidMembers,
  type CommunityPaidMembersResponse,
  type PaidMemberRow,
} from '../../lib/payments';
import { toast } from 'react-hot-toast';

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

function period(row: PaidMemberRow): string {
  if (!row.periodStart && !row.periodEnd) return '—';
  return `${date(row.periodStart)} – ${date(row.periodEnd)}`;
}

function stateLabel(row: PaidMemberRow): { label: string; className: string } {
  if (row.state === 'active') return { label: 'Active', className: 'bg-green-500/12 text-green-600' };
  if (row.state === 'non-renewing') return { label: 'Non-renewing', className: 'bg-amber-500/12 text-amber-600' };
  if (row.state === 'grace') return { label: 'Grace period', className: 'bg-amber-500/15 text-amber-700' };
  if (row.state === 'pending') return { label: 'Pending', className: 'bg-foreground/10 text-foreground/60' };
  return { label: 'Expired', className: 'bg-red-500/12 text-red-600' };
}

function CopyButton({ value, label }: { value: string | null; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-foreground/30">—</span>;
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy');
        }
      }}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/55 hover:text-foreground"
    >
      <span className="max-w-[110px] truncate">{value}</span>
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

/**
 * Owner/admin view of paid subscribers: who paid, for which period, when, and the reference to give
 * support. Reads a service-role endpoint because the subscription tables are not client-readable.
 */
export default function PaidMembersPanel({ communityId }: { communityId: string }) {
  const [data, setData] = useState<CommunityPaidMembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'attention' | 'ended'>('all');

  const load = async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getCommunityPaidMembers(communityId);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load paid subscriptions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (communityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  const rows = useMemo(() => {
    const all = data?.members ?? [];
    const q = query.trim().toLowerCase();
    return all.filter(row => {
      if (q && !`${row.name} ${row.username ?? ''}`.toLowerCase().includes(q)) return false;
      if (stateFilter === 'active') return row.state === 'active' || row.state === 'non-renewing';
      if (stateFilter === 'attention') return row.status === 'attention' || row.state === 'grace' || row.state === 'pending';
      if (stateFilter === 'ended') return row.state === 'expired';
      return true;
    });
  }, [data, query, stateFilter]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-foreground/50">
        <Loader2 className="animate-spin" size={16} /> Loading paid subscriptions…
      </div>
    );
  }

  const summary = data?.summary;
  const currency = summary?.currency ?? 'NGN';

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active subscribers', value: String(summary?.activeCount ?? 0), hint: `${summary?.nonRenewingCount ?? 0} non-renewing` },
          { label: 'Monthly recurring', value: formatPrice(summary?.mrrCents ?? 0, currency), hint: 'Auto-renewing members' },
          { label: 'Expiring this week', value: String(summary?.expiringThisWeek ?? 0), hint: 'Send a nudge if needed' },
          { label: 'Needs attention', value: String(summary?.attentionCount ?? 0), hint: 'Failed or pending payments' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/40">{card.label}</p>
            <p className="mt-1.5 text-xl font-bold">{card.value}</p>
            <p className="mt-0.5 text-xs text-foreground/40">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2">
          <Search size={15} className="text-foreground/35" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or username"
            className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/35"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-foreground/[0.04] p-1">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['attention', 'Needs attention'],
              ['ended', 'Ended'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setStateFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                stateFilter === id ? 'bg-primary text-white' : 'text-foreground/45 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/10 px-3 py-2 text-xs font-semibold text-foreground/60 hover:bg-foreground/5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.03] py-20 text-center">
          <Users size={40} className="text-foreground/10" />
          <p className="text-sm font-semibold text-foreground/40">
            {data?.members.length ? 'No subscriptions match this filter' : 'No paid subscriptions yet'}
          </p>
          <p className="max-w-sm text-xs text-foreground/35">
            Members who pay a real-money joining fee appear here with their period and reference.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-foreground/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-foreground/[0.04] text-[11px] uppercase tracking-widest text-foreground/40">
              <tr>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last paid</th>
                <th className="px-4 py-3 font-semibold">Paid for</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 text-right font-semibold">You earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/[0.06]">
              {rows.map(row => {
                const state = stateLabel(row);
                return (
                  <tr key={row.memberId} className="align-top hover:bg-foreground/[0.02]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-foreground/10">
                          <img
                            src={row.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.memberId}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{row.name}</p>
                          {row.username && <p className="truncate text-xs text-foreground/40">@{row.username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{formatPrice(row.amountCents, row.currency)}</p>
                      <p className="text-xs text-foreground/40">{row.interval === 'month' ? 'per month' : 'one-time'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.className}`}>
                        {state.label}
                      </span>
                      {row.state === 'non-renewing' && (
                        <p className="mt-1 text-[11px] text-foreground/40">Access ends {date(row.periodEnd)}</p>
                      )}
                      {row.state === 'grace' && (
                        <p className="mt-1 text-[11px] text-amber-600">Removed {date(row.accessUntil)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-foreground/65">{date(row.lastPaidAt, true)}</td>
                    <td className="px-4 py-4 text-foreground/65">{period(row)}</td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <CopyButton value={row.orderId} label="Kith reference" />
                        <CopyButton value={row.providerTransactionId} label="Paystack transaction id" />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className="font-semibold">{formatPrice(row.netCents ?? row.amountCents, row.currency)}</p>
                      {row.feeCents !== null && (
                        <p className="text-[11px] text-foreground/40">
                          fee {formatPrice(row.feeCents, row.currency)}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-foreground/35">
        <CreditCard size={13} /> References are the Kith order id (also the Paystack reference) and
        Paystack's numeric transaction id.
      </p>
    </div>
  );
}
