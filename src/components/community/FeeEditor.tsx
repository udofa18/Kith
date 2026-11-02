import { CreditCard, Gift, Zap } from 'lucide-react';
import { AVAILABLE_CURRENCIES, FEE_LIMITS, formatFee, validateFee, type CommunityFee } from '../../lib/communityPricing';

/** Free vs. paid joining, with the amount. Real-money fees are shown but not yet selectable. */
export default function FeeEditor({ value, onChange }: { value: CommunityFee | null; onChange: (fee: CommunityFee | null) => void }) {
  const paid = !!value;
  const fee = value ?? { amount: FEE_LIMITS.xp.presets[1], currency: 'xp' as const, interval: 'once' as const };
  const error = paid ? validateFee(fee) : null;
  const usdReady = AVAILABLE_CURRENCIES.includes('usd');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Choice active={!paid} onClick={() => onChange(null)} icon={Gift} title="Free" body="Anyone who's allowed in can join." />
        <Choice active={paid} onClick={() => onChange(fee)} icon={Zap} title="Joining fee" body="Members pay once to join." />
      </div>

      {paid && (
        <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange({ ...fee, currency: 'xp' })} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${fee.currency === 'xp' ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'}`}>
              <Zap size={14} /> XP
            </button>
            <button
              type="button"
              disabled={!usdReady}
              onClick={() => onChange({ ...fee, currency: 'usd' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${fee.currency === 'usd' ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'}`}
              title={usdReady ? undefined : 'Card payments are coming soon'}
            >
              <CreditCard size={14} /> Real money
              {!usdReady && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Soon</span>}
            </button>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="fee-amount">Amount</label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="fee-amount"
                  type="number"
                  inputMode="numeric"
                  min={FEE_LIMITS[fee.currency].min}
                  max={FEE_LIMITS[fee.currency].max}
                  value={Number.isFinite(fee.amount) ? fee.amount : ''}
                  onChange={e => onChange({ ...fee, amount: Math.round(Number(e.target.value)) })}
                  className="w-full pl-4 pr-12 py-2.5 rounded-xl bg-background border border-black/10 dark:border-white/15 outline-none focus:border-primary text-sm"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-black/45 dark:text-white/45">{fee.currency === 'xp' ? 'XP' : 'USD'}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FEE_LIMITS[fee.currency].presets.map(p => (
                <button key={p} type="button" onClick={() => onChange({ ...fee, amount: p })} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${fee.amount === p ? 'border-primary text-primary bg-primary/5' : 'border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10'}`}>
                  {formatFee({ ...fee, amount: p })}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : (
            <p className="text-xs text-black/55 dark:text-white/55">
              {fee.currency === 'xp'
                ? `New members pay ${formatFee(fee)} once, and it goes to you. Card payments are coming soon.`
                : `New members pay ${formatFee(fee)} by card.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({ active, onClick, icon: Icon, title, body }: { active: boolean; onClick: () => void; icon: typeof Zap; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`p-3.5 rounded-2xl border text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
    >
      <Icon size={18} className={active ? 'text-primary' : 'text-black/45 dark:text-white/45'} />
      <p className="mt-1.5 text-sm font-semibold">{title}</p>
      <p className="text-xs text-black/55 dark:text-white/55">{body}</p>
    </button>
  );
}
