/**
 * Server-authoritative live-session ending.
 *
 * A host or co-host asks the server to end a room. The server is the only place
 * that marks a session ended and tears down the LiveKit room, so a closed tab,
 * a second device, or a client with stale state can't leave the room running.
 */
import { RoomServiceClient } from 'livekit-server-sdk';
import { firestoreAdmin, uidFromAuthHeader } from './firebaseApp';

export interface EndSessionResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): EndSessionResult => ({ status, body: { error } });
const ID_PATTERN = /^[\w-]{1,128}$/;

const liveKitUrl = () =>
  process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || '';

/** Delete the LiveKit room if the deployment has room-admin credentials. */
async function deleteRoom(room: string) {
  const url = liveKitUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return;

  try {
    const rooms = new RoomServiceClient(url, apiKey, apiSecret);
    await rooms.deleteRoom(room);
  } catch (error) {
    // The room may already be empty; ending the Firestore session is the source
    // of truth, so a missing room must not turn into a failed request.
    console.warn(`[live-session] Could not delete LiveKit room ${room}:`, error);
  }
}

export async function endLiveSession(body: any, authorization?: string): Promise<EndSessionResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  if (!ID_PATTERN.test(eventId)) return fail(400, 'A valid eventId is required');

  const db = firestoreAdmin();
  const eventRef = db.collection('events').doc(eventId);
  const sessionRef = db.collection('eventSessions').doc(eventId);

  const snapshot = await eventRef.get();
  if (!snapshot.exists) return fail(404, 'Event not found');

  const event = snapshot.data() ?? {};
  const coHosts: string[] = Array.isArray(event.coHostIds) ? event.coHostIds : [];
  if (event.hostId !== uid && !coHosts.includes(uid)) {
    return fail(403, 'Only the host or a co-host can end this session');
  }

  const now = new Date().toISOString();
  const managers = [event.hostId, ...coHosts].filter((id): id is string => typeof id === 'string' && id.length > 0);

  // Closing a room is not the same as the event finishing. An instant session's
  // event only exists for the room, so it ends with it. A scheduled event keeps
  // its start/end date: the host may open the room early, close it, and still be
  // hosting on the scheduled date. Overwriting `endDate` here used to make that
  // event look permanently ended, even after the host edited the dates.
  const isInstant = event.type === 'instant' || event.isInstant === true;
  const scheduledEnd = typeof event.endDate === 'string' ? Date.parse(event.endDate) : NaN;
  const scheduledStatus = Number.isFinite(scheduledEnd) && scheduledEnd <= Date.now() ? 'ended' : 'upcoming';

  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(eventRef);
    if (!fresh.exists) return;

    transaction.update(
      eventRef,
      isInstant
        ? { status: 'ended', endDate: now, endedAt: now }
        : { status: scheduledStatus, endedAt: now },
    );
    transaction.set(
      sessionRef,
      {
        status: 'ended',
        endTime: now,
        endedAt: now,
        endedBy: uid,
        updatedAt: now,
      },
      { merge: true },
    );

    // Presence documents are what put the red ring on avatars. Remove them for
    // every manager so nobody stays "live" after the room is closed.
    for (const manager of managers) {
      transaction.delete(db.collection('liveStatus').doc(manager));
    }
  });

  await deleteRoom(eventId);

  return { status: 200, body: { ok: true, eventId } };
}
