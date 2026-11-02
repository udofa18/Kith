import { useMemo, useState } from 'react';
import { Check, ChevronRight, MessageSquare, Trophy, Users, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from './settingsUi';
import { categoryLabel, categoryOf } from '../../lib/communityCategories';
import { formatDate } from '../../lib/utils';

const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const ACCESS_LABEL: Record<string, string> = { public: 'Public', 'invite-only': 'Invite only', private: 'Private' };
const METRICS = [
  { key: 'active', label: 'Active members' },
  { key: 'newMessages', label: 'Messages' },
  { key: 'newPosts', label: 'Posts' },
] as const;
const RANGES = [{ id: '7d', label: 'Last 7 days' }, { id: '14d', label: 'Last 14 days' }, { id: '30d', label: 'Last 30 days' }, { id: '90d', label: 'Last 3 months' }];

interface Props {
  community: any;
  dashboardStats: { memberCount: number; messagesCount: number; totalXp: number; memberChange: string | null; messageChange: string | null; xpChange: string | null };
  topPerformers: any[];
  stats: any[];
  analyticsFilter: string;
  setAnalyticsFilter: (v: string) => void;
  pendingRequestsCount: number;
  onNavigate: (section: 'branding' | 'members' | 'automation' | 'roles' | 'channels') => void;
}

export default function OverviewSettings({ community, dashboardStats, topPerformers, stats, analyticsFilter, setAnalyticsFilter, pendingRequestsCount, onNavigate }: Props) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('active');
  const members = dashboardStats.memberCount;
  const next = MILESTONES.find(m => m > members);
  const prev = [...MILESTONES].reverse().find(m => m <= members) ?? 0;
  const progress = next ? Math.round(((members - prev) / (next - prev)) * 100) : 100;
  const created = community?.createdAt?.toDate ? community.createdAt.toDate() : community?.createdAt ? new Date(community.createdAt) : null;
  const access = ACCESS_LABEL[community?.membershipControl?.accessType || (community?.isPrivate ? 'private' : 'public')];

  const checklist = useMemo(() => [
    { done: !!community?.image, label: 'Add a community photo', go: 'branding' as const },
    { done: (community?.description || '').trim().length >= 20, label: 'Write a description', go: 'branding' as const },
    { done: !!community?.welcomeConfig?.enabled, label: 'Turn on a welcome message', go: 'automation' as const },
    { done: !!community?.backdrop, label: 'Add a banner', go: 'branding' as const },
  ], [community]);
  const remaining = checklist.filter(c => !c.done);

  const cards = [
    { label: 'Members', value: members.toLocaleString(), change: dashboardStats.memberChange, icon: Users },
    { label: 'Messages sent', value: compact(dashboardStats.messagesCount), change: dashboardStats.messageChange, icon: MessageSquare },
    { label: 'XP earned', value: compact(dashboardStats.totalXp), change: dashboardStats.xpChange, icon: Zap },
  ];
  const rangeLabel = RANGES.find(r => r.id === analyticsFilter)?.label.toLowerCase().replace('last ', '') ?? '';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <img src={community?.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${community?.id}`} alt="" className="w-14 h-14 rounded-xl object-cover bg-foreground/10" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold truncate">{community?.name}</h2>
          <p className="text-sm text-foreground/55">
            {access} · {categoryLabel(categoryOf(community || {}))}{created && !isNaN(created.getTime()) && ` · Created ${formatDate(created, 'MMM d, yyyy')}`}
          </p>
        </div>
      </div>

      {pendingRequestsCount > 0 && (
        <button onClick={() => onNavigate('members')} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-left hover:bg-primary/10 transition-colors">
          <span className="text-sm"><span className="font-semibold">{pendingRequestsCount} join request{pendingRequestsCount === 1 ? '' : 's'}</span> waiting for review</span>
          <ChevronRight size={16} className="text-primary" />
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, change, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm text-foreground/55"><Icon size={15} />{label}</div>
            <p className="text-3xl font-semibold mt-2">{value}</p>
            <p className="text-xs mt-1 text-foreground/45">
              {change ? <><span className={change.startsWith('-') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}>{change}</span> vs the {rangeLabel} before</> : 'Total so far'}
            </p>
          </div>
        ))}
      </div>

      <Card title="Activity">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-1 p-0.5 rounded-lg bg-foreground/5" role="tablist">
            {METRICS.map(m => (
              <button key={m.key} role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${metric === m.key ? 'bg-background shadow-sm font-medium' : 'text-foreground/60 hover:text-foreground'}`}>{m.label}</button>
            ))}
          </div>
          <select value={analyticsFilter} onChange={e => setAnalyticsFilter(e.target.value)} aria-label="Date range"
            className="bg-background border border-foreground/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary">
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="h-64">
          {stats.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 12 }} dy={8} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ opacity: 0.6 }} formatter={(v: number) => [v, METRICS.find(m => m.key === metric)!.label]}
                />
                <Area type="monotone" dataKey={metric} stroke="var(--color-primary)" strokeWidth={2} fill="url(#overviewFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-foreground/50">No activity recorded yet. It shows up here as people use the community.</div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Top members" description="Most XP earned here.">
          {topPerformers.length > 0 ? (
            <ol className="divide-y divide-foreground/10">
              {topPerformers.map(u => (
                <li key={u.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 text-sm">
                  <span className="flex items-center gap-3 min-w-0"><span className="w-5 text-foreground/45">{u.rank}</span><span className="truncate font-medium">{u.name}</span></span>
                  <span className="text-foreground/55">{compact(u.xp)} XP</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-foreground/50">No one has earned XP yet.</p>}
        </Card>

        <Card title="Next milestone">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-yellow-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{next ? `${next.toLocaleString()} members` : 'You reached the top milestone'}</p>
              <p className="text-sm text-foreground/55">{next ? `${members.toLocaleString()} so far · ${(next - members).toLocaleString()} to go` : `${members.toLocaleString()} members`}</p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-foreground/10 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      </div>

      {remaining.length > 0 && (
        <Card title="Finish setting up" description={`${checklist.length - remaining.length} of ${checklist.length} done`}>
          <ul className="space-y-1">
            {checklist.map(item => (
              <li key={item.label}>
                <button disabled={item.done} onClick={() => onNavigate(item.go)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left enabled:hover:bg-foreground/5">
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-primary border-primary text-white' : 'border-foreground/30'}`}>{item.done && <Check size={12} />}</span>
                  <span className={item.done ? 'line-through text-foreground/45' : ''}>{item.label}</span>
                  {!item.done && <ChevronRight size={14} className="ml-auto text-foreground/40" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
