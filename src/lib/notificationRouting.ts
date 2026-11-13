/**
 * Where a notification should take you. Used by the centre and by live toasts
 * so both always land on the same screen.
 */

import { CHALLENGES_ENABLED } from './features';

export interface RoutableNotification {
  type?: string;
  relatedId?: string;
  channelId?: string;
  senderId?: string;
  content?: string;
}

export function isCommunityNotification(notification: RoutableNotification): boolean {
  if (notification.channelId) return true;
  if (notification.type === 'channel_mention') return true;
  if (notification.type === 'message') {
    const content = (notification.content || '').toLowerCase();
    return content.includes('in #') || content.includes('community');
  }
  return false;
}

export function notificationTarget(
  notification: RoutableNotification,
  options: { isCommunity?: boolean } = {},
): string | null {
  const { type, relatedId, channelId, senderId, content = '' } = notification;

  switch (type) {
    case 'like':
    case 'comment':
    case 'mention':
    case 'repost':
    case 'quote':
    case 'new_post':
      return relatedId ? `/post/${relatedId}` : null;

    case 'channel_mention':
    case 'message':
    case 'message_request':
      // Live-session invites were written as messages; route them to the room,
      // never to the host-only event-details page.
      if (relatedId && /live session|instant session|live now/i.test(content)) {
        return `/live/${relatedId}`;
      }
      if (options.isCommunity ?? isCommunityNotification(notification)) {
        if (!relatedId) return null;
        return channelId
          ? `/feed?view=community&id=${relatedId}&channelId=${channelId}`
          : `/feed?view=community&id=${relatedId}`;
      }
      return senderId ? `/feed?view=messages&userId=${senderId}` : null;

    case 'community':
      return relatedId ? `/feed?view=community&id=${relatedId}&settings=members` : null;

    case 'community_post':
      if (!relatedId) return null;
      return channelId
        ? `/feed?view=community&id=${relatedId}&channelId=${channelId}`
        : `/feed?view=community&id=${relatedId}`;

    case 'challenge':
      if (!CHALLENGES_ENABLED) return '/feed';
      return relatedId ? `/challenges/${relatedId}` : '/challenges';

    case 'xp_gift':
      return '/dashboard';

    case 'purchase':
    case 'payout':
      return '/marketplace';

    case 'event_invite':
    case 'event_reminder':
      if (!relatedId) return '/events';
      // Instant-session invites ("is live now") open the room. Scheduled event
      // invites keep their public details page.
      return /live now|live session|instant session/i.test(content)
        ? `/live/${relatedId}`
        : `/events/${relatedId}`;

    default:
      return null;
  }
}
