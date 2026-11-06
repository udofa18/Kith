/**
 * Kith settings model.
 *
 * One typed object lives at `users/{uid}.settings`. It is intentionally nested so
 * new surfaces can add a group without growing the user document's top-level keys.
 * Legacy flat fields (`theme`, `layout`, `privacyPublicProfile`, …) are still read
 * during normalisation so existing accounts migrate without a backfill job.
 */

export type ThemePreference = 'dark' | 'light' | 'system';
export type ProfileVisibility = 'public' | 'followers' | 'hidden';
export type ContentAudience = 'public' | 'followers' | 'community' | 'only-me';
export type ViewerAudience = 'everyone' | 'followers' | 'mutuals' | 'me' | 'nobody';
export type CommunityViewerAudience = 'everyone' | 'followers' | 'members' | 'me';
export type InteractionAudience = 'anyone' | 'followers' | 'mutuals' | 'nobody';
export type InvitePolicy = 'anyone' | 'friends' | 'admins' | 'nobody';
export type DigestFrequency = 'realtime' | 'daily' | 'weekly' | 'off';
export type ReminderLead = '10m' | '1h' | '1d' | 'none';
export type SensitiveContent = 'show' | 'blur' | 'hide';
export type AutoplayPreference = 'always' | 'wifi' | 'never';
export type MediaRetention = 'never' | '30d' | '90d';
export type NotificationChannel = 'inApp' | 'push' | 'email';
export type NotificationCategory =
  | 'social'
  | 'messages'
  | 'communities'
  | 'events'
  | 'marketplace'
  | 'challenges'
  | 'rewards'
  | 'platform';

export type AccentTheme = 'coral' | 'amber' | 'lilac' | 'mint' | 'blush' | 'sky';

export interface ChannelPreference {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

export interface Settings {
  version: 1;

  profile: {
    visibility: ProfileVisibility;
    showFollowers: ViewerAudience;
    showFollowing: ViewerAudience;
    showCommunities: CommunityViewerAudience;
    showShowcase: {
      products: boolean;
      articles: boolean;
      communities: boolean;
      events: boolean;
      badges: boolean;
      xp: boolean;
      streak: boolean;
    };
    availableForWork: boolean;
  };

  privacy: {
    discoverable: boolean;
    searchIndex: boolean;
    suggestions: boolean;
    allowMentions: InteractionAudience;
    allowTags: InteractionAudience;
    allowCommunityInvites: InvitePolicy;
    allowEventInvites: InteractionAudience;
    allowGifts: InteractionAudience;
  };

  audience: {
    posts: ContentAudience;
    articles: ContentAudience;
    statuses: ContentAudience;
    products: ContentAudience;
    events: ContentAudience;
    live: ContentAudience;
    challenges: ContentAudience;
    comments: InteractionAudience;
    replies: InteractionAudience;
    reposts: InteractionAudience;
    pollVotes: InteractionAudience;
    allowForYou: boolean;
    allowSearchIndex: boolean;
    showEngagement: boolean;
  };

  messaging: {
    whoCanDM: InteractionAudience;
    whoCanCall: InteractionAudience;
    whoCanAddToGroupCalls: InteractionAudience;
    requests: boolean;
    autoAcceptMutuals: boolean;
    readReceipts: boolean;
    typingIndicators: boolean;
    showPresence: boolean;
    attachments: InteractionAudience;
    gifts: InteractionAudience;
    autoDeleteMedia: MediaRetention;
  };

  activity: {
    presence: ViewerAudience;
    lastActive: ViewerAudience;
    shareActivity: boolean;
    instantSessions: {
      visibleTo: ViewerAudience;
      notifyFollowers: boolean;
      autoShareToStatus: boolean;
      appearInHappeningNow: boolean;
      allowGuests: boolean;
    };
    statusAudience: ContentAudience;
    allowStatusReplies: InteractionAudience;
  };

  notifications: {
    matrix: Record<NotificationCategory, ChannelPreference>;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
    digest: DigestFrequency;
    sound: boolean;
    bundling: boolean;
    pauseUntil: string;
  };

  communities: {
    showMembership: CommunityViewerAudience;
    showRole: boolean;
    invitePolicy: InvitePolicy;
    defaultLevel: 'all' | 'mentions' | 'announcements' | 'none';
    allowAdminDMs: boolean;
    suggestCommunities: boolean;
    showInLeaderboard: boolean;
  };

  events: {
    defaultVisibility: 'public' | 'community' | 'unlisted' | 'followers';
    showAttending: ViewerAudience;
    showHosting: ViewerAudience;
    reminders: ReminderLead;
    liveChat: 'everyone' | 'registered' | 'nobody';
    requestToSpeak: boolean;
    recordSessions: boolean;
    captions: boolean;
    replay: boolean;
  };

  commerce: {
    storefrontVisibility: ContentAudience;
    showProducts: boolean;
    allowBuyerDMs: boolean;
    availableForWork: boolean;
  };

  rewards: {
    showXp: ViewerAudience;
    showBadges: ViewerAudience;
    showStreak: ViewerAudience;
    showInLeaderboard: boolean;
    allowGifts: InteractionAudience;
    notifyLevelUp: boolean;
  };

  appearance: {
    theme: ThemePreference;
    accent: AccentTheme;
    contrast: 'standard' | 'high';
    textScale: 'sm' | 'md' | 'lg' | 'xl';
    reduceMotion: 'system' | 'on' | 'off';
    density: 'compact' | 'comfortable';
    focusMode: boolean;
    readableFont: boolean;
    colorBlindSafe: boolean;
    captions: boolean;
    autoplay: AutoplayPreference;
    dataSaver: boolean;
  };

  feed: {
    defaultTab: 'for-you' | 'following';
    showReposts: boolean;
    showPolls: boolean;
    showArticles: boolean;
    showProductsEvents: boolean;
    sensitiveContent: SensitiveContent;
    pausePersonalization: boolean;
  };

  data: {
    personalization: boolean;
    searchHistory: boolean;
    watchHistory: boolean;
  };
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  social: 'Social',
  messages: 'Messages',
  communities: 'Communities',
  events: 'Events & live',
  marketplace: 'Marketplace',
  challenges: 'Challenges',
  rewards: 'XP & rewards',
  platform: 'From Kith',
};

export const NOTIFICATION_CATEGORY_HINTS: Record<NotificationCategory, string> = {
  social: 'Follows, likes, comments, replies, mentions, reposts and new posts from creators you subscribe to.',
  messages: 'Direct messages, message requests, group mentions and missed calls.',
  communities: 'Invites, join requests, role changes, announcements and moderation actions.',
  events: 'Reminders, instant sessions, event changes, live rooms and tickets.',
  marketplace: 'Orders, sales, payouts, price drops and review requests.',
  challenges: 'New challenges, deadlines, feedback and results.',
  rewards: 'Level ups, badges, gifts and streak milestones.',
  platform: 'Product news and occasional tips. Security alerts always stay on.',
};

export const INTERACTION_OPTIONS: Array<{ value: InteractionAudience; label: string }> = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
];

export const VIEWER_OPTIONS: Array<{ value: ViewerAudience; label: string }> = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'me', label: 'Only me' },
  { value: 'nobody', label: 'Nobody' },
];

export const COMMUNITY_VIEWER_OPTIONS: Array<{ value: CommunityViewerAudience; label: string }> = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'members', label: 'Members only' },
  { value: 'me', label: 'Only me' },
];

export const CONTENT_AUDIENCE_OPTIONS: Array<{ value: ContentAudience; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'community', label: 'Community' },
  { value: 'only-me', label: 'Only me' },
];

export const INVITE_OPTIONS: Array<{ value: InvitePolicy; label: string }> = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'friends', label: 'People I follow' },
  { value: 'admins', label: 'Community admins' },
  { value: 'nobody', label: 'Nobody' },
];
