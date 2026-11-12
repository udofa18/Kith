/**
 * LiveKit access tokens, shared by api/livekit-token.ts (Vercel) and server.ts (local dev).
 *
 * - Signed-in callers (Bearer Firebase ID token) always join as their own uid.
 * - Guests (live sessions allow them) must use a `guest_` identity, so nobody can pose as a member.
 * - 1:1 call rooms (`call_<sessionId>`) need a signed-in participant of that call. Membership is
 *   checked by reading the call document with the caller's own token, so Firestore rules decide.
 * - Community rooms (`voice_<communityId>_<channelId>`, `stream_<communityId>_<streamId>`) need a
 *   signed-in member of that community.
 */
import admin from 'firebase-admin';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { firestoreAdmin } from './firebaseApp';
import { publicEventInfo, toMillis } from './liveEventInfo';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0475896362';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-a6c9e366-2e98-4fcd-bf9b-04eac80f64b4';

// Initialised lazily so a host app (server.ts) can set up firebase-admin with its own options first.
const adminAuth = () => {
  if (admin.apps.length === 0) admin.initializeApp({ projectId: PROJECT_ID });
  return admin.auth();
};

export interface TokenResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): TokenResult => ({ status, body: { error } });

async function readDoc(path: string, idToken: string) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${path}`,
    { headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(5000) },
  ).catch(() => null);
  return res?.ok ? res.json() : null;
}

const isCommunityMember = async (communityId: string, uid: string, idToken: string) =>
  /^[\w-]{1,128}$/.test(communityId) && !!(await readDoc(`communities/${communityId}/members/${uid}`, idToken));

/**
 * Event rooms are ordinary Firestore event ids. The server decides who may join
 * from the event document, not from anything the client sends:
 * - hosts/co-hosts always may join while the room is live
 * - public and unlisted rooms are link-accessible (guests included)
 * - instant rooms are link-accessible too: the shared invite is the key, while
 *   `visibility` only controls where the room can be discovered
 * - community rooms require membership, follower rooms require following
 * - paid events require a registration
 */
interface EventJoinCheck {
  error: string | null;
  event?: Record<string, any>;
}

export async function eventJoinError(eventId: string, identity: string, signedIn: boolean): Promise<EventJoinCheck> {
  if (!/^[\w-]{1,128}$/.test(eventId)) return { error: 'Invalid room' };

  const snapshot = await firestoreAdmin().collection('events').doc(eventId).get();
  if (!snapshot.exists) return { error: 'This room does not exist' };
  const event = snapshot.data() ?? {};
  const checked = { event };

  if (event.status === 'ended') return { ...checked, error: 'This session has ended' };
  const coHosts: string[] = Array.isArray(event.coHostIds) ? event.coHostIds : [];
  const isManager = signedIn && (event.hostId === identity || coHosts.includes(identity));
  const isInstant = event.type === 'instant' || event.isInstant === true;

  // An instant room has a hard expiry even if its status has not been flipped
  // to `ended` yet (for example after a crashed host tab).
  if (isInstant) {
    const expires = toMillis(event.expiresAt);
    const end = toMillis(event.endDate);
    if (
      (Number.isFinite(expires) && Date.now() > expires) ||
      (Number.isFinite(end) && Date.now() > end)
    ) {
      return { ...checked, error: 'This session has ended' };
    }
  }

  // A host may not have pressed "Start" yet even though the scheduled window is
  // open. Allow the room during that window; block it before and after.
  const start = toMillis(event.startDate);
  const end = toMillis(event.endDate);
  const now = Date.now();
  const inWindow = Number.isFinite(start) && now >= start - 5 * 60_000 && (!Number.isFinite(end) || now <= end);
  if (!isManager && event.status !== 'live' && !inWindow) {
    return { ...checked, error: 'This session has not started yet' };
  }

  if (isManager) return { ...checked, error: null };

  const visibility = event.visibility;
  // For instant sessions the link is the invite. `visibility` controls where the
  // room is discovered (feed, profile, search), not who may use a link the host
  // shared. This is what makes "anyone with the link can drop in" true for
  // followers-only / mutuals-only sessions. Scheduled events keep the stricter
  // audience rules below.
  if (isInstant) {
    // Still enforce tickets for paid rooms.
  } else if (visibility === 'public' || visibility === 'unlisted') {
    // Still enforce tickets for paid rooms.
  } else if (visibility === 'community') {
    if (!signedIn || typeof event.communityId !== 'string') {
      return { ...checked, error: 'Join this community to enter the room' };
    }
    const member = await firestoreAdmin()
      .collection('communities').doc(event.communityId)
      .collection('members').doc(identity).get();
    if (!member.exists) return { ...checked, error: 'Join this community to enter the room' };
  } else if (visibility === 'followers') {
    if (!signedIn || typeof event.hostId !== 'string') {
      return { ...checked, error: 'Follow the host to join this room' };
    }
    const following = await firestoreAdmin()
      .collection('users').doc(identity)
      .collection('following').doc(event.hostId).get();
    if (!following.exists) return { ...checked, error: 'Follow the host to join this room' };
  } else {
    return { ...checked, error: 'This room is private' };
  }

  if (event.isPaid === true) {
    if (!signedIn) return { ...checked, error: 'A ticket is required to join this room' };
    const registration = await firestoreAdmin()
      .collection('events').doc(eventId)
      .collection('registrations').doc(identity).get();
    if (!registration.exists) return { ...checked, error: 'A ticket is required to join this room' };
  }

  return { ...checked, error: null };
}

async function isCallParticipant(callId: string, uid: string, idToken: string): Promise<boolean> {
  if (!/^[\w-]{1,128}$/.test(callId)) return false;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/callSessions/${callId}`,
    { headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(5000) },
  ).catch(() => null);
  if (!res?.ok) return false;
  const doc = (await res.json()) as { fields?: { participantIds?: { arrayValue?: { values?: { stringValue?: string }[] } } } };
  return (doc.fields?.participantIds?.arrayValue?.values ?? []).some(v => v.stringValue === uid);
}

export async function issueLivekitToken(body: any, authorization?: string): Promise<TokenResult> {
  const room = typeof body?.eventId === 'string' ? body.eventId : '';
  const username = typeof body?.username === 'string' ? body.username.slice(0, 80) : '';
  const photoURL = typeof body?.photoURL === 'string' ? body.photoURL.slice(0, 1000) : '';
  if (!room || !username) return fail(400, 'Missing required fields');

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return fail(500, 'Calls are not configured on this server');

  let identity: string;
  let idToken = '';
  if (authorization?.startsWith('Bearer ')) {
    idToken = authorization.slice(7);
    try {
      identity = (await adminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return fail(401, 'Invalid or expired session');
    }
  } else {
    identity = typeof body?.userId === 'string' ? body.userId : '';
    if (!/^guest_[\w-]{1,40}$/.test(identity)) return fail(401, 'Sign in required');
  }

  const community = room.match(/^(?:voice|stream)_([\w-]+?)_[\w-]+$/);
  if (community) {
    if (!idToken) return fail(401, 'Sign in required');
    if (!(await isCommunityMember(community[1], identity, idToken))) return fail(403, 'Join the community to enter this room');
  }

  if (room.startsWith('call_')) {
    if (!idToken) return fail(401, 'Sign in required');
    if (!(await isCallParticipant(room.slice(5), identity, idToken))) return fail(403, "You're not part of this call");
  }

  // Everything that is not a community voice/stage room or a 1:1 call is a live event room.
  let eventInfo: ReturnType<typeof publicEventInfo> | undefined;
  if (!community && !room.startsWith('call_')) {
    const check = await eventJoinError(room, identity, !!idToken);
    if (check.error) return fail(idToken ? 403 : 401, check.error);
    // Guests cannot read unlisted event documents, so the token carries the
    // routing fields and display basics instead.
    if (check.event) eventInfo = publicEventInfo(room, check.event, { includeContent: true });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: username,
    metadata: JSON.stringify({ avatar: photoURL }),
    ttl: '2h',
  });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return {
    status: 200,
    body: {
      token: await at.toJwt(),
      ...(eventInfo ? { event: eventInfo } : {}),
    },
  };
}
