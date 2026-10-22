import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  writeBatch,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getSupabase } from '../../supabase';
import { dualWrite, dualRead } from './utils';
import { supabaseNotificationToApp, firestoreNotificationToRow } from '../../lib/db-mappers';
import { shouldReadCollectionFromSupabase } from '../../lib/database-config';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface NotificationRecord {
  id: string;
  recipientId: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  type: string;
  category?: string;
  priority?: string;
  content: string;
  relatedId?: string;
  channelId?: string;
  read: boolean;
  createdAt: unknown;
  actors?: unknown[];
  mergedCount?: number;
}

export class NotificationsRepository {
  async listForUser(userId: string): Promise<NotificationRecord[]> {
    return dualRead(
      async () => {
        const { getDocs } = await import('firebase/firestore');
        const q = query(
          collection(db, 'notifications'),
          where('recipientId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationRecord));
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('notifications')
          .select('*')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((row) => supabaseNotificationToApp(row as Record<string, unknown>) as NotificationRecord);
      },
      'notifications'
    );
  }

  subscribe(
    userId: string,
    onData: (notifications: NotificationRecord[]) => void,
    onError?: (error: unknown) => void
  ): () => void {
    const useSupabase = shouldReadCollectionFromSupabase('notifications');

    if (useSupabase) {
      return this.subscribeSupabase(userId, onData, onError);
    }

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationRecord));
        onData(data);
      },
      (error) => onError?.(error)
    );

    return unsubscribe;
  }

  private subscribeSupabase(
    userId: string,
    onData: (notifications: NotificationRecord[]) => void,
    onError?: (error: unknown) => void
  ): () => void {
    let channel: RealtimeChannel | null = null;

    const fetchInitial = async () => {
      try {
        const items = await this.listForUser(userId);
        onData(items);
      } catch (err) {
        onError?.(err);
      }
    };

    fetchInitial();

    channel = getSupabase()
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          fetchInitial();
        }
      )
      .subscribe();

    return () => {
      if (channel) getSupabase().removeChannel(channel);
    };
  }

  async markRead(notificationId: string): Promise<void> {
    await dualWrite(
      () => updateDoc(doc(db, 'notifications', notificationId), { read: true }),
      async () => {
        const { error } = await getSupabase()
          .from('notifications')
          .update({ read: true })
          .eq('id', notificationId);
        if (error) throw error;
      },
      'markNotificationRead'
    );
  }

  async markAllRead(userId: string, notificationIds: string[]): Promise<void> {
    await dualWrite(
      async () => {
        const batch = writeBatch(db);
        notificationIds.forEach((id) => batch.update(doc(db, 'notifications', id), { read: true }));
        await batch.commit();
      },
      async () => {
        const { error } = await getSupabase()
          .from('notifications')
          .update({ read: true })
          .eq('recipient_id', userId)
          .in('id', notificationIds);
        if (error) throw error;
      },
      'markAllNotificationsRead'
    );
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await dualWrite(
      () => deleteDoc(doc(db, 'notifications', notificationId)),
      async () => {
        const { error } = await getSupabase().from('notifications').delete().eq('id', notificationId);
        if (error) throw error;
      },
      'deleteNotification'
    );
  }

  async create(data: Omit<NotificationRecord, 'id'> & { id?: string }): Promise<string> {
    const id = data.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);

    await dualWrite(
      async () => {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'notifications', id), { ...data, id });
        return id;
      },
      async () => {
        const row = firestoreNotificationToRow(id, data as unknown as Record<string, unknown>);
        const { error } = await getSupabase().from('notifications').insert(row as never);
        if (error) throw error;
        return id;
      },
      'createNotification'
    );

    return id;
  }
}

export const notificationsRepository = new NotificationsRepository();
