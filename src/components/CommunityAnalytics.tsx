import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import InsightsSettings from './community/InsightsSettings';

const DAYS: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
const dayKey = (offset: number) => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };

/** Real daily totals for moderators. The numbers come from the community's recorded activity, with the period before for comparison. */
export default function CommunityAnalytics({ communityId }: { communityId: string }) {
  const [filter, setFilter] = useState('7d');
  const [docs, setDocs] = useState<any[]>([]);
  const days = DAYS[filter] ?? 7;

  useEffect(() => onSnapshot(
    query(collection(db, 'communities', communityId, 'dailyStats'), orderBy('date', 'desc'), limit(days * 2 + 2)),
    snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data(), dateOriginal: d.data().date }))),
    () => setDocs([]),
  ), [communityId, days]);

  const previous = useMemo(() => {
    const from = dayKey(days * 2 - 1), to = dayKey(days);
    const p = docs.filter(d => d.dateOriginal >= from && d.dateOriginal <= to);
    const sum = (k: string) => p.reduce((n, d) => n + (d[k] || 0), 0);
    return { messages: sum('newMessages'), posts: sum('newPosts'), xp: sum('newXp') };
  }, [docs, days]);

  return <InsightsSettings title="Analytics" communityId={communityId} stats={docs} analyticsFilter={filter} setAnalyticsFilter={setFilter} previous={previous} />;
}
