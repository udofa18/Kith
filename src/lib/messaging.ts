/**
 * Pure helpers for direct-message conversations (no Firestore access here).
 *
 * A conversation is `pending` until the recipient accepts it, unless the two people follow each
 * other, in which case it starts `accepted`. A declined request stays hidden from the recipient
 * and keeps looking "sent" to the requester, so declining isn't announced.
 */
export type ConversationStatus = 'pending' | 'accepted' | 'declined';

export interface ConversationData {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: any;
  lastSenderId?: string;
  unreadCount?: { [uid: string]: number };
  readAt?: { [uid: string]: any };
  typing?: { [uid: string]: any };
  status?: ConversationStatus;
  requestedBy?: string;
  favouritedBy?: string[];
  mutedBy?: string[];
  otherUser?: any;
}

export function getConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export function getConversationStatus(conv: Pick<ConversationData, 'status'>): ConversationStatus {
  return conv.status || 'accepted';
}

export function isConversationAccepted(conv: Pick<ConversationData, 'status'>): boolean {
  return getConversationStatus(conv) === 'accepted';
}

export function isIncomingRequest(conv: ConversationData, userId: string): boolean {
  return getConversationStatus(conv) === 'pending' && conv.requestedBy !== userId;
}

/** Waiting on the other person. Declined requests look the same to the sender. */
export function isOutgoingRequest(conv: ConversationData, userId: string): boolean {
  const status = getConversationStatus(conv);
  return (status === 'pending' || status === 'declined') && conv.requestedBy === userId;
}

/** Requests the viewer declined are hidden from their inbox. */
export function isHiddenFor(conv: ConversationData, userId: string): boolean {
  return getConversationStatus(conv) === 'declined' && conv.requestedBy !== userId;
}

export function isFavourited(conv: ConversationData, userId: string): boolean {
  return conv.favouritedBy?.includes(userId) ?? false;
}

export function isMuted(conv: ConversationData, userId: string): boolean {
  return conv.mutedBy?.includes(userId) ?? false;
}

export const unreadFor = (conv: ConversationData, userId: string) => conv.unreadCount?.[userId] || 0;

export type MessageCategory = 'all' | 'unread' | 'requests';

export function filterConversations(
  conversations: ConversationData[],
  category: MessageCategory,
  userId: string,
  searchQuery: string,
): ConversationData[] {
  const visible = conversations.filter(c => !isHiddenFor(c, userId));
  const chats = visible.filter(c => !isIncomingRequest(c, userId));

  let filtered: ConversationData[];
  switch (category) {
    case 'unread':
      filtered = chats.filter(c => unreadFor(c, userId) > 0);
      break;
    case 'requests':
      filtered = visible.filter(c => isIncomingRequest(c, userId));
      break;
    default:
      filtered = chats;
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(c => {
      const username = c.otherUser?.username?.toLowerCase() || '';
      const displayName = c.otherUser?.displayName?.toLowerCase() || '';
      const lastMessage = c.lastMessage?.toLowerCase() || '';
      return username.includes(q) || displayName.includes(q) || lastMessage.includes(q);
    });
  }

  // Pinned chats first; Firestore already orders by most recent.
  return [...filtered].sort((a, b) => Number(isFavourited(b, userId)) - Number(isFavourited(a, userId)));
}

export function getCategoryCounts(conversations: ConversationData[], userId: string) {
  const visible = conversations.filter(c => !isHiddenFor(c, userId));
  return {
    all: visible.filter(c => !isIncomingRequest(c, userId)).length,
    unread: visible.filter(c => !isIncomingRequest(c, userId) && unreadFor(c, userId) > 0).length,
    requests: visible.filter(c => isIncomingRequest(c, userId)).length,
  };
}
