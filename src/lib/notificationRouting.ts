/**
 * Where a notification should take you. Used by the centre and by live toasts
 * so both always land on the same screen.
 */

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
      // Live-session invites were written as messages; route them to the room.
      if (relatedId && /live session|instant session/i.test(content)) {
        return `/events/${relatedId}`;
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
      return relatedId ? `/challenges/${relatedId}` : '/challenges';

    case 'xp_gift':
      return '/dashboard';

    case 'purchase':
    case 'payout':
      return '/marketplace';

    case 'event_invite':
    case 'event_reminder':
      return relatedId ? `/events/${relatedId}` : '/events';

    default:
      return null;
  }
}
