/**
 * One place decides where an event should open.
 *
 * Instant/live sessions are a room-first experience: the event-details page is a
 * host console, not a public landing page. Scheduled events keep their public
 * details page and only use `/live/:id` for the live room itself.
 */

export function isInstantLiveSession(event: any): boolean {
  return event?.type === 'instant' || event?.isInstant === true;
}

export function eventDetailsPath(event: any): string {
  const id = event?.id ?? event?.eventId ?? event;
  return id ? `/events/${id}` : '/events';
}

export function liveRoomPath(event: any): string {
  const id = event?.id ?? event?.eventId ?? event;
  return id ? `/live/${id}` : '/live';
}

/** Where a card, notification or share link should send the viewer. */
export function eventHref(event: any): string {
  if (!event) return '/events';
  return isInstantLiveSession(event) ? liveRoomPath(event) : eventDetailsPath(event);
}

/**
 * Where to go after leaving a room. Attendees of an instant session should
 * never be dumped into the host-only details page.
 */
export function liveExitHref(event: any): string {
  if (!event) return '/feed';
  return isInstantLiveSession(event) ? '/feed' : eventDetailsPath(event);
}
