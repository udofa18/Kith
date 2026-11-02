import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { queueAudit } from './communityRoles';

type ChannelRef = { id: string; name?: string };

/** Deletes up to 400 messages (and the poll votes under them) per round until none are left. */
async function emptyMessages(communityId: string, channelId: string) {
  const messages = collection(db, 'communities', communityId, 'channels', channelId, 'messages');
  for (;;) {
    const snap = await getDocs(query(messages, limit(200)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      // Votes sit in a subcollection, which isn't removed along with the message.
      if (d.data().poll) (await getDocs(collection(d.ref, 'votes'))).docs.forEach(v => batch.delete(v.ref));
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

/** Removes a channel together with everything in it. */
export async function deleteChannelWithMessages(communityId: string, channel: ChannelRef) {
  await emptyMessages(communityId, channel.id);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'communities', communityId, 'channels', channel.id));
  queueAudit(batch, communityId, { action: 'channel.delete', targetName: channel.name });
  await batch.commit();
}

/** Empties a channel but keeps the channel itself. */
export async function clearChannelMessages(communityId: string, channel: ChannelRef) {
  await emptyMessages(communityId, channel.id);
  const batch = writeBatch(db);
  batch.update(doc(db, 'communities', communityId, 'channels', channel.id), { messageCount: 0 });
  queueAudit(batch, communityId, { action: 'channel.clear', targetName: channel.name });
  await batch.commit();
}
