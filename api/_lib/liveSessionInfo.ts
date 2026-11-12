/**
 * Public lobby information for a live room.
 *
 * The lobby, and the avatar peek that opens it, need the event title, host,
 * status and how many people are inside — without joining the LiveKit room and
 * without requiring a signed-in viewer. Access is still decided by the same
 * rules as the token endpoint, so a denied viewer gets a friendly reason rather
 * than a wall.
 */
import { RoomServiceClient } from 'livekit-server-sdk';
import { firestoreAdmin, uidFromAuthHeader } from './firebaseApp';
import {
  LIVE_ID_PATTERN,
  livePhase,
  publicEventInfo,
  toMillis,
  type LivePhase,
  type PublicEventInfo,
} from './liveEventInfo';
import { eventJoinError } from './livekitToken';

export interface LiveSessionInfoResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): LiveSessionInfoResult => ({ status, body: { error } });

const liveKitUrl = () => process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || '';

/** Participants currently connected to the LiveKit room, if admin creds exist. */
async function liveKitParticipantCount(room: string): Promise<number | null> {
  const url = liveKitUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;

  try {
    const client = new RoomServiceClient(url, apiKey, apiSecret);
    const participants = await client.listParticipants(room);
    return participants.length;
  } catch {
    // The room may not exist yet, which is a valid lobby state.
    return null;
  }
}

/**
 * Fallback for deployments without LiveKit admin credentials: each connected
 * client writes a presence document, and anything older than the stale window
 * is ignored so a crashed tab does not inflate the count forever.
 */
/**
 * The webhook stores an authoritative count on the session document. Use it
 * when it is recent, so public guest-only rooms (which cannot write presence
 * docs) still show a truthful number when the admin API is unavailable.
 */
async function storedParticipantCount(eventId: string): Promise<number | null> {
  try {
    const snapshot = await firestoreAdmin().collection('eventSessions').doc(eventId).get();
    const data = snapshot.data();
    if (!data) return null;
    const updated = toMillis(data.livekitUpdatedAt ?? data.updatedAt);
    if (typeof data.participantCount !== 'number') return null;
    if (!Number.isFinite(updated) || Date.now() - updated > 120_000) return null;
    return Math.max(0, data.participantCount);
  } catch {
    return null;
  }
}

async function presenceParticipantCount(eventId: string): Promise<number> {
  try {
    const snapshot = await firestoreAdmin()
      .collection('eventSessions').doc(eventId)
      .collection('participants').get();
    const cutoff = Date.now() - 90_000;
    return snapshot.docs.filter((doc) => {
      const seen = doc.data()?.lastSeenAt;
      return typeof seen === 'number' && seen > cutoff;
    }).length;
  } catch {
    return 0;
  }
}

async function userSummary(uid: string | undefined | null) {
  if (!uid) return null;
  try {
    const snapshot = await firestoreAdmin().collection('users').doc(uid).get();
    const user = snapshot.data() ?? {};
    return {
      uid,
      name: user.displayName || user.username || 'Member',
      username: user.username || '',
      photo: user.profileImage || user.photoURL || '',
    };
  } catch {
    return { uid, name: 'Member', username: '', photo: '' };
  }
}

export interface LiveSessionInfoBody extends Record<string, unknown> {
  event: PublicEventInfo;
  host: Awaited<ReturnType<typeof userSummary>>;
  coHosts: NonNullable<Awaited<ReturnType<typeof userSummary>>>[];
  phase: LivePhase;
  participantCount: number;
  countIsLive: boolean;
  viewer: {
    signedIn: boolean;
    isManager: boolean;
    joinable: boolean;
    reason: string | null;
  };
}

export async function getLiveSessionInfo(
  eventId: string,
  authorization?: string,
): Promise<LiveSessionInfoResult> {
  if (!LIVE_ID_PATTERN.test(eventId)) return fail(400, 'A valid eventId is required');

  const snapshot = await firestoreAdmin().collection('events').doc(eventId).get();
  if (!snapshot.exists) return fail(404, 'This room does not exist');
  const event = snapshot.data() ?? {};

  const uid = await uidFromAuthHeader(authorization);
  const viewerIdentity = uid ?? `guest_${Math.random().toString(36).slice(2, 12)}`;
  const check = await eventJoinError(eventId, viewerIdentity, !!uid);

  const managers: string[] = [event.hostId, ...(Array.isArray(event.coHostIds) ? event.coHostIds : [])]
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const isManager = !!uid && managers.includes(uid);
  const phase = livePhase(event);
  const joinable = isManager || (!check.error && phase !== 'ended');

  const host = await userSummary(event.hostId);
  const coHosts = (await Promise.all(
    (Array.isArray(event.coHostIds) ? event.coHostIds : []).map((id: string) => userSummary(id)),
  )).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof userSummary>>>[];

  // LiveKit admin credentials give an exact count. Without them, prefer the
  // webhook's recent count and fall back to client presence. Either way the
  // lobby never needs to join the room.
  const fromLiveKit = await liveKitParticipantCount(eventId);
  let participantCount = fromLiveKit;
  if (participantCount === null) {
    const [stored, presence] = await Promise.all([
      storedParticipantCount(eventId),
      presenceParticipantCount(eventId),
    ]);
    participantCount = stored !== null ? Math.max(stored, presence) : presence;
  }

  const body: LiveSessionInfoBody = {
    event: publicEventInfo(eventId, event, {
      // Keep descriptions and banners private to rooms the viewer could enter.
      includeContent: joinable || isManager || event.visibility === 'public' || event.visibility === 'unlisted',
    }),
    host,
    coHosts,
    phase,
    participantCount: participantCount ?? 0,
    countIsLive: fromLiveKit !== null,
    viewer: {
      signedIn: !!uid,
      isManager,
      joinable,
      reason: check.error,
    },
  };

  return { status: 200, body };
}
