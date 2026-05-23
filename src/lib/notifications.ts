import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 
  | 'like' | 'comment' | 'mention' | 'message' | 'xp_gift' | 'challenge' | 'channel_mention' 
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
    else if (['message', 'channel_mention', 'challenge'].includes(type)) finalCategory = 'community';
    else if (['purchase'].includes(type)) finalCategory = 'marketplace';
    else if (['payout', 'xp_gift', 'wallet'].includes(type)) finalCategory = 'earnings';
    else if (['event_invite', 'event_reminder'].includes(type)) finalCategory = 'events';
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
