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
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getSupabase } from '../../supabase';
import { dualWrite } from './utils';
import { firestoreNotificationToRow } from '../../lib/db-mappers';

/** The centre and the badge only need the recent page; older rows load on demand. */
const NOTIFICATIONS_PAGE_SIZE = 100;

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

/**
 * Notifications are still written to Firestore by `createNotification` and the channel-mention
 * batch (neither dual-writes). The Supabase `notifications` table is empty, so reading it from
 * here hid every row from the centre while the Firestore-backed badge still counted them. Reads
 * stay on Firestore until notification writes are migrated and the table is backfilled; mark-read
 * and delete still dual-write.
 */
export class NotificationsRepository {
  async listForUser(userId: string): Promise<NotificationRecord[]> {
    const { getDocs } = await import('firebase/firestore');
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(NOTIFICATIONS_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationRecord));
  }

  subscribe(
    userId: string,
    onData: (notifications: NotificationRecord[]) => void,
    onError?: (error: unknown) => void
  ): () => void {
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(NOTIFICATIONS_PAGE_SIZE)
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

  /**
   * Opening a conversation clears the matching message notifications, so the
   * bell does not keep pointing at a DM that has already been read.
   */
  async markConversationRead(userId: string, conversationId: string): Promise<void> {
    await dualWrite(
      async () => {
        const { getDocs } = await import('firebase/firestore');
        const snap = await getDocs(
          query(
            collection(db, 'notifications'),
            where('recipientId', '==', userId),
            where('relatedId', '==', conversationId),
            where('read', '==', false)
          )
        );
        const messageDocs = snap.docs.filter((d) =>
          ['message', 'message_request'].includes(String(d.data().type))
        );
        if (messageDocs.length === 0) return;

        const batch = writeBatch(db);
        messageDocs.forEach((d) => batch.update(d.ref, { read: true }));
        await batch.commit();
      },
      async () => {
        const { error } = await getSupabase()
          .from('notifications')
          .update({ read: true })
          .eq('recipient_id', userId)
          .eq('related_id', conversationId)
          .eq('read', false)
          .in('type', ['message', 'message_request']);
        if (error) throw error;
      },
      'markConversationNotificationsRead'
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
