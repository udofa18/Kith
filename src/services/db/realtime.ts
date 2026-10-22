/**
 * Supabase Realtime subscription helpers.
 * Use when replacing Firestore onSnapshot listeners.
 */

import { getSupabase } from '../../supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeSubscription {
  unsubscribe: () => void;
}

export function subscribeToTableChanges(
  channelName: string,
  table: string,
  filter: string | undefined,
  onChange: () => void
): RealtimeSubscription {
  const channel = getSupabase()
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter ? { filter } : {}),
      },
      () => onChange()
    )
    .subscribe();

  return {
    unsubscribe: () => {
      getSupabase().removeChannel(channel);
    },
  };
}

export function subscribeToNotifications(
  userId: string,
  onChange: () => void
): RealtimeSubscription {
  return subscribeToTableChanges(
    `notifications:${userId}`,
    'notifications',
    `recipient_id=eq.${userId}`,
    onChange
  );
}

export function subscribeToChannelMessages(
  channelId: string,
  onChange: () => void
): RealtimeSubscription {
  return subscribeToTableChanges(
    `channel_messages:${channelId}`,
    'channel_messages',
    `channel_id=eq.${channelId}`,
    onChange
  );
}

export function subscribeToConversationMessages(
  conversationId: string,
  onChange: () => void
): RealtimeSubscription {
  return subscribeToTableChanges(
    `conversation_messages:${conversationId}`,
    'conversation_messages',
    `conversation_id=eq.${conversationId}`,
    onChange
  );
}
