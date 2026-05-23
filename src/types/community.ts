import { Timestamp } from 'firebase/firestore';

export type UserRole = 'owner' | 'admin' | 'moderator' | 'member';
export type MemberStatus = 'active' | 'muted' | 'restricted' | 'banned';
export type ChannelType = 'feed' | 'chat' | 'code' | 'resources' | 'announcements' | 'voice' | 'live';

export interface CommunityMember {
  userId: string;
  role: UserRole;
  status: MemberStatus;
  permissions: string[];
  joinedAt: Timestamp;
  xp: number;
  badges: string[];
  subscriptionId?: string;
  subscriptionStatus?: string;
}

export interface ChannelPermissions {
  view: string[]; // roles allowed to view
  post: string[]; // roles allowed to post
  manage: string[]; // roles allowed to manage
}

export interface CommunityChannel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  order: number;
  isPremium: boolean;
  isFrozen: boolean;
  messageCount: number;
  permissions?: ChannelPermissions;
  voiceConfig?: {
    mode: 'open' | 'stage' | 'private';
    maxParticipants?: number;
    slowMode?: boolean;
    recordingEnabled?: boolean;
  };
  createdAt: Timestamp;
}

export interface CommunityBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  criteria: string;
  xpReward?: number;
}

export interface CommunityInvite {
  id: string;
  communityId: string;
  creatorId: string;
  code: string;
  uses: number;
  maxUses: number;
  rewardXp: number;
  expiresAt?: Timestamp;
}

export interface CommunityAnalytics {
  activeMembers: number;
  engagementRate: number;
  topContributors: Array<{ userId: string; xp: number; name: string }>;
  retention: number;
  dailyStats: Array<{
    date: string;
    activeMembers: number;
    newMessages: number;
  }>;
}
