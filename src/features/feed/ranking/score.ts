/**
 * Feed ranking.
 *
 *   score = affinity × quality × freshness × adjustments
 *
 * - affinity:  how connected the viewer is to the item (follow > past engagement > interest > discovery)
 * - quality:   log-scaled engagement, so popular posts rise without drowning out new ones
 * - freshness: halves every 12 hours
 * - adjustments: already seen, "show less" topics, creators marked "not interested", promotion
 *
 * Every boost records a Reason so the UI can explain the ranking ("Why am I seeing this?").
 */
import { Timestamp } from 'firebase/firestore';
import type { FeedItem, Reason, ViewerContext } from '../types';

const AFFINITY = { following: 1, interest: 0.5, discovery: 0.2 } as const;
const ENGAGED_CREATOR_BONUS = 0.1;   // per positive interaction with the creator
const ENGAGED_CREATOR_MAX = 0.3;
const LIKED_TAG_BONUS = 0.1;
const FRESHNESS_HALF_LIFE_HOURS = 12;
const SEEN_PENALTY = 0.3;
const LESS_TOPIC_PENALTY = 0.3;
const NOT_INTERESTED_CREATOR_PENALTY = 0.3;
const PROMOTED_BOOST = 1.2;
const POPULAR_ENGAGEMENT = 10;
const NEW_HOURS = 2;

const POSITIVE_INTERACTIONS = new Set(['like', 'comment', 'bookmark', 'repost', 'show_more']);

export const normalizeTag = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]/g, '');

export function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  const v = value as { seconds?: number } | null;
  if (v && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return new Date();
}

export const itemTags = (data: any): string[] => [...(data.hashtags || []), ...(data.tags || [])];

export function engagementOf(data: any): number {
  return (data.likesCount || 0) + 2 * (data.commentsCount || 0) + 3 * (data.bookmarksCount || 0) + 4 * (data.repostsCount || 0);
}

export function scoreItem(item: FeedItem, viewer: ViewerContext, now = Date.now()): { score: number; reasons: Reason[] } {
  const { interests, profile, preferences } = viewer;
  const data = item.data;
  const reasons: Reason[] = [];
  const tags = itemTags(data);

  // --- affinity
  let affinity: number = AFFINITY.discovery;
  if (viewer.followingIds.has(data.authorUid)) {
    affinity = AFFINITY.following;
    reasons.push({ kind: 'following' });
  } else {
    const followed = new Set([...(interests?.hashtags || []), ...(interests?.followedTopics || [])].map(normalizeTag));
    const matchedTag = tags.find(t => followed.has(normalizeTag(t)));
    const matchedSkill = (data.skills as string[] | undefined)?.find(s => interests?.skills.includes(s));
    const categoryMatch = !!data.category && !!interests?.categories.includes(data.category);
    if (matchedTag || matchedSkill || categoryMatch) {
      affinity = AFFINITY.interest;
      reasons.push({ kind: 'interest', topic: (matchedTag || matchedSkill || data.category).replace(/^#/, '') });
    }
  }

  const history = (profile?.interactionHistory || []).filter(i => i.creatorId === data.authorUid);
  const positive = history.filter(i => POSITIVE_INTERACTIONS.has(i.type)).length;
  if (positive > 0) {
    affinity += Math.min(ENGAGED_CREATOR_MAX, positive * ENGAGED_CREATOR_BONUS);
    if (positive >= 2) reasons.push({ kind: 'creator' });
  }
  const likedTags = profile?.likedTags || {};
  if (tags.some(t => (likedTags[normalizeTag(t)] || 0) >= 2)) affinity += LIKED_TAG_BONUS;

  // --- quality
  const engagement = engagementOf(data);
  const quality = 1 + Math.log1p(engagement);
  if (engagement >= POPULAR_ENGAGEMENT) reasons.push({ kind: 'popular' });

  // --- freshness
  const ageHours = Math.max(0, (now - toDate(data.createdAt).getTime()) / 3_600_000);
  const freshness = Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
  if (ageHours < NEW_HOURS) reasons.push({ kind: 'new' });

  // --- adjustments
  let adjust = 1;
  if (profile?.seenItemIds?.includes(item.id)) adjust *= SEEN_PENALTY;
  const less = new Set((preferences.lessTopics || []).map(normalizeTag));
  if (tags.some(t => less.has(normalizeTag(t)))) adjust *= LESS_TOPIC_PENALTY;
  if (history.some(i => i.type === 'not_interested')) adjust *= NOT_INTERESTED_CREATOR_PENALTY;
  if (data.isPromoted) adjust *= PROMOTED_BOOST;

  if (reasons.length === 0) reasons.push({ kind: 'discovery' });
  return { score: affinity * quality * freshness * adjust, reasons };
}

const REASON_PRIORITY: Reason['kind'][] = ['following', 'creator', 'interest', 'popular', 'new', 'discovery'];

/** Short label shown above a feed card. Empty when the reason isn't worth calling out. */
export function reasonLabel(reasons: Reason[]): string {
  const primary = [...reasons].sort((a, b) => REASON_PRIORITY.indexOf(a.kind) - REASON_PRIORITY.indexOf(b.kind))[0];
  switch (primary?.kind) {
    case 'following': return 'From someone you follow';
    case 'creator': return 'You often engage with this creator';
    case 'interest': return `Because you're into ${primary.topic}`;
    case 'popular': return 'Popular right now';
    default: return '';
  }
}

/** Full sentences for the "Why am I seeing this?" sheet. */
export function explainReason(reason: Reason, authorName: string): string {
  switch (reason.kind) {
    case 'following': return `You follow ${authorName}.`;
    case 'creator': return `You've liked, saved, or replied to ${authorName}'s posts.`;
    case 'interest': return `It's about ${reason.topic}, which matches your interests.`;
    case 'popular': return "It's getting a lot of likes and comments.";
    case 'new': return 'It was posted in the last couple of hours.';
    case 'discovery': return "It's something new from outside your usual circle.";
  }
}
