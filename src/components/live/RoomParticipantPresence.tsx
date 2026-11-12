import { useEffect, useRef } from 'react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useLocalParticipant } from '@livekit/components-react';
import { auth, db } from '../../firebase';
import { useLiveSession } from '../../contexts/LiveSessionContext';

/** How often a connected member refreshes their presence document. */
const PRESENCE_HEARTBEAT_MS = 30_000;

/**
 * Writes a lightweight presence document for the signed-in participant.
 *
 * This lives inside the root LiveKit room, not the room page, so the heartbeat
 * continues while the session is minimized and the host console can show who is
 * still connected. Guests have no authenticated identity and no Firestore write
 * permission, so only the LiveKit participant count covers them.
 */
export default function RoomParticipantPresence() {
  const { session } = useLiveSession();
  const { localParticipant } = useLocalParticipant();
  const participantRef = useRef(localParticipant);
  participantRef.current = localParticipant;

  const uid = auth.currentUser?.uid;
  const eventId = session.eventId;

  useEffect(() => {
    if (!uid || !eventId) return;

    let stopped = false;
    const presenceRef = doc(db, 'eventSessions', eventId, 'participants', uid);
    const managers: string[] = [session.eventData?.hostId, ...(session.eventData?.coHostIds || [])].filter(Boolean);
    const role = managers.includes(uid) ? 'host' : 'attendee';

    const publish = () => {
      if (stopped) return;
      const participant = participantRef.current;
      let metadata: Record<string, any> = {};
      try {
        metadata = participant?.metadata ? JSON.parse(participant.metadata) : {};
      } catch {
        metadata = {};
      }

      const data: Record<string, unknown> = {
        uid,
        role,
        lastSeenAt: Date.now(),
        updatedAt: new Date().toISOString(),
      };
      const name = participant?.name || auth.currentUser?.displayName || '';
      const photo = metadata.photoURL || metadata.avatar || auth.currentUser?.photoURL || '';
      if (name) data.name = name;
      if (photo) data.photo = photo;

      setDoc(presenceRef, data, { merge: true }).catch(() => undefined);
    };

    publish();
    const timer = setInterval(publish, PRESENCE_HEARTBEAT_MS);
    // Mobile browsers throttle timers while hidden. Refresh immediately when
    // the tab comes back so the console does not show a stale attendee.
    const onVisible = () => {
      if (document.visibilityState === 'visible') publish();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      deleteDoc(presenceRef).catch(() => undefined);
    };
  }, [uid, eventId, session.eventData?.hostId, session.eventData?.coHostIds?.join(',')]);

  return null;
}
