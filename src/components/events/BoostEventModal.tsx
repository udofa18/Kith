import { useState } from 'react';
import { Check, Megaphone, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth } from '../../firebase';
import { isPromoted } from '../../lib/eventRanking';
import { formatDate } from '../../lib/utils';
import ModalShell, { ghostBtn, primaryBtn } from '../ui/ModalShell';

// Display only. The server owns the real prices (api/_lib/boost.ts).
const TIERS = [
  { id: 'feed_3d', name: 'Feed boost', days: 3, price: 9, icon: Megaphone, perks: ['Promoted card in the events feed'] },
  { id: 'spotlight_3d', name: 'Spotlight', days: 3, price: 29, icon: Sparkles, perks: ['Top of the Events page', 'Plus feed placement'] },
  { id: 'spotlight_7d', name: 'Spotlight week', days: 7, price: 59, icon: Rocket, perks: ['7 days at the top', 'Best for big events'] },
] as const;

export default function BoostEventModal({ event, isOpen, onClose }: { event: any; isOpen: boolean; onClose: () => void }) {
  const [tierId, setTierId] = useState<string>('spotlight_3d');
  const [loading, setLoading] = useState(false);
  if (!isOpen) return null;
  const active = isPromoted(event);
  const tier = TIERS.find(t => t.id === tierId)!;

  const checkout = async () => {
    const user = auth.currentUser;
    if (!user) return toast.error('Sign in to boost your event');
    setLoading(true);
    try {
      const res = await fetch('/api/boost-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ eventId: event.id, tierId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  return (
    <ModalShell
      title="Boost this event" subtitle={event.title} wide={false} busy={loading} onClose={onClose}
      status="Boosted events are always labelled “Promoted”."
      footer={<>
        <button onClick={onClose} disabled={loading} className={ghostBtn}>Cancel</button>
        <button onClick={checkout} disabled={loading} className={primaryBtn}>{loading ? 'Opening checkout…' : `Pay $${tier.price}`}</button>
      </>}
    >
      {active && (
        <p className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300">
          <Check size={16} className="shrink-0" /> Promoted until {formatDate(event.promotion.endsAt, 'MMM d, h:mm a')}. A new boost starts after it.
        </p>
      )}
      <div className="space-y-2">
        {TIERS.map(t => {
          const on = tierId === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => setTierId(t.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
              <Icon size={20} className={on ? 'text-primary' : 'text-black/45 dark:text-white/45'} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.name} <span className="font-normal text-black/50 dark:text-white/50">· {t.days} days</span></span>
                <span className="block text-xs text-black/55 dark:text-white/55">{t.perks.join(' · ')}</span>
              </span>
              <span className="font-bold">${t.price}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">Applies to public events that haven't ended. Your boost starts as soon as payment clears.</p>
    </ModalShell>
  );
}
