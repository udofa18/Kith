import { db } from '../firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 
  | 'like' | 'comment' | 'mention' | 'message' | 'message_request' | 'xp_gift' | 'challenge' | 'channel_mention' 
  | 'purchase' | 'payout' | 'event_invite' | 'event_reminder' | 'system' | 'wallet'
  | 'repost' | 'quote' | 'new_post';

export type NotificationCategory = 'social' | 'community' | 'marketplace' | 'events' | 'earnings' | 'system';

interface CreateNotificationParams {
  recipientId: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  senderPhoto?: string;
  type: NotificationType;
  category?: NotificationCategory;
  priority?: 'low' | 'normal' | 'high';
  content: string;
  relatedId?: string;
  communityId?: string;
  channelId?: string;
}

export async function createNotification({
  recipientId,
  senderId,
  senderName,
  senderUsername,
  senderPhoto,
  type,
  category,
  priority = 'normal',
  content,
  relatedId,
  communityId,
  channelId
}: CreateNotificationParams) {
  if (!recipientId) return;

  // Auto-determine category if not provided
  let finalCategory: NotificationCategory = category || 'system';
  if (!category) {
    if (['like', 'comment', 'mention', 'repost', 'quote', 'new_post'].includes(type)) finalCategory = 'social';
    else if (['message', 'message_request', 'channel_mention', 'challenge'].includes(type)) finalCategory = 'community';
    else if (['purchase'].includes(type)) finalCategory = 'marketplace';
    else if (['payout', 'xp_gift', 'wallet'].includes(type)) finalCategory = 'earnings';
    else if (['event_invite', 'event_reminder'].includes(type)) finalCategory = 'events';
  }

  // Respect the recipient's notification matrix before writing anything. This is
  // best-effort in the client; the rules remain the security boundary.
  try {
    const settingsCategory =
      type === 'message' || type === 'message_request'
        ? 'messages'
        : type === 'challenge'
          ? 'challenges'
          : type === 'xp_gift'
            ? 'rewards'
            : type === 'channel_mention'
              ? 'communities'
              : ['event_invite', 'event_reminder'].includes(type)
                ? 'events'
                : ['purchase', 'payout', 'wallet'].includes(type)
                  ? 'marketplace'
                  : ['like', 'comment', 'mention', 'repost', 'quote', 'new_post'].includes(type)
                    ? 'social'
                    : 'platform';
    const recipient = await getDoc(doc(db, 'users', recipientId)).catch(() => null);
    const matrix = recipient?.data()?.settings?.notifications?.matrix;
    if (matrix?.[settingsCategory]?.inApp === false) return;
  } catch {
    /* never block the action that produced the notification */
  }

    try {
    await addDoc(collection(db, 'notifications'), {
      recipientId,
      senderId: senderId || 'system',
      senderName: senderName || 'System',
      senderUsername: senderUsername || '',
      senderPhoto: senderPhoto || '',
      type,
      category: finalCategory,
      priority,
      content,
      relatedId: relatedId || '',
      communityId: communityId || '',
      channelId: channelId || '',
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}
