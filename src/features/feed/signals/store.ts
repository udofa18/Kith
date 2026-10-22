/**
 * Persistence for the viewer's feed signals:
 * - interests            (userInterests / user_interests): topics they chose
 * - engagement profile   (userEngagementProfiles / user_engagement_profiles): what they did
 * - preferences          (feedPreferences / feed_preferences): what they asked to see less of
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getSupabase } from '../../../supabase';
import { dualRead, dualWrite } from '../../../services/db/utils';
import { usersRepository } from '../../../services/db/usersRepository';
import { EMPTY_PREFERENCES, type FeedPreferences, type UserEngagementProfile, type UserInterests } from '../types';

export const EMPTY_PROFILE: UserEngagementProfile = {
  likedTags: {}, bookmarkedTags: {}, purchasedCategories: [], joinedCommunities: [], interactionHistory: [], seenItemIds: [],
};

// ---------------------------------------------------------------- interests

export async function getUserInterests(uid: string): Promise<UserInterests | null> {
  return dualRead(
    async () => {
      const snap = await getDoc(doc(db, 'userInterests', uid));
      return snap.exists() ? (snap.data() as UserInterests) : null;
    },
    async () => {
      const { data, error } = await getSupabase().from('user_interests').select('*').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        categories: data.categories || [],
        skills: data.skills || [],
        hashtags: data.hashtags || [],
        followedTopics: data.followed_topics || [],
      };
    },
    'user_interests'
  );
}

/** Merge topics (e.g. a post's hashtags from "Show more like this") into the viewer's interests. */
export async function addInterestTopics(uid: string, current: UserInterests | null, tags: string[]): Promise<UserInterests> {
  const slugs = tags.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const base = current || { categories: [], skills: [], hashtags: [], followedTopics: [] };
  const next: UserInterests = {
    ...base,
    followedTopics: [...new Set([...base.followedTopics, ...slugs])],
    hashtags: [...new Set([...base.hashtags, ...slugs.map(s => `#${s}`)])],
  };
  await usersRepository.saveInterests(uid, next);
  return next;
}

// ---------------------------------------------------------------- engagement profile

export async function getEngagementProfile(uid: string): Promise<UserEngagementProfile | null> {
  return dualRead(
    async () => {
      const snap = await getDoc(doc(db, 'userEngagementProfiles', uid));
      return snap.exists() ? { ...EMPTY_PROFILE, ...(snap.data() as Partial<UserEngagementProfile>) } : null;
    },
    async () => {
      const { data, error } = await getSupabase().from('user_engagement_profiles').select('*').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        likedTags: (data.liked_tags as Record<string, number>) || {},
        bookmarkedTags: (data.bookmarked_tags as Record<string, number>) || {},
        purchasedCategories: data.purchased_categories || [],
        joinedCommunities: data.joined_communities || [],
        interactionHistory: (data.interaction_history as UserEngagementProfile['interactionHistory']) || [],
        seenItemIds: data.seen_item_ids || [],
      };
    },
    'user_engagement_profiles'
  );
}

export async function saveEngagementProfile(uid: string, profile: UserEngagementProfile): Promise<void> {
  await dualWrite(
    () => setDoc(doc(db, 'userEngagementProfiles', uid), { ...profile, lastActive: serverTimestamp() }, { merge: true }),
    async () => {
      const { error } = await getSupabase().from('user_engagement_profiles').upsert({
        user_id: uid,
        liked_tags: profile.likedTags,
        bookmarked_tags: profile.bookmarkedTags,
        purchased_categories: profile.purchasedCategories,
        joined_communities: profile.joinedCommunities,
        interaction_history: profile.interactionHistory,
        seen_item_ids: profile.seenItemIds,
        updated_at: new Date().toISOString(),
      } as never);
      if (error) throw error;
    },
    'saveEngagementProfile'
  );
}

// ---------------------------------------------------------------- preferences

export async function getPreferences(uid: string): Promise<FeedPreferences> {
  return dualRead(
    async () => {
      const snap = await getDoc(doc(db, 'feedPreferences', uid));
      return snap.exists() ? { ...EMPTY_PREFERENCES, ...(snap.data() as Partial<FeedPreferences>) } : EMPTY_PREFERENCES;
    },
    async () => {
      const { data, error } = await getSupabase().from('feed_preferences').select('*').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!data) return EMPTY_PREFERENCES;
      return {
        hiddenItemIds: data.hidden_item_ids || [],
        mutedCreatorIds: data.muted_creator_ids || [],
        lessTopics: data.less_topics || [],
      };
    },
    'feed_preferences'
  );
}

/** Caps keep the documents small; the oldest entries fall off first. */
const PREFERENCE_CAPS: Record<keyof FeedPreferences, number> = { hiddenItemIds: 500, mutedCreatorIds: 500, lessTopics: 100 };

export async function savePreferences(uid: string, prefs: FeedPreferences): Promise<FeedPreferences> {
  const capped: FeedPreferences = {
    hiddenItemIds: prefs.hiddenItemIds.slice(-PREFERENCE_CAPS.hiddenItemIds),
    mutedCreatorIds: prefs.mutedCreatorIds.slice(-PREFERENCE_CAPS.mutedCreatorIds),
    lessTopics: prefs.lessTopics.slice(-PREFERENCE_CAPS.lessTopics),
  };
  await dualWrite(
    () => setDoc(doc(db, 'feedPreferences', uid), { ...capped, updatedAt: serverTimestamp() }),
    async () => {
      const { error } = await getSupabase().from('feed_preferences').upsert({
        user_id: uid,
        hidden_item_ids: capped.hiddenItemIds,
        muted_creator_ids: capped.mutedCreatorIds,
        less_topics: capped.lessTopics,
        updated_at: new Date().toISOString(),
      } as never);
      if (error) throw error;
    },
    'savePreferences'
  );
  return capped;
}
