import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getSupabase } from '../../../supabase';
import { dualRead } from '../../../services/db/utils';
import { getFollowingIds } from '../../../services/socialService';
import { EMPTY_PREFERENCES, type ViewerContext } from '../types';
import { getEngagementProfile, getPreferences, getUserInterests } from '../signals/store';

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
  if (!uid) {
    return { uid: null, followingIds: new Set(), blockedIds: new Set(), interests: null, profile: null, preferences: EMPTY_PREFERENCES };
  }

  const [followingIds, blockedIds, interests, profile, preferences] = await Promise.all([
    settle(getFollowingIds(uid), [], 'following'),
    settle(getBlockedIds(uid), [], 'blocked users'),
    settle(getUserInterests(uid), null, 'interests'),
    settle(getEngagementProfile(uid), null, 'engagement profile'),
    settle(getPreferences(uid), EMPTY_PREFERENCES, 'feed preferences'),
  ]);
  return { uid, followingIds: new Set(followingIds), blockedIds: new Set(blockedIds), interests, profile, preferences };
}
