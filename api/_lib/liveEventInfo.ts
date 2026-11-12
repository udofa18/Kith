/**
 * Shared shape for the public side of a live event.
 *
 * The room, the pre-join lobby and the avatar peek all need a small, safe slice
 * of the event. Keeping it in one place means the token response and the lobby
 * endpoint can never drift apart.
 */

export const LIVE_ID_PATTERN = /^[\w-]{1,128}$/;

export interface PublicEventInfo {
  id: string;
  title: string;
  description: string;
  type?: string;
  isInstant: boolean;
  visibility?: string;
  hostId?: string;
  coHostIds: string[];
  startDate?: unknown;
  endDate?: unknown;
  expiresAt?: unknown;
  status?: string;
  category?: string;
  banner?: string;
}

export function publicEventInfo(
  eventId: string,
  event: Record<string, any>,
  options: { includeContent?: boolean } = {},
): PublicEventInfo {
  const includeContent = options.includeContent !== false;
  const info: PublicEventInfo = {
    id: eventId,
    title: typeof event.title === 'string' ? event.title : '',
    description: includeContent && typeof event.description === 'string' ? event.description : '',
    type: event.type,
    // Older instant sessions may only carry `type`, so treat either marker as
    // instant. Routing, access and expiry all depend on this being consistent.
    isInstant: event.isInstant === true || event.type === 'instant',
    visibility: event.visibility,
    hostId: event.hostId,
    coHostIds: Array.isArray(event.coHostIds) ? event.coHostIds : [],
    startDate: event.startDate,
    endDate: event.endDate,
    expiresAt: event.expiresAt,
    status: event.status,
    category: event.category,
  };
  if (includeContent && typeof event.banner === 'string') info.banner = event.banner;
  return info;
}

export const toMillis = (value: any): number => {
  if (typeof value === 'string') return Date.parse(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return NaN;
};

export type LivePhase = 'live' | 'scheduled' | 'ended';

/**
 * A room is "ended" once the event says so, once its end date passes, or once
 * an instant room's short expiry passes.
 */
export function livePhase(event: Record<string, any>, now = Date.now()): LivePhase {
  const isInstant = event.type === 'instant' || event.isInstant === true;
  const end = toMillis(event.endDate);
  const expires = toMillis(event.expiresAt);
  if (event.status === 'ended') return 'ended';
  if (Number.isFinite(end) && now > end) return 'ended';
  if (isInstant && Number.isFinite(expires) && now > expires) return 'ended';
  if (event.status === 'live') return 'live';
  const start = toMillis(event.startDate);
  // Five minutes early counts as "live" so the room can open on time.
  if (Number.isFinite(start) && now >= start - 5 * 60_000) return 'live';
  return 'scheduled';
}
