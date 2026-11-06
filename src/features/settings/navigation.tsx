import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  CalendarDays,
  CreditCard,
  Database,
  Eye,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  User,
  UserX,
  Users,
  Zap,
} from 'lucide-react';

export type SectionId =
  | 'profile'
  | 'account'
  | 'security'
  | 'privacy'
  | 'audience'
  | 'messaging'
  | 'activity'
  | 'restricted'
  | 'notifications'
  | 'communities'
  | 'events'
  | 'commerce'
  | 'rewards'
  | 'appearance'
  | 'feed'
  | 'billing'
  | 'data'
  | 'danger';

export interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
}

export interface SectionGroup {
  label: string;
  sections: SectionMeta[];
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    label: 'You',
    sections: [
      {
        id: 'profile',
        label: 'Profile',
        description: 'Your public identity, showcase and profile visibility.',
        icon: User,
        keywords: ['name', 'username', 'bio', 'avatar', 'links', 'showcase', 'hide profile'],
      },
      {
        id: 'account',
        label: 'Account',
        description: 'Email, language, region and onboarding.',
        icon: Mail,
        keywords: ['email', 'language', 'timezone', 'region', 'onboarding', 'deactivate'],
      },
      {
        id: 'security',
        label: 'Security & sign-in',
        description: 'Password, providers and sign-in protection.',
        icon: Shield,
        keywords: ['password', '2fa', 'providers', 'sessions', 'sign out'],
      },
    ],
  },
  {
    label: 'Privacy & people',
    sections: [
      {
        id: 'privacy',
        label: 'Privacy & visibility',
        description: 'Who can find you, follow you and see your profile.',
        icon: Lock,
        keywords: ['private', 'hidden', 'search', 'followers', 'mentions', 'tags', 'gifts', 'quiet'],
      },
      {
        id: 'audience',
        label: 'Audience & content',
        description: 'Default audiences and who can interact with your work.',
        icon: Eye,
        keywords: ['posts', 'followers', 'public', 'comments', 'replies', 'reposts', 'articles', 'status'],
      },
      {
        id: 'messaging',
        label: 'Messages & calls',
        description: 'Who can message you, call you and see receipts.',
        icon: MessageCircle,
        keywords: ['dm', 'direct messages', 'no dms', 'calls', 'requests', 'typing', 'receipts'],
      },
      {
        id: 'activity',
        label: 'Activity & presence',
        description: 'Presence, instant sessions and status sharing.',
        icon: Activity,
        keywords: ['active now', 'last active', 'instant', 'live', 'status', 'presence'],
      },
      {
        id: 'restricted',
        label: 'Muted, blocked & hidden',
        description: 'People and topics you have filtered out.',
        icon: UserX,
        keywords: ['block', 'mute', 'restrict', 'hidden posts', 'reset recommendations'],
      },
    ],
  },
  {
    label: 'Life on Kith',
    sections: [
      {
        id: 'notifications',
        label: 'Notifications',
        description: 'Choose exactly what reaches you, and where.',
        icon: Bell,
        keywords: ['push', 'email', 'in-app', 'quiet hours', 'digest', 'pause'],
      },
      {
        id: 'communities',
        label: 'Communities',
        description: 'Membership visibility, invites and notification defaults.',
        icon: Users,
        keywords: ['circles', 'membership', 'roles', 'invites', 'leaderboard'],
      },
      {
        id: 'events',
        label: 'Events & live',
        description: 'Default event visibility, reminders and live defaults.',
        icon: CalendarDays,
        keywords: ['instant', 'live', 'reminders', 'record', 'captions', 'happening now'],
      },
      {
        id: 'commerce',
        label: 'Creator & commerce',
        description: 'Storefront visibility, buyer messages and selling.',
        icon: ShoppingBag,
        keywords: ['products', 'storefront', 'marketplace', 'buyer', 'for work'],
      },
      {
        id: 'rewards',
        label: 'XP & rewards',
        description: 'Level, badges, streaks and gifting.',
        icon: Zap,
        keywords: ['xp', 'level', 'badges', 'streak', 'leaderboard', 'gifts'],
      },
    ],
  },
  {
    label: 'Experience',
    sections: [
      {
        id: 'appearance',
        label: 'Appearance & accessibility',
        description: 'Theme, accent, text size, motion and density.',
        icon: Palette,
        keywords: ['dark', 'light', 'system', 'accent', 'color', 'font', 'contrast', 'motion'],
      },
      {
        id: 'feed',
        label: 'Feed & content',
        description: 'Default feed, content types and personalisation.',
        icon: SlidersHorizontal,
        keywords: ['for you', 'following', 'reposts', 'sensitive', 'recommendations'],
      },
    ],
  },
  {
    label: 'Account',
    sections: [
      {
        id: 'billing',
        label: 'Billing & payouts',
        description: 'Purchases, library and creator earnings.',
        icon: CreditCard,
        keywords: ['receipts', 'payments', 'payouts', 'stripe', 'library'],
      },
      {
        id: 'data',
        label: 'Data & archive',
        description: 'Download, export and clear your activity.',
        icon: Database,
        keywords: ['download', 'export', 'history', 'personalization', 'archive'],
      },
      {
        id: 'danger',
        label: 'Danger zone',
        description: 'Irreversible account actions.',
        icon: Trash2,
        keywords: ['delete', 'deactivate', 'remove account', 'leave'],
      },
    ],
  },
];

export const ALL_SECTIONS = SECTION_GROUPS.flatMap((group) => group.sections);

export const getSection = (id: string): SectionMeta =>
  ALL_SECTIONS.find((section) => section.id === id) ?? ALL_SECTIONS[0];
