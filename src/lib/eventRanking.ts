// Event discovery ranking + arrangement.
//
// Organic score blends the signals the leading event platforms (Luma, Eventbrite,
// Partiful, Meetup) lean on: how soon it starts, momentum (attendees), scarcity,
// and affinity to the viewer's interests. Promotion is deliberately kept OUT of the
// organic score: promoted events fill labelled slots so the feed stays trustworthy.

export interface RankableEvent {
  id: string;
  startDate?: string;
  endDate?: string;
  status?: 'upcoming' | 'live' | 'ended';
  attendeeCount?: number;
  maxAttendees?: number;
  category?: string;
  impressions?: number;
  promotion?: {
    status?: 'active' | 'paused' | 'ended';
    placement?: 'spotlight' | 'feed';
    startsAt?: string;
    endsAt?: string;
  };
  [key: string]: any;
}

const HOUR = 3600_000;

export const startMs = (e: RankableEvent) => (e.startDate ? new Date(e.startDate).getTime() : NaN);
export const endMs = (e: RankableEvent) =>
  e.endDate ? new Date(e.endDate).getTime() : startMs(e) + HOUR;

export function isLive(e: RankableEvent, now = Date.now()) {
  if (e.status === 'ended') return false;
  return e.status === 'live' || (startMs(e) <= now && now <= endMs(e));
}

export const isEnded = (e: RankableEvent, now = Date.now()) =>
  e.status === 'ended' || endMs(e) < now;

export function isPromoted(e: RankableEvent, now = Date.now()) {
  const p = e.promotion;
  if (!p || p.status !== 'active' || isEnded(e, now)) return false;
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
  return true;
}

export const spotsLeft = (e: RankableEvent) =>
  e.maxAttendees && e.maxAttendees > 0 ? Math.max(0, e.maxAttendees - (e.attendeeCount || 0)) : null;

export const isFillingFast = (e: RankableEvent) => {
  const left = spotsLeft(e);
  return left !== null && left > 0 && left / (e.maxAttendees as number) <= 0.2;
};

export function startsInLabel(e: RankableEvent, now = Date.now()) {
  if (isLive(e, now)) return 'Happening now';
  const diff = startMs(e) - now;
  if (!Number.isFinite(diff) || diff < 0) return '';
  if (diff < HOUR) return `Starts in ${Math.max(1, Math.round(diff / 60000))}m`;
  if (diff < 24 * HOUR) return `Starts in ${Math.round(diff / HOUR)}h`;
  const days = Math.round(diff / (24 * HOUR));
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

export function organicScore(e: RankableEvent, interests: string[] = [], now = Date.now()) {
  if (isEnded(e, now)) return -Infinity;
  const hoursAway = Math.max(0, (startMs(e) - now) / HOUR);
  // Soon matters most; decays smoothly over ~2 weeks.
  const recency = isLive(e, now) ? 1.2 : Math.exp(-hoursAway / 120);
  const momentum = Math.log10(1 + (e.attendeeCount || 0)) / 3;
  const scarcity = isFillingFast(e) ? 0.15 : 0;
  const affinity = e.category && interests.includes(e.category) ? 0.35 : 0;
  return recency * 1.0 + momentum * 0.6 + scarcity + affinity;
}

export const byScore = (interests: string[] = [], now = Date.now()) => (a: RankableEvent, b: RankableEvent) =>
  organicScore(b, interests, now) - organicScore(a, interests, now);

/** Insert promoted events into an organic list: one per `every` items, never first, capped. */
export function interleavePromoted<T extends RankableEvent>(
  organic: T[],
  promoted: T[],
  every = 6,
  max = 3,
): Array<{ event: T; promoted: boolean }> {
  const out: Array<{ event: T; promoted: boolean }> = [];
  const pool = promoted.filter(p => !organic.some(o => o.id === p.id)).slice(0, max);
  const poolIds = new Set(pool.map(p => p.id));
  let pi = 0;
  organic.forEach((event, i) => {
    if (poolIds.has(event.id)) return;
    out.push({ event, promoted: false });
    if ((i + 1) % every === 0 && pi < pool.length) out.push({ event: pool[pi++], promoted: true });
  });
  // Short lists still show at least one sponsored slot.
  if (pi === 0 && pool.length && out.length >= 2) out.splice(2, 0, { event: pool[pi++], promoted: true });
  return out;
}

export type DayBucket = 'today' | 'tomorrow' | 'weekend' | 'week' | 'later';

export function bucketFor(e: RankableEvent, now = new Date()): DayBucket {
  const s = new Date(e.startDate as string);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(s) - startOfDay(now)) / (24 * HOUR));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  const dow = s.getDay();
  if (diffDays <= 7 && (dow === 0 || dow === 6 || dow === 5)) return 'weekend';
  if (diffDays <= 7) return 'week';
  return 'later';
}
