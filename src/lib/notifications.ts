import { db } from '../firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { appCategoryForType, settingsCategoryForType } from './notificationTaxonomy';
import { isPauseActive } from './notificationPreferences';

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

  // Never notify someone about their own action. This also stops accidental
  // self-targeted XP, like and follow events from inflating the bell.
  if (senderId && senderId === recipientId) return;

  const finalCategory: NotificationCategory = category || appCategoryForType(type);
  const settingsCategory = settingsCategoryForType(type);

  // Respect the recipient's notification matrix before writing anything. This is
  // best-effort in the client; the rules remain the security boundary.
  // System notices are account-critical and always land in-app.
  try {
    if (type !== 'system') {
      const recipient = await getDoc(doc(db, 'users', recipientId)).catch(() => null);
      const preferences = recipient?.data()?.settings?.notifications;
      if (preferences?.matrix?.[settingsCategory]?.inApp === false) return;
      // "Pause everything" is a temporary break from non-security activity.
      if (isPauseActive(preferences?.pauseUntil)) return;
    }
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
