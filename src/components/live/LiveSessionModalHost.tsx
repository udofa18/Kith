import { useEffect, useState } from 'react';
import LiveInviteModal from './LiveInviteModal';
import {
  LIVE_SESSION_MODAL_EVENT,
  openLiveSessionModal,
  parseLiveSessionLink,
  type LiveSessionModalRequest,
} from '../../lib/liveSessionModal';

/**
 * One global host for live-session invites.
 *
 * Fresh notifications push a request through a custom event; live links tapped
 * in a DM, community post or link preview are caught here before the browser
 * can open them in a new tab. Requests are queued so two invites never fight
 * over the screen.
 */
export default function LiveSessionModalHost() {
  const [requests, setRequests] = useState<LiveSessionModalRequest[]>([]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<LiveSessionModalRequest>).detail;
      if (!detail?.eventId) return;

      setRequests((current) =>
        current.some((item) => item.eventId === detail.eventId)
          ? current
          : [...current, detail],
      );
    };

    // Any live link that would otherwise leave the app in a new tab becomes an
    // in-app modal. In-app navigation links (no target) keep working normally.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target !== '_blank') return;

      const eventId = parseLiveSessionLink(anchor.getAttribute('href'));
      if (!eventId) return;

      event.preventDefault();
      event.stopPropagation();
      openLiveSessionModal({ eventId, source: 'link' });
    };

    window.addEventListener(LIVE_SESSION_MODAL_EVENT, onRequest);
    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener(LIVE_SESSION_MODAL_EVENT, onRequest);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const current = requests[0];
  if (!current) return null;

  return (
    <LiveInviteModal
      key={`${current.eventId}:${current.notificationId ?? ''}`}
      request={current}
      onClose={() => setRequests((queue) => queue.filter((item) => item !== current))}
    />
  );
}
