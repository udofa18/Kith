/**
 * Channel types as members see them. Stored ids are kept for compatibility: `feed` is shown as
 * "Posts", and the older `code` / `resources` / `text` types behave exactly like Chat.
 */
import { Hash, Megaphone, Newspaper, Radio, Volume2, type LucideIcon } from 'lucide-react';

export type ChannelTypeId = 'chat' | 'feed' | 'announcements' | 'voice' | 'live';

export interface ChannelTypeInfo {
  id: ChannelTypeId;
  label: string;
  /** One line: what happens in this kind of channel. */
  description: string;
  /** Who can post, in plain words. */
  whoPosts: string;
  icon: LucideIcon;
  /** Name ideas shown when creating one. */
  suggestions: string[];
}

export const CHANNEL_TYPES: ChannelTypeInfo[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Quick back-and-forth messages, like a group chat.',
    whoPosts: 'Everyone can chat',
    icon: Hash,
    suggestions: ['general', 'introductions', 'off-topic', 'help'],
  },
  {
    id: 'feed',
    label: 'Posts',
    description: 'Longer posts people can like and comment on, like a mini feed.',
    whoPosts: 'Everyone can post',
    icon: Newspaper,
    suggestions: ['showcase', 'wins', 'questions', 'ideas'],
  },
  {
    id: 'announcements',
    label: 'Announcements',
    description: 'Important news from the team. Members read and react.',
    whoPosts: 'Only admins can post',
    icon: Megaphone,
    suggestions: ['announcements', 'updates', 'news'],
  },
  {
    id: 'voice',
    label: 'Voice room',
    description: 'Drop in and talk. Anyone can join or leave at any time.',
    whoPosts: 'Everyone can talk',
    icon: Volume2,
    suggestions: ['lounge', 'hangout', 'co-working'],
  },
  {
    id: 'live',
    label: 'Live stage',
    description: 'A host goes live to present or stream. Members watch and chat.',
    whoPosts: 'Admins host, everyone watches',
    icon: Radio,
    suggestions: ['stage', 'workshops', 'office-hours'],
  },
];

const LEGACY_CHAT = new Set(['chat', 'code', 'resources', 'text']);

/** Display info for a stored channel type. */
export function channelTypeInfo(type: string | undefined): ChannelTypeInfo {
  const id: ChannelTypeId = LEGACY_CHAT.has(type ?? 'chat') ? 'chat' : (type as ChannelTypeId);
  return CHANNEL_TYPES.find(t => t.id === id) ?? CHANNEL_TYPES[0];
}

/** "Lagos Meetups!" → "lagos-meetups". */
export const toChannelSlug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
