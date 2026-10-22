import { db } from '../firebase';
import {
  doc, setDoc, deleteDoc, updateDoc, addDoc, getDocs, collection, query, where, limit, increment, serverTimestamp,
} from 'firebase/firestore';

/** Follow edges live on both sides: users/{me}/following/{them} and users/{them}/followers/{me}. */
export async function followUser(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) return;
  const createdAt = new Date().toISOString();
  await Promise.all([
    setDoc(doc(db, 'users', myUid, 'following', targetUid), { createdAt }),
    setDoc(doc(db, 'users', targetUid, 'followers', myUid), { createdAt }),
  ]);
}

export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'users', myUid, 'following', targetUid)),
    deleteDoc(doc(db, 'users', targetUid, 'followers', myUid)),
  ]);
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
  await setDoc(doc(db, 'communities', community.id, 'members', uid), {
    userId: uid,
    role: 'member',
    joinedAt: serverTimestamp(),
    ...extra,
  });

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
