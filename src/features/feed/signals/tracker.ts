/**
 * Records what the viewer does with content so ranking can learn from it.
 *
 * Events are buffered and written as one engagement-profile update every few seconds
 * (and when the tab is hidden), instead of one database write per interaction.
 * This is best-effort: a failed flush is logged and dropped.
 */
import type { UserEngagementProfile } from '../types';
import { normalizeTag } from '../ranking/score';
import { EMPTY_PROFILE, getEngagementProfile, saveEngagementProfile } from './store';

export type EngagementType = 'impression' | 'like' | 'comment' | 'bookmark' | 'repost' | 'show_more' | 'not_interested';

export interface EngagementTarget {
  id: string;
  authorUid?: string;
  hashtags?: string[];
  tags?: string[];
}

interface EngagementEvent {
  type: EngagementType;
  target: EngagementTarget;
  at: string;
}

const FLUSH_DELAY_MS = 10_000;
const HISTORY_CAP = 200;
const SEEN_CAP = 500;

let queueUid: string | null = null;
let queue: EngagementEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> = Promise.resolve();
const profiles = new Map<string, UserEngagementProfile>();

/** Fold a batch of events into a profile. Pure; newest entries first, capped. */
export function applyEvents(profile: UserEngagementProfile, uid: string, events: EngagementEvent[]): UserEngagementProfile {
  const next: UserEngagementProfile = {
    ...profile,
    likedTags: { ...profile.likedTags },
    bookmarkedTags: { ...profile.bookmarkedTags },
  };
  const seen = [...profile.seenItemIds];
  const history = [...profile.interactionHistory];

  for (const { type, target, at } of events) {
    if (target.authorUid === uid) continue; // your own content says nothing about your taste
    const tags = [...(target.hashtags || []), ...(target.tags || [])].map(normalizeTag).filter(Boolean);

    if (type === 'impression') {
      seen.unshift(target.id);
      continue;
    }
    if (type === 'like') for (const t of tags) next.likedTags[t] = (next.likedTags[t] || 0) + 1;
    if (type === 'bookmark') for (const t of tags) next.bookmarkedTags[t] = (next.bookmarkedTags[t] || 0) + 1;
    if (target.authorUid) history.unshift({ creatorId: target.authorUid, type, timestamp: at });
  }

  next.seenItemIds = [...new Set(seen)].slice(0, SEEN_CAP);
  next.interactionHistory = history.slice(0, HISTORY_CAP);
  return next;
}

export function trackEngagement(uid: string | null | undefined, type: EngagementType, target: EngagementTarget) {
  if (!uid || !target?.id) return;
  if (queueUid && queueUid !== uid) void flushEngagement(); // account switched: write the old user's batch first
  queueUid = uid;
  queue.push({ type, target, at: new Date().toISOString() });
  if (!timer) timer = setTimeout(() => void flushEngagement(), FLUSH_DELAY_MS);
}

export function flushEngagement(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const uid = queueUid;
  const events = queue;
  queue = [];
  if (!uid || events.length === 0) return flushing;

  // Serialize flushes so concurrent batches don't overwrite each other.
  flushing = flushing.then(async () => {
    try {
      const current = profiles.get(uid) ?? (await getEngagementProfile(uid)) ?? EMPTY_PROFILE;
      const next = applyEvents(current, uid, events);
      await saveEngagementProfile(uid, next);
      profiles.set(uid, next);
    } catch (err) {
      console.warn('[feed] Failed to save engagement signals:', err);
    }
  });
  return flushing;
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushEngagement();
  });
  window.addEventListener('pagehide', () => void flushEngagement());
}
