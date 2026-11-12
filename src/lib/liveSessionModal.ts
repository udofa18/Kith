/**
 * Opening a live room in-app.
 *
 * Invites arrive through several surfaces (notifications, DMs, community posts,
 * link previews). They all funnel through one custom event so a single modal
 * host decides what to show, and a live link never opens a new tab.
 */

export const LIVE_SESSION_MODAL_EVENT = 'kith:open-live-session';

export type LiveSessionModalSource = 'notification' | 'message' | 'community' | 'post' | 'link';

export interface LiveSessionModalRequest {
  eventId: string;
  notificationId?: string;
  source?: LiveSessionModalSource;
}

export function openLiveSessionModal(request: LiveSessionModalRequest) {
  if (!request?.eventId || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LiveSessionModalRequest>(LIVE_SESSION_MODAL_EVENT, { detail: request }),
  );
}

/**
 * Extract the event id from a same-origin live-session link.
 *
 * Both `/live/:id` and the legacy `/events/:id/live` route count. Regular event
 * pages (`/events/:id`) do not: those are the public details page, not a room.
 * The host console (`/live/:id/console`) is intentionally excluded so a host
 * can still open it normally.
 */
export function parseLiveSessionLink(
  href: string | null | undefined,
  origin?: string,
): string | null {
  if (!href) return null;

  const base =
    origin || (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'http://localhost');

  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }

  if (url.origin !== base) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const path = url.pathname.replace(/\/+$/, '');
  const match = path.match(/^\/live\/([^/]+)$/) || path.match(/^\/events\/([^/]+)\/live$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return match[1] || null;
  }
}

/** Notification-shaped fields used to recognise an invite. */
export interface LiveInviteNotificationLike {
  type?: string | null;
  content?: string | null;
  relatedId?: string | null;
  liveInvite?: boolean | null;
}

/**
 * True when a notification is inviting the recipient into a live room.
 *
 * New invites carry an explicit `liveInvite` flag. Older message/event invites
 * are recognised by their wording, which has always named the session type.
 */
export function isLiveInviteNotification(notification: LiveInviteNotificationLike): boolean {
  if (!notification.relatedId) return false;
  if (notification.liveInvite === true) return true;

  const content = notification.content || '';

  if (notification.type === 'event_invite') {
    return /live now|live session|instant session/i.test(content);
  }

  if (notification.type === 'message') {
    return /invited you to (an? )?(instant|live) session/i.test(content);
  }

  return false;
}
