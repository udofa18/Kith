import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Timestamp, collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Card } from './settingsUi';

const RANGES = [{ id: '7d', days: 7, label: 'Last 7 days' }, { id: '14d', days: 14, label: 'Last 14 days' }, { id: '30d', days: 30, label: 'Last 30 days' }, { id: '90d', days: 90, label: 'Last 3 months' }];
const day = (d: Date) => d.toISOString().slice(0, 10);
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
const axis = { fill: 'currentColor', fillOpacity: 0.55, fontSize: 12 };
const tooltip = { contentStyle: { backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, fontSize: 13 }, labelStyle: { opacity: 0.6 } };

export default function InsightsSettings({ communityId, stats, analyticsFilter, setAnalyticsFilter, title = 'Insights', previous }: {
  communityId: string; stats: any[]; analyticsFilter: string; setAnalyticsFilter: (v: string) => void;
  title?: string;
  /** Totals for the period before this one, to show how things changed. */
  previous?: { messages: number; posts: number; xp: number };
}) {
  const range = RANGES.find(r => r.id === analyticsFilter) ?? RANGES[0];
  const [joinedDays, setJoinedDays] = useState<Record<string, number>>({});
  const [roleRows, setRoleRows] = useState<{ name: string; color: string; count: number }[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [topChannels, setTopChannels] = useState<any[]>([]);

  // New members per day come from when each member joined, since that isn't tracked in the daily totals.
  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - range.days + 1); since.setHours(0, 0, 0, 0);
    getDocs(query(collection(db, 'communities', communityId, 'members'), where('joinedAt', '>=', Timestamp.fromDate(since)), limit(2000)))
      .then(snap => {
        const by: Record<string, number> = {};
        snap.docs.forEach(d => { const t = d.data().joinedAt?.toDate?.(); if (t) by[day(t)] = (by[day(t)] || 0) + 1; });
        setJoinedDays(by);
      }).catch(() => setJoinedDays({}));
  }, [communityId, range.days]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'communities', communityId, 'roles'), rs => {
        const roles = rs.docs.map(d => ({ id: d.id, ...d.data() } as any));
        getDocs(query(collection(db, 'communities', communityId, 'members'), limit(500))).then(ms => {
          setMembersTotal(ms.size);
          const counts: Record<string, number> = {};
          ms.docs.forEach(m => (m.data().customRoles || []).forEach((id: string) => { counts[id] = (counts[id] || 0) + 1; }));
          setRoleRows(roles.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(r => ({ name: r.name, color: r.color || '#94A3B8', count: counts[r.id] || 0 })));
        }).catch(() => {});
      }),
      onSnapshot(query(collection(db, 'communities', communityId, 'channels'), orderBy('messageCount', 'desc'), limit(5)),
        s => setTopChannels(s.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => (c.messageCount || 0) > 0))),
    ];
    return () => unsubs.forEach(u => u());
  }, [communityId]);

  // One row per day in the range, including quiet days.
  const series = useMemo(() => {
    const byDay = Object.fromEntries(stats.map(s => [s.dateOriginal, s]));
    return Array.from({ length: range.days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (range.days - 1 - i));
      const key = day(d), s = byDay[key] || {};
      return { key, date: short(key), messages: s.newMessages || 0, posts: s.newPosts || 0, active: s.active || 0, xp: s.newXp || 0, joined: joinedDays[key] || 0 };
    });
  }, [stats, range.days, joinedDays]);

  const sum = (k: 'messages' | 'posts' | 'xp' | 'joined') => series.reduce((n, r) => n + r[k], 0);
  const busiest = series.reduce((b, r) => (r.messages + r.posts > b.messages + b.posts ? r : b), series[0]);
  const hasActivity = series.some(r => r.messages || r.posts);
  const cards: { label: string; value: number; before?: number }[] = [
    { label: 'New members', value: sum('joined') },
    { label: 'Messages', value: sum('messages'), before: previous?.messages },
    { label: 'Posts', value: sum('posts'), before: previous?.posts },
    { label: 'XP earned', value: sum('xp'), before: previous?.xp },
  ];
  const delta = (now: number, before?: number) => before === undefined || before === 0 ? null : Math.round(((now - before) / before) * 100);
  const maxRole = Math.max(1, ...roleRows.map(r => r.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-foreground/55">How your community has been used.</p>
        </div>
        <select value={analyticsFilter} onChange={e => setAnalyticsFilter(e.target.value)} aria-label="Date range"
          className="bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <p className="text-sm text-foreground/55">{c.label}</p><p className="text-3xl font-semibold mt-1">{c.value.toLocaleString()}</p>
            {delta(c.value, c.before) !== null && (
              <p className={`text-xs mt-1 ${delta(c.value, c.before)! < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                {delta(c.value, c.before)! > 0 ? '+' : ''}{delta(c.value, c.before)}% <span className="text-foreground/45">vs the period before</span>
              </p>
            )}
          </div>
        ))}
      </div>

      <Card title="Messages and posts per day" description={hasActivity ? `Busiest day: ${busiest.date} with ${busiest.messages + busiest.posts}.` : undefined}>
        <div className="h-60">
          {hasActivity ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axis} dy={8} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axis} />
                <Tooltip {...tooltip} cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} />
                <Bar dataKey="messages" name="Messages" stackId="a" fill="var(--color-primary)" />
                <Bar dataKey="posts" name="Posts" stackId="a" fill="var(--color-primary)" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-full flex items-center justify-center text-sm text-foreground/50">No activity in this period.</div>}
        </div>
      </Card>

      <Card title="New members per day">
        <div className="h-48">
          {sum('joined') > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axis} dy={8} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axis} />
                <Tooltip {...tooltip} cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} />
                <Bar dataKey="joined" name="New members" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-full flex items-center justify-center text-sm text-foreground/50">No one joined in this period.</div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Busiest channels" description="By total messages sent.">
          {topChannels.length > 0 ? (
            <ol className="divide-y divide-foreground/10">
              {topChannels.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 text-sm">
                  <span className="flex items-center gap-3 min-w-0"><span className="w-4 text-foreground/45">{i + 1}</span><span className="truncate font-medium">#{c.name}</span></span>
                  <span className="text-foreground/55">{(c.messageCount || 0).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-foreground/50">No messages yet.</p>}
        </Card>

        <Card title="Members by role" description={membersTotal >= 500 ? 'Based on your 500 most recent members.' : `${membersTotal} member${membersTotal === 1 ? '' : 's'}.`}>
          {roleRows.length > 0 ? (
            <ul className="space-y-3">
              {roleRows.map(r => (
                <li key={r.name} className="text-sm">
                  <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />{r.name}</span><span className="text-foreground/55">{r.count}</span></div>
                  <div className="h-1.5 mt-1 rounded-full bg-foreground/10 overflow-hidden"><div className="h-full" style={{ width: `${(r.count / maxRole) * 100}%`, backgroundColor: r.color }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-foreground/50">You haven't created any roles yet.</p>}
        </Card>
      </div>

      <p className="text-xs text-foreground/45">Daily figures start from when activity tracking began, so older days can be empty.</p>
    </div>
  );
}
