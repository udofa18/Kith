import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getSupabase } from '../../../supabase';
import { dualRead } from '../../../services/db/utils';
import { getFollowingIds } from '../../../services/socialService';
import type { UserEngagementProfile, UserInterests, ViewerContext } from '../types';

async function getUserInterests(uid: string): Promise<UserInterests | null> {
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

async function getEngagementProfile(uid: string): Promise<UserEngagementProfile | null> {
  return dualRead(
    async () => {
      const snap = await getDoc(doc(db, 'userEngagementProfiles', uid));
      return snap.exists() ? (snap.data() as UserEngagementProfile) : null;
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
      };
    },
    'user_engagement_profiles'
  );
}

async function getBlockedIds(uid: string): Promise<string[]> {
  return dualRead(
    async () => (await getDocs(collection(db, 'users', uid, 'blockedUsers'))).docs.map(d => d.id),
    async () => {
      const { data, error } = await getSupabase().from('user_blocked_users').select('blocked_user_id').eq('user_id', uid);
      if (error) throw error;
      return (data || []).map(r => r.blocked_user_id);
    },
    'user_blocked_users'
  );
}

const settle = async <T,>(promise: Promise<T>, fallback: T, label: string): Promise<T> => {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[feed] ${label} unavailable:`, err);
    return fallback;
  }
};

/** Viewer data used for ranking. A failed lookup degrades ranking rather than breaking the feed. */
export async function fetchViewerContext(uid: string | null): Promise<ViewerContext> {
  if (!uid) return { uid: null, followingIds: new Set(), blockedIds: new Set(), interests: null, profile: null };

  const [followingIds, blockedIds, interests, profile] = await Promise.all([
    settle(getFollowingIds(uid), [], 'following'),
    settle(getBlockedIds(uid), [], 'blocked users'),
    settle(getUserInterests(uid), null, 'interests'),
    settle(getEngagementProfile(uid), null, 'engagement profile'),
  ]);
  return { uid, followingIds: new Set(followingIds), blockedIds: new Set(blockedIds), interests, profile };
}
