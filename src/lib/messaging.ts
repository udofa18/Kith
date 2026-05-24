export type ConversationStatus = 'pending' | 'accepted' | 'declined';

export interface ConversationData {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: any;
  unreadCount?: { [uid: string]: number };
  status?: ConversationStatus;
  requestedBy?: string;
  favouritedBy?: string[];
  otherUser?: any;
}

export function getConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export function getConversationStatus(conv: ConversationData): ConversationStatus {
  return conv.status || 'accepted';
}

export function isConversationAccepted(conv: ConversationData): boolean {
  return getConversationStatus(conv) === 'accepted';
}

export function isIncomingRequest(conv: ConversationData, userId: string): boolean {
  return getConversationStatus(conv) === 'pending' && conv.requestedBy !== userId;
}

export function isOutgoingRequest(conv: ConversationData, userId: string): boolean {
  return getConversationStatus(conv) === 'pending' && conv.requestedBy === userId;
}

export function isDeclined(conv: ConversationData): boolean {
  return getConversationStatus(conv) === 'declined';
}

export function isFavourited(conv: ConversationData, userId: string): boolean {
  return conv.favouritedBy?.includes(userId) ?? false;
}

export type MessageCategory = 'all' | 'unread' | 'favourites' | 'requests';

export function filterConversations(
  conversations: ConversationData[],
  category: MessageCategory,
  userId: string,
  searchQuery: string
): ConversationData[] {
  const visible = conversations.filter(c => !isDeclined(c));

  let filtered: ConversationData[];
  switch (category) {
    case 'unread':
      filtered = visible.filter(c => (c.unreadCount?.[userId] || 0) > 0);
      break;
    case 'favourites':
      filtered = visible.filter(c => isFavourited(c, userId));
      break;
    case 'requests':
      filtered = visible.filter(c => isIncomingRequest(c, userId));
      break;
    default:
      filtered = visible.filter(
        c => isConversationAccepted(c) || isOutgoingRequest(c, userId)
      );
  }

  if (!searchQuery.trim()) return filtered;

  const q = searchQuery.toLowerCase();
  return filtered.filter(c => {
    const username = c.otherUser?.username?.toLowerCase() || '';
    const displayName = c.otherUser?.displayName?.toLowerCase() || '';
    const lastMessage = c.lastMessage?.toLowerCase() || '';
    return username.includes(q) || displayName.includes(q) || lastMessage.includes(q);
  });
}

export function getCategoryCounts(conversations: ConversationData[], userId: string) {
  const visible = conversations.filter(c => !isDeclined(c));
  return {
    all: visible.filter(c => isConversationAccepted(c) || isOutgoingRequest(c, userId)).length,
    unread: visible.filter(c => (c.unreadCount?.[userId] || 0) > 0).length,
    favourites: visible.filter(c => isFavourited(c, userId)).length,
    requests: visible.filter(c => isIncomingRequest(c, userId)).length,
  };
}
