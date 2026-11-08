/**
 * One vocabulary for notification categories.
 *
 * The settings matrix speaks in audience terms (messages, communities,
 * challenges, rewards, platform). Notification documents and the centre group
 * the same activity into delivery buckets (social, community, earnings…).
 * Keeping both maps here means writers, badges and the centre can never drift.
 */

export type AppNotificationCategory =
  | 'social'
  | 'community'
  | 'marketplace'
  | 'events'
  | 'earnings'
  | 'system';

export type SettingsNotificationCategory =
  | 'social'
  | 'messages'
  | 'communities'
  | 'events'
  | 'marketplace'
  | 'challenges'
  | 'rewards'
  | 'platform';

const APP_CATEGORIES: AppNotificationCategory[] = [
  'social',
  'community',
  'marketplace',
  'events',
  'earnings',
  'system',
];

const SETTINGS_CATEGORIES: SettingsNotificationCategory[] = [
  'social',
  'messages',
  'communities',
  'events',
  'marketplace',
  'challenges',
  'rewards',
  'platform',
];

const APP_ALIASES: Record<string, AppNotificationCategory> = {
  social: 'social',
  message: 'social',
  messages: 'social',
  community: 'community',
  communities: 'community',
  challenge: 'community',
  challenges: 'community',
  marketplace: 'marketplace',
  commerce: 'marketplace',
  events: 'events',
  event: 'events',
  earnings: 'earnings',
  reward: 'earnings',
  rewards: 'earnings',
  wallet: 'earnings',
  system: 'system',
  platform: 'system',
};

/** Accepts legacy category names and always returns an app bucket. */
export function normalizeAppCategory(category?: string | null): AppNotificationCategory {
  const value = (category || '').trim().toLowerCase();
  return APP_ALIASES[value] ?? (APP_CATEGORIES.includes(value as AppNotificationCategory)
    ? (value as AppNotificationCategory)
    : 'system');
}

export function isAppNotificationCategory(value: unknown): value is AppNotificationCategory {
  return typeof value === 'string' && APP_CATEGORIES.includes(value as AppNotificationCategory);
}

/** The centre bucket a notification type belongs in. */
export function appCategoryForType(type?: string | null): AppNotificationCategory {
  switch (type) {
    case 'like':
    case 'comment':
    case 'mention':
    case 'repost':
    case 'quote':
    case 'new_post':
    case 'message':
    case 'message_request':
      return 'social';
    case 'channel_mention':
    case 'community':
    case 'challenge':
      return 'community';
    case 'purchase':
      return 'marketplace';
    case 'payout':
    case 'xp_gift':
    case 'wallet':
      return 'earnings';
    case 'event_invite':
    case 'event_reminder':
      return 'events';
    case 'system':
      return 'system';
    default:
      return 'system';
  }
}

/** The matrix row a notification type is governed by. */
export function settingsCategoryForType(type?: string | null): SettingsNotificationCategory {
  switch (type) {
    case 'like':
    case 'comment':
    case 'mention':
    case 'repost':
    case 'quote':
    case 'new_post':
      return 'social';
    case 'message':
    case 'message_request':
      return 'messages';
    case 'channel_mention':
    case 'community':
      return 'communities';
    case 'challenge':
      return 'challenges';
    case 'purchase':
    case 'payout':
      return 'marketplace';
    case 'xp_gift':
    case 'wallet':
      return 'rewards';
    case 'event_invite':
    case 'event_reminder':
      return 'events';
    case 'system':
    default:
      return 'platform';
  }
}

export function isSettingsNotificationCategory(value: unknown): value is SettingsNotificationCategory {
  return typeof value === 'string' && SETTINGS_CATEGORIES.includes(value as SettingsNotificationCategory);
}

/** DMs are surfaced by the Messages badge, not the bell. */
export function isDirectMessageType(type?: string | null, content?: string | null): boolean {
  if (type !== 'message' && type !== 'message_request') return false;
  // Live-session invites are stored as message-type notifications but route to
  // the event room, so they belong in the bell like any other invite.
  if (type === 'message' && /live session|instant session/i.test(content || '')) return false;
  return true;
}

export function unreadBellCount(
  notifications: Array<{ type?: string; read?: boolean; content?: string }>,
): number {
  return notifications.filter((notification) =>
    !notification.read && !isDirectMessageType(notification.type, notification.content)
  ).length;
}
