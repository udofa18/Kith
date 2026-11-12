/**
 * LiveKit webhooks keep the room's participant count authoritative.
 *
 * Point the LiveKit project's webhook at `/api/livekit/webhook`. Events are
 * verified with the API key/secret, so the counter cannot be spoofed by a
 * client. Only rooms that map to an existing event are written to.
 */
import { RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { firestoreAdmin } from './firebaseApp';
import { LIVE_ID_PATTERN } from './liveEventInfo';

export interface LivekitWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): LivekitWebhookResult => ({ status, body: { error } });
const liveKitUrl = () => process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || '';

async function exactCount(room: string, fallback: number | null): Promise<number | null> {
  const url = liveKitUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return fallback;

  try {
    const participants = await new RoomServiceClient(url, apiKey, apiSecret).listParticipants(room);
    return participants.length;
  } catch {
    return fallback;
  }
}

export async function handleLivekitWebhook(
  rawBody: Buffer | string,
  authorization?: string,
): Promise<LivekitWebhookResult> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return fail(503, 'LiveKit is not configured');

  let webhook;
  try {
    webhook = await new WebhookReceiver(apiKey, apiSecret).receive(rawBody.toString(), authorization);
  } catch {
    return fail(401, 'Invalid webhook signature');
  }

  const roomName = webhook.room?.name ?? '';
  // Community voice rooms and 1:1 calls also emit webhooks; only event rooms
  // have a matching event document.
  if (!LIVE_ID_PATTERN.test(roomName)) return { status: 200, body: { ok: true, ignored: true } };

  const db = firestoreAdmin();
  const eventRef = db.collection('events').doc(roomName);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return { status: 200, body: { ok: true, ignored: true } };

  const reported = typeof webhook.room?.numParticipants === 'number' ? webhook.room.numParticipants : null;
  const finished = webhook.event === 'room_finished';
  const count = finished ? 0 : await exactCount(roomName, reported);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    livekitUpdatedAt: now,
    updatedAt: now,
  };
  if (count !== null) patch.participantCount = count;

  try {
    await db.collection('eventSessions').doc(roomName).set(patch, { merge: true });
  } catch (error) {
    console.error('[livekit-webhook] Could not update the participant count:', error);
    return fail(500, 'Failed to update the room');
  }

  return {
    status: 200,
    body: { ok: true, event: webhook.event, participantCount: count },
  };
}
