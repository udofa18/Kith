import type {
  AccentTheme,
  ChannelPreference,
  NotificationCategory,
  Settings,
} from './types';

const channels = (inApp: boolean, push: boolean, email: boolean): ChannelPreference => ({
  inApp,
  push,
  email,
});

export const DEFAULT_SETTINGS: Settings = {
  version: 1,

  profile: {
    visibility: 'public',
    showFollowers: 'everyone',
    showFollowing: 'everyone',
    showCommunities: 'everyone',
    showShowcase: {
      products: true,
      articles: true,
      communities: true,
      events: true,
      badges: true,
      xp: true,
      streak: true,
    },
    availableForWork: false,
  },

  privacy: {
    discoverable: true,
    searchIndex: true,
    suggestions: true,
    allowMentions: 'anyone',
    allowTags: 'followers',
    allowCommunityInvites: 'friends',
    allowEventInvites: 'followers',
    allowGifts: 'followers',
  },

  audience: {
    posts: 'public',
    articles: 'public',
    statuses: 'followers',
    products: 'public',
    events: 'public',
    live: 'followers',
    challenges: 'public',
    comments: 'anyone',
    replies: 'anyone',
    reposts: 'anyone',
    pollVotes: 'anyone',
    allowForYou: true,
    allowSearchIndex: false,
    showEngagement: true,
  },

  messaging: {
    whoCanDM: 'anyone',
    whoCanCall: 'mutuals',
    whoCanAddToGroupCalls: 'mutuals',
    requests: true,
    autoAcceptMutuals: true,
    readReceipts: true,
    typingIndicators: true,
    showPresence: true,
    attachments: 'anyone',
    gifts: 'followers',
    autoDeleteMedia: 'never',
  },

  activity: {
    presence: 'everyone',
    lastActive: 'followers',
    shareActivity: false,
    instantSessions: {
      visibleTo: 'followers',
      notifyFollowers: false,
      autoShareToStatus: false,
      appearInHappeningNow: true,
      allowGuests: false,
    },
    statusAudience: 'followers',
    allowStatusReplies: 'followers',
  },

  notifications: {
    matrix: {
      social: channels(true, true, false),
      messages: channels(true, true, false),
      communities: channels(true, true, false),
      events: channels(true, true, false),
      marketplace: channels(true, true, true),
      challenges: channels(true, false, false),
      rewards: channels(true, false, false),
      platform: channels(true, false, true),
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
    digest: 'realtime',
    sound: true,
    bundling: true,
    pauseUntil: '',
  },

  communities: {
    showMembership: 'everyone',
    showRole: true,
    invitePolicy: 'friends',
    defaultLevel: 'mentions',
    allowAdminDMs: true,
    suggestCommunities: true,
    showInLeaderboard: true,
  },

  events: {
    defaultVisibility: 'public',
    showAttending: 'followers',
    showHosting: 'everyone',
    reminders: '1h',
    liveChat: 'registered',
    requestToSpeak: true,
    recordSessions: false,
    captions: false,
    replay: false,
  },

  commerce: {
    storefrontVisibility: 'public',
    showProducts: true,
    allowBuyerDMs: true,
    availableForWork: false,
  },

  rewards: {
    showXp: 'everyone',
    showBadges: 'everyone',
    showStreak: 'followers',
    showInLeaderboard: true,
    allowGifts: 'followers',
    notifyLevelUp: true,
  },

  appearance: {
    theme: 'dark',
    accent: 'coral',
    contrast: 'standard',
    textScale: 'md',
    reduceMotion: 'system',
    density: 'comfortable',
    focusMode: false,
    readableFont: false,
    colorBlindSafe: false,
    captions: false,
    autoplay: 'wifi',
    dataSaver: false,
  },

  feed: {
    defaultTab: 'for-you',
    showReposts: true,
    showPolls: true,
    showArticles: true,
    showProductsEvents: true,
    sensitiveContent: 'blur',
    pausePersonalization: false,
  },

  data: {
    personalization: true,
    searchHistory: true,
    watchHistory: true,
  },
};

export interface AccentDefinition {
  id: AccentTheme;
  label: string;
  swatch: string;
  dark: {
    primary: string;
    primaryHover: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
  };
  light: {
    primary: string;
    primaryHover: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
  };
}

/**
 * Accent presets tint primary actions, links, focus rings and highlights.
 * Each preset carries a light and dark variant so contrast survives theme changes.
 */
export const ACCENTS: AccentDefinition[] = [
  {
    id: 'coral',
    label: 'Coral',
    swatch: '#ff6b4a',
    dark: {
      primary: '#ff6b4a',
      primaryHover: '#e85b3d',
      primaryForeground: '#1a1210',
      accent: '#ffb65c',
      accentForeground: '#1a1210',
    },
    light: {
      primary: '#c9452a',
      primaryHover: '#b23a24',
      primaryForeground: '#fff8f0',
      accent: '#a86a1f',
      accentForeground: '#fff8f0',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#ffb65c',
    dark: {
      primary: '#ffb65c',
      primaryHover: '#f0a445',
      primaryForeground: '#1a1210',
      accent: '#ff6b4a',
      accentForeground: '#1a1210',
    },
    light: {
      primary: '#a86a1f',
      primaryHover: '#8f5817',
      primaryForeground: '#fff8f0',
      accent: '#c9452a',
      accentForeground: '#fff8f0',
    },
  },
  {
    id: 'lilac',
    label: 'Lilac',
    swatch: '#b69cff',
    dark: {
      primary: '#b69cff',
      primaryHover: '#a684f5',
      primaryForeground: '#1a1210',
      accent: '#f3a6c9',
      accentForeground: '#1a1210',
    },
    light: {
      primary: '#6d4ad1',
      primaryHover: '#5b3ab8',
      primaryForeground: '#fff8f0',
      accent: '#b04d7c',
      accentForeground: '#fff8f0',
    },
  },
  {
    id: 'mint',
    label: 'Mint',
    swatch: '#82e6c8',
    dark: {
      primary: '#82e6c8',
      primaryHover: '#6cd8b8',
      primaryForeground: '#102820',
      accent: '#9ad8ff',
      accentForeground: '#10222a',
    },
    light: {
      primary: '#1f7a5c',
      primaryHover: '#176349',
      primaryForeground: '#f6fff9',
      accent: '#1f6f9e',
      accentForeground: '#f6fbff',
    },
  },
  {
    id: 'blush',
    label: 'Blush',
    swatch: '#f3a6c9',
    dark: {
      primary: '#f3a6c9',
      primaryHover: '#e88fb7',
      primaryForeground: '#2a101c',
      accent: '#b69cff',
      accentForeground: '#1a1210',
    },
    light: {
      primary: '#b04d7c',
      primaryHover: '#984067',
      primaryForeground: '#fff8f0',
      accent: '#6d4ad1',
      accentForeground: '#fff8f0',
    },
  },
  {
    id: 'sky',
    label: 'Sky',
    swatch: '#9ad8ff',
    dark: {
      primary: '#9ad8ff',
      primaryHover: '#7fc9f5',
      primaryForeground: '#10222a',
      accent: '#82e6c8',
      accentForeground: '#102820',
    },
    light: {
      primary: '#1f6f9e',
      primaryHover: '#175b82',
      primaryForeground: '#f6fbff',
      accent: '#1f7a5c',
      accentForeground: '#f6fff9',
    },
  },
];

export const ACCENT_BY_ID = Object.fromEntries(ACCENTS.map((accent) => [accent.id, accent])) as Record<
  AccentTheme,
  AccentDefinition
>;

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'social',
  'messages',
  'communities',
  'events',
  'marketplace',
  'challenges',
  'rewards',
  'platform',
];
