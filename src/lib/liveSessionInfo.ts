import axios from 'axios';
import { auth } from '../firebase';

export interface LivePerson {
  uid: string;
  name: string;
  username: string;
  photo: string;
}

export interface LiveEventPreview {
  id: string;
  title: string;
  description: string;
  type?: string;
  isInstant: boolean;
  visibility?: string;
  hostId?: string;
  coHostIds: string[];
  startDate?: string;
  endDate?: string;
  expiresAt?: string;
  status?: string;
  category?: string;
  banner?: string;
}

export interface LiveSessionInfo {
  event: LiveEventPreview;
  host: LivePerson | null;
  coHosts: LivePerson[];
  phase: 'live' | 'scheduled' | 'ended';
  participantCount: number;
  /** True when the count came from LiveKit rather than client presence docs. */
  countIsLive: boolean;
  viewer: {
    signedIn: boolean;
    isManager: boolean;
    joinable: boolean;
    reason: string | null;
  };
}

/**
 * Why the lobby details could not be loaded.
 *
 * `roomMissing` is deliberately narrow: only our own API's JSON 404 counts as
 * "the room is really gone". A bare platform 404 (an HTML page or an empty
 * body) usually means the endpoint is not deployed, and callers should let the
 * viewer try to join rather than claim the invite is invalid.
 */
export class LiveSessionInfoError extends Error {
  readonly status: number | null;
  readonly roomMissing: boolean;

  constructor(message: string, status: number | null, roomMissing: boolean) {
    super(message);
    this.name = 'LiveSessionInfoError';
    this.status = status;
    this.roomMissing = roomMissing;
  }
}

function toInfoError(error: unknown): LiveSessionInfoError {
  if (error instanceof LiveSessionInfoError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const body = error.response?.data as { error?: unknown } | undefined;
    const serverMessage = typeof body?.error === 'string' ? body.error : null;
    return new LiveSessionInfoError(
      serverMessage || error.message,
      status,
      status === 404 && !!serverMessage,
    );
  }
  return new LiveSessionInfoError(
    error instanceof Error ? error.message : 'Failed to load the room',
    null,
    false,
  );
}

/** Lobby/peek data for one room. Never joins the room or mints a token. */
export async function fetchLiveSessionInfo(eventId: string): Promise<LiveSessionInfo> {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);

  let data: unknown;
  try {
    const response = await axios.get('/api/live-session/info', {
      params: { eventId },
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    });
    data = response.data;
  } catch (error) {
    throw toInfoError(error);
  }

  // A missing route that rewrites to the SPA returns HTML with a 200. Treat any
  // unexpected body as a transient error, not as a missing room.
  const info = data as LiveSessionInfo | null;
  if (!info || typeof info !== 'object' || !info.event || typeof info.event.id !== 'string') {
    throw new LiveSessionInfoError('Unexpected live session response', 502, false);
  }
  return info;
}
