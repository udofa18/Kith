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
  return { status: 200, body: { token: await at.toJwt() } };
}
