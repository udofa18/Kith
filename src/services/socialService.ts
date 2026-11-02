import { db } from '../firebase';
import { getSupabase } from '../supabase';
import { dualRead, dualWrite } from './db/utils';
import {
  doc, setDoc, deleteDoc, updateDoc, addDoc, getDocs, collection, query, where, limit, increment, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { addFeePayment, feeOf } from '../lib/communityPricing';

/** Follow edges live on both sides: users/{me}/following/{them} and users/{them}/followers/{me}. */
export async function followUser(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) return;
  const createdAt = new Date().toISOString();
  await dualWrite(
    () => Promise.all([
      setDoc(doc(db, 'users', myUid, 'following', targetUid), { createdAt }),
      setDoc(doc(db, 'users', targetUid, 'followers', myUid), { createdAt }),
    ]).then(() => undefined),
    async () => {
      const sb = getSupabase();
      const results = await Promise.all([
        sb.from('user_following').upsert({ user_id: myUid, following_id: targetUid, created_at: createdAt } as never),
        sb.from('user_followers').upsert({ user_id: targetUid, follower_id: myUid, created_at: createdAt } as never),
      ]);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    'followUser'
  );
}

export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  await dualWrite(
    () => Promise.all([
      deleteDoc(doc(db, 'users', myUid, 'following', targetUid)),
      deleteDoc(doc(db, 'users', targetUid, 'followers', myUid)),
    ]).then(() => undefined),
    async () => {
      const sb = getSupabase();
      const results = await Promise.all([
        sb.from('user_following').delete().eq('user_id', myUid).eq('following_id', targetUid),
        sb.from('user_followers').delete().eq('user_id', targetUid).eq('follower_id', myUid),
      ]);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    'unfollowUser'
  );
}

export async function getFollowingIds(uid: string): Promise<string[]> {
  return dualRead(
    async () => (await getDocs(collection(db, 'users', uid, 'following'))).docs.map(d => d.id),
    async () => {
      const { data, error } = await getSupabase().from('user_following').select('following_id').eq('user_id', uid);
      if (error) throw error;
      return (data || []).map(r => (r as { following_id: string }).following_id);
    },
    'user_following'
  );
}

/** True when a community can be joined in one tap (no approval, payment, or questions). */
export function isOpenCommunity(community: any): boolean {
  const control = community?.membershipControl;
  return !community?.isPrivate &&
    !community?.isPaid &&
    (control?.accessType ?? 'public') === 'public' &&
    !control?.approvalRequired &&
    !(control?.onboardingQuestions?.length > 0);
}

/**
 * Create the membership doc, bump memberCount, and post the welcome message.
 * Gating (approval, payment, questions) is the caller's responsibility.
 */
export async function joinCommunity(
  uid: string,
  displayName: string | null,
  community: { id: string; [key: string]: any },
  extra: Record<string, unknown> = {}
): Promise<void> {
  // Membership and any joining fee are written together, so paying and joining can't come apart.
  const batch = writeBatch(db);
  batch.set(doc(db, 'communities', community.id, 'members', uid), {
    userId: uid,
    role: 'member',
    joinedAt: serverTimestamp(),
    ...extra,
  });
  const fee = feeOf(community);
  if (fee && community.creatorId !== uid) addFeePayment(batch, fee, uid, community.creatorId);
  await batch.commit();

  try {
    await updateDoc(doc(db, 'communities', community.id), { memberCount: increment(1) });
  } catch (err) {
    // Membership already exists; a stale count is not worth failing the join.
    console.error('Failed to update community member count:', err);
  }

  try {
    await postWelcomeMessage(community, displayName);
  } catch (err) {
    console.error('Error sending join notification:', err);
  }
}

export async function leaveCommunity(uid: string, communityId: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', communityId, 'members', uid));
  try {
    await updateDoc(doc(db, 'communities', communityId), { memberCount: increment(-1) });
  } catch (err) {
    console.error('Failed to update community member count:', err);
  }
}

/** Posts to the configured welcome channel, falling back to #general. */
async function postWelcomeMessage(community: { id: string; [key: string]: any }, displayName: string | null) {
  const name = displayName || 'A new user';
  const welcomeConfig = community.welcomeConfig;

  let channelId: string | undefined;
  let content: string;
  let buttons: unknown[] | undefined;

  if (welcomeConfig?.enabled) {
    channelId = welcomeConfig.channelId;
    content = (welcomeConfig.message || '{username} just joined the community!')
      .replace(/\{username\}/g, name)
      .replace(/\{community\}/g, community.name || 'the community');
    buttons = welcomeConfig.buttons || [];
  } else {
    const snap = await getDocs(query(collection(db, 'communities', community.id, 'channels'), where('name', '==', 'general'), limit(1)));
    channelId = snap.docs[0]?.id;
    content = `${name} just joined the community!`;
  }

  if (!channelId) return;

  await addDoc(collection(db, 'communities', community.id, 'channels', channelId, 'messages'), {
    content,
    authorUid: 'system-bot',
    authorName: 'System Bot',
    authorPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=system-bot',
    createdAt: serverTimestamp(),
    type: 'welcome',
    isBot: true,
    ...(buttons ? { buttons } : {}),
  });

  await updateDoc(doc(db, 'communities', community.id, 'channels', channelId), {
    lastMessage: `${name} joined`,
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
  });
}
